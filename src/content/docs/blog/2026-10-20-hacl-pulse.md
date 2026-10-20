---
title: "hacl-pulse: Re-verifying HACL* in Pulse, with Agents"
description: A from-scratch reimplementation of the HACL* verified crypto library in F* and Pulse, built with AI agents in six weeks, at feature parity and close to HACL*'s performance.
author: Gabriel Ebner
---

* Author: Gabriel Ebner

> **TL;DR:** [hacl-pulse](https://github.com/FStarLang/hacl-pulse) is a new,
> from-scratch reimplementation of the
> [HACL\*](https://github.com/hacl-star/hacl-star) verified cryptographic
> library. It is written in [F\*](https://fstar-lang.org) and
> [Pulse](https://fstar-lang.org/tutorial/book/pulse/pulse.html) and extracted
> to C by F\*'s new Custard backend. It covers every algorithm HACL\* offers
> (though not yet its platforms, bindings, or agile EverCrypt layer). It also adds things HACL\* doesn't have:
> ML-KEM (FIPS 203), ML-DSA (FIPS 204), and HPKE in all four modes. It proves
> functional-correctness theorems about the specs themselves, including the
> elliptic-curve group laws that HACL\* admits. On the target machine every
> primitive runs within 1.32x of HACL\*'s best configuration, and 16 of them
> run faster. It took about six weeks, and nearly all of the code was written
> by AI agents running Claude Opus 5 and Opus 5.5.

## Why rebuild HACL\*?

HACL\* is one of the success stories of formal verification. Its verified C
code ships in Firefox, Linux, the Tezos and Python ecosystems, and elsewhere.
It was written over many years in Low\*, an embedded subset of F\* designed
for C-like code, and it carries some workarounds for features F\* did not have
at the time: a single integer type indexed by width and secrecy, a custom
tactic to specialize width-generic code, and 32-bit lengths everywhere. For
its fastest paths it relies on [Vale](https://github.com/project-everest/vale),
a separate framework for writing and verifying x86-64 assembly.

F\* has changed a lot since then. [Pulse](https://fstar-lang.org/tutorial/book/pulse/pulse.html)
is now a mature separation-logic language for imperative code, type classes
are first-class, and
[Custard](https://github.com/FStarLang/FStar/blob/master/doc/ref/custard.md)
extracts Pulse straight to C and monomorphizes type-class code as it goes.
Agents, as we've written in [earlier](/blog/2026-02-04-nik-agentic-pop)
[posts](/blog/2026-03-06-autoclrs), can now carry most of the proof
engineering. So we asked a simple question: **what would HACL\* look like if
we wrote it today, with today's language and today's tools?**

The answer is not a port. Wherever HACL\* worked around a missing language
feature, hacl-pulse uses that feature directly.

## What's in the box

hacl-pulse covers the algorithms in HACL\*'s C and F\* APIs. All of the
following are specified, implemented, verified, extracted to C, and tested
against published vectors (34 C test harnesses):

* **Hashes:** SHA-1, SHA-2, SHA-3/SHAKE, BLAKE2s/b, MD5. Each comes one-shot
  and incremental.
* **MACs and KDFs:** HMAC (one-shot and incremental), HKDF, Poly1305.
* **Ciphers and AEADs:** ChaCha20, Salsa20/XSalsa20, AES-GCM,
  ChaCha20-Poly1305, and the NaCl `secretbox`/`box` API.
* **Curves:** X25519, Ed25519, P-256, and secp256k1 (with low-S for Bitcoin).
* **Bignum:** generic Montgomery arithmetic, constant-time modexp, FFDHE (all
  five RFC 7919 groups), and RSA-PSS.
* **Randomness:** HMAC-DRBG with an OS entropy shim.
* **Post-quantum:** FrodoKEM (all four parameter sets), plus **ML-KEM** and
  **ML-DSA** in all three parameter sets each. HACL\* doesn't have ML-KEM or
  ML-DSA at all.
* **HPKE** (RFC 9180) in all four modes, with all three AEADs. The HACL\*
  distribution ships Base mode only, over ChaCha20-Poly1305 only.

That's roughly 157,000 lines of F\* and Pulse (about 57K of specification and
94K of implementation and proof). It extracts to a single `Hacl.c` of about
56K lines. There is no assembly and no Vale dependency. Hardware fast paths
(AES-NI, PCLMULQDQ, the SHA extensions, AVX2, and AVX-512) are C intrinsics
behind narrow, axiomatized interfaces, selected at run time.

## Modernizing the design

hacl-pulse departs from HACL\*'s design in five places. The
[README](https://github.com/FStarLang/hacl-pulse#the-five-design-commitments)
explains them in detail. In brief:

1. **Secret integers are types, not an index.** Each secret width is its own
   abstract type, and its interface exposes only constant-time operations.
   You can't compare a secret, divide by it, or branch on it. The only way to
   declassify is through a single module, so an audit of where secrets become
   public is a search for one name. In the generated C these types are just
   `uint32_t` and friends.

2. **Width-generic code is a type class, not a tactic.** SHA-2's core is
   written once against a `word` type class. Custard monomorphizes it into a
   `uint32_t` copy and a `uint64_t` copy, with no indirection left. Algorithms
   are parameter records, so SHA-224/256/384/512 become four specialized C
   functions with their constants as literals.

3. **`size_t`, not 32-bit lengths.** Every length, offset, and count is
   `size_t`, so the API never truncates a 64-bit length.

4. **No assembly.** The trusted code on the C side is small and explicit: the
   entropy shim, the vector intrinsics, a 64-bit add-with-carry, and memory
   wiping.

5. **Scratch memory is wiped, and the type system makes you do it.** Every
   stack array produces a ghost `must_wipe` resource that only `wipe`
   consumes. Pulse rejects any function that ends still holding a resource,
   so a forgotten wipe is a *type error* ("Leftover resources: Mem.must_wipe
   buf"), not a code-review comment. No stack array is sized by caller input.
   Build-time lints and a `-fstack-usage` check enforce both rules.

## More than refinement: proving the specs mean what they should

A refinement proof shows that the C computes what the spec says. It doesn't
show that the spec is right. Test vectors are part of the answer to that.
The other part is a set of theorems *about the specifications*: the statements
a cryptographer would write down first.

* **AEADs:** decrypt inverts encrypt for ChaCha20-Poly1305, AES-GCM, and NaCl
  secretbox and box.
* **Key exchange:** both parties agree for X25519, P-256 and secp256k1 ECDH,
  and all five FFDHE groups.
* **Signatures:** an honest signature verifies for Ed25519, ECDSA on both
  curves, and RSA-PSS.
* **KEMs and HPKE:** encapsulation/decapsulation and seal/open round trips for
  every HPKE mode, ML-KEM, and FrodoKEM. The lattice KEM theorems take an
  explicit noise bound as a hypothesis.

Along the way, the library proves several facts that are often assumed:

* the P-256 and secp256k1 group orders are prime (Pocklington certificates);
* the ML-KEM NTT is a ring isomorphism;
* the X25519 Montgomery ladder computes a scalar multiple on the Edwards group;
* **the group laws (closure, associativity, commutativity) for Ed25519,
  P-256, and secp256k1**, with no `admit` and no `assume`.

The last one is worth highlighting. In HACL\*, the corresponding lemmas are
`admit()`. HACL\*'s windowed Ed25519, windowed P-256, and GLV secp256k1 all
rest on those admitted facts. In hacl-pulse, the windowed scalar
multiplications on all three curves rest on proofs. These proofs reduce
every statement to polynomial identities modulo the curve equation. A small
verified polynomial normalizer then checks those identities.

## Performance

A verified library people won't use because it's slow isn't much of a win, so
performance got as much attention as proofs. The headline comparison is
against **HACL\* configured for the machine and allowed everything it has**:
Vale assembly, AVX2, and BMI2/ADX. That's what a HACL\* user actually gets.

On an AMD EPYC (Zen 3) with gcc 15:

* **16 of 26 benchmarks are faster than HACL\*'s best**, and **every
  benchmark is within 1.32x**.
* Salsa20 and secretbox run at 0.24x of HACL\*'s time (HACL\* has no vector
  Salsa20). SHA-512, SHA-3, and SHAKE run at about 0.55x. RSA-PSS
  verification runs at 0.44x.
* P-256 is faster across the board (0.64x to 0.76x), thanks to a field
  specialized to its prime and a four-base-point fixed-base table.
* The slowest rows are X25519 and Ed25519 signing (about 1.3x, against
  HACL\*'s BMI2/ADX assembly) and MD5. Under clang, X25519 matches HACL\*.

The repository also benchmarks against OpenSSL, AWS-LC, libsodium, libjade,
Firedancer, and dalek. There, hacl-pulse is the fastest at secp256k1 signing
(about 4x ahead of the next library). Most primitives are within 1.1x to 1.4x
of the fastest library. The largest remaining gaps are SHA-512 and big-number
modexp (about 2x, against hand-tuned assembly).

Every optimization is recorded in
[`bench/REPORT.md`](https://github.com/FStarLang/hacl-pulse/blob/master/bench/REPORT.md):
the measurement that motivated it, the experiment that confirmed or killed it,
and the result.

## Verification makes optimization safe

Optimized cryptographic code is where bugs like to hide. The fast path
handles a carry slightly differently, an unrolled loop drops a lane, or a
deferred reduction overflows on an input nobody tested. In an unverified
library, every speedup is a trade between performance and confidence. You
fuzz, compare against the slow version, and hope.

In hacl-pulse that trade doesn't exist. **An optimized implementation has
to prove the same specification as the code it replaces.** The postcondition
of SHA-3's permutation is the spec's permutation, whether the loop is rolled or
unrolled. The postcondition of X25519's field multiply is multiplication
modulo 2^255 - 19, whether the field uses five 51-bit limbs or four 64-bit
limbs. If the change verifies, it's correct, and nothing above it needs to be
re-examined. If it doesn't verify, it doesn't get merged.

That changed what we were willing to try. The performance log in
[`bench/REPORT.md`](https://github.com/FStarLang/hacl-pulse/blob/master/bench/REPORT.md)
has some 70 parts, and many of the changes are ones you'd normally approach
with great caution:

* **Unrolling Keccak by hand.** The theta, rho/pi, and chi steps are written
  out lane by lane in the Pulse source, 25 calls each. One helper is
  verified against a symbolic lane index and then applied to 25 literal
  ones, so the solver never sees a nested sequence update. The result is
  straight-line C, and SHA-3 now runs at about half of HACL\*'s time.
* **Changing a field representation.** Curve25519 moved from eight 32-bit limbs to
  51-bit limbs, then to a straight-line multiply, and then to 64-bit limbs.
  Every step changed the carry discipline, which is exactly where field
  arithmetic usually breaks.
* **Deferring algebra.** Four-way GHASH now adds four raw 256-bit products and
  reduces them once instead of four times. That's only correct because the
  reduction is linear, and the proof makes that explicit with three small
  lemmas about GF(2^128). GHASH went from 2.11 to 1.28 cycles per byte.
* **Windowed, table-driven scalar multiplication** on all three curves,
  4-bit windows and triangle squaring in modexp, and a P-256 field
  specialized to its prime. Each one replaces a simple algorithm with a much
  less obvious one that has to compute the same value.

This matters even more when agents do the work. An agent can propose and
benchmark dozens of optimizations in an afternoon, far more than any human
could review line by line for correctness. With verification, review can
focus on *whether the change is worth it*, while F\* checks *whether it's
right*. The loop becomes: hypothesize, implement, verify, measure, and keep
or revert. The report records that loop over and over, including the
experiments that didn't pay.

In practice, the cost of an optimization shows up as proof effort, not as
bugs. The recurring lesson in the report is that when a proof of an
optimized routine is slow, the fix is to "take the reasoning out of the
context": split the routine into helpers with tight specifications rather
than raising solver limits. One BLAKE2 change took a module from an
18-minute timeout to 25 seconds this way.

### Three caveats

"If it verifies, it's correct" means correct *with respect to the spec, under
the stated assumptions*. Three caveats came up during the optimization work.
Each one marks a place where something besides the proof has to do the job.

**Constant-time execution is not in the spec.** Windowed scalar
multiplication reads one of sixteen precomputed points, and the four bits
that choose which one are secret. `Hacl.Bignum.Base.table_select` therefore
touches all sixteen entries and folds each one through a mask. F\* proves
that the loop returns entry *d*. It has no way to state that the loop takes
the same time whatever *d* is, because that's a property of the emitted
instructions, not of the result. Clang `-O3` unrolled the loop, recognized
the sixteen mask computations as comparisons against the constants 0 to 15,
and compiled them into a secret-dependent branch cascade. The timing spread
across digits was 158%, enough to read the digit from outside. The fix is a
value barrier, `Hacl.Launder.launder`. It is the identity function, but it
wraps the mask in an empty inline `asm` statement the optimizer can't see
through, so the masks are no longer recognizable as comparisons. With it,
the spread is 1.2%. `tests/test_consttime.c` and `tests/test_launder.c` time
the shipped code and fail if the spread comes back
([full story](https://github.com/FStarLang/hacl-pulse#the-compiler-is-allowed-to-undo-a-constant-time-algorithm)).

**Hardware intrinsics enlarge the trusted computing base.** The vector and
instruction-set backends (AES-NI, PCLMULQDQ, the SHA extensions, AVX2, and
AVX-512) and the 64-bit add-with-carry are described to F\* by `assume val`
axioms in `lib/Hacl.Vec128.fst`, `Vec256.fst`, `Vec512.fst`, and
`Carry64.fst`. Handwritten C headers (`c/Hacl_*.h`) implement them. F\*
verifies the Pulse code that uses them, *assuming* those axioms are true.
The axioms themselves are checked by differential C tests (`test_vec128.c`,
`test_vec256.c`, `test_vec512.c`, `test_carry64.c`) that compare each
intrinsic against an independent reference transcription. Each new
intrinsic-backed fast path therefore adds axioms and a test, and those get
careful human review.

**The specs themselves need checking.** Early on, `Spec.Curve25519`'s
doubling step used `BB` where RFC 7748 says `AA`. Everything verified,
because the code faithfully implemented the specification, typo included. A
proof says the code matches the spec. It says nothing about whether the spec
matches the RFC. A small Python oracle checked against the RFC 7748 test
vectors found the bug in minutes. That's why every primitive is tested
against published vectors, and why the repository now has the
`Spec.*.Correctness` modules described above. These prove round-trip,
key-agreement, and sign-then-verify theorems about the top-level specs,
which gives the specs a second, independent kind of check.

So verification doesn't make the whole optimization problem go away. It
moves the remaining risk into a few places that are small, named, and
tested: the timing behavior of a handful of secret-indexed routines, a short
list of axiomatized intrinsics, and the specifications. Everything else can
be optimized as aggressively as the proofs allow.

## Where hacl-pulse still falls short of HACL\*

Feature parity is about algorithms. On almost everything else that makes a
library usable in practice, HACL\* is still well ahead.

* **x86-64 only.** The generated C has unconditional x86
  `__attribute__((target("bmi2")))`, `"avx2"`, and similar annotations, and
  it relies on `unsigned __int128`. So it effectively builds only for 64-bit
  x86 with GCC or Clang. There's no ARM (and no NEON backend), no 32-bit
  target, and no MSVC. HACL\* ships portable, GCC-compatible, and
  MSVC-compatible distributions and runs on ARM, 32-bit, and embedded
  platforms.
* **No agile layer.** There is no EverCrypt-style provider that picks an
  algorithm and an implementation at run time behind one state type. This is
  deliberate: the dispatch between AES-NI and portable AES, or between the SHA
  extensions and scalar SHA-256, happens *inside* each algorithm. But a
  caller that wants to choose "a hash" or "an AEAD" at run time has to write
  the switch itself.
* **No other language targets.** HACL\* reaches far beyond C. There are
  [OCaml bindings](https://opam.ocaml.org/packages/hacl-star/), a WebAssembly
  and JavaScript build, and verified Rust code used by
  [libcrux](https://github.com/cryspen/libcrux). hacl-pulse produces C only.
  It has no Rust extraction and no bindings for any other language.
* **Not a drop-in replacement.** The C API has different names
  (`Hacl_Streaming_SHA2_*` rather than `Hacl_Hash_SHA2_*`), `size_t` lengths,
  caller-owned DRBG state, and a different error convention. Some HACL\*
  surfaces have no counterpart yet: a streaming Poly1305 MAC, BLAKE2 salt and
  personalization parameters, and the fixed-width `Bignum256`/`Bignum4096` and
  `GenericField` APIs. Switching from HACL\* means porting code.
* **One amalgamated file.** `dist/` is a single `Hacl.c` (about 56K lines,
  2.5 MB) and a single `Hacl.h`. HACL\* ships one file per algorithm, so an
  embedder can take only what it needs.
* **Assembly-level performance on the curves.** X25519 and Ed25519 signing
  are still about 1.3x behind HACL\*'s BMI2/ADX assembly under gcc, and the
  bignum rows are about 2x behind OpenSSL. Not using assembly was a design
  choice, and this is part of its cost.
* **Maturity.** HACL\* has years of deployment in Firefox, Linux, Python,
  and elsewhere, external scrutiny, and stable releases. hacl-pulse is six
  weeks old, has had no external audit, and tracks F\* `master` instead of
  a release, so building it needs a recent nightly. Its proofs have also
  been checked against only one F\* and Z3 toolchain so far.

Most of these are engineering rather than research. Portable and ARM
backends, Rust extraction, and per-algorithm distribution are all on the
table. But we want to be clear that today, hacl-pulse is a demonstration of
what a modern verified crypto library can look like, not a replacement for
HACL\* in production.

## How it was built

hacl-pulse went from an empty repository to feature parity in about six
weeks, across roughly 400 commits. Almost all of the specifications, code,
and proofs were written by AI agents running Claude Opus 5 and, later,
Opus 5.5. The workflow followed the pattern from our
[AutoCLRS](/blog/2026-03-06-autoclrs) and
[agentic PoP](/blog/2026-02-04-nik-agentic-pop) posts. Humans set the
direction. The first commits were [design documents](https://github.com/FStarLang/hacl-pulse/tree/master/design):
an inventory of HACL\*'s API, the design changes above, and a
feasibility study for replacing Vale. Agents did most of the specification,
implementation, and proof work. Every claim was then checked against the
verifier, the published test vectors, and the benchmark harness.

A few observations:

* **The design documents paid off.** Writing down what HACL\* does and what
  we wanted to do differently gave the agents a stable target and gave us a
  checklist to measure parity against.
* **Agents are good at performance engineering when they can measure and
  verify.** As described above, the verifier and the benchmark harness
  together let agents explore aggressively without anyone hand-checking each
  change for correctness.
* **Proof engineering knowledge accumulates.** The README's
  ["Proof engineering notes"](https://github.com/FStarLang/hacl-pulse#proof-engineering-notes)
  record 72 lessons so far, each written down after it cost real time. One
  example is "a product of two variables under a quantifier poisons the whole
  SMT query." F\* sends proof obligations to the Z3 solver, which handles
  linear arithmetic well but struggles with nonlinear arithmetic. A loop
  invariant like "for all `k < i * n`, ..." puts a product of two
  variables under a `forall`. That doesn't just make that one fact hard to
  prove. It can make *every* fact in the same query unprovable, including
  trivial ones like `i == j` from `i < j + 1` and `not (i < j)`. FrodoKEM's
  message encoding ran into this and took over four hours to verify. The fix
  was to restate the invariant so that the bound stays linear. Notes like
  this help the next agent (or human) as much as they helped this one.
* **Specification review is still the bottleneck.** A verified refinement
  of the wrong spec is still wrong, as the Curve25519 doubling bug showed.
  That's why every primitive is tested against published vectors, and why
  the specs carry their own correctness theorems: decryption inverts
  encryption for every AEAD and for NaCl, both parties agree in X25519, P-256
  and secp256k1 ECDH, and FFDHE, honest signatures verify for Ed25519, ECDSA,
  and RSA-PSS, and encapsulation round-trips for ML-KEM, FrodoKEM, and every
  HPKE mode. These are the properties a cryptographer would check first, and
  they're much easier to review than the spec functions themselves. See
  Shuvendu's post on [intent formalization](/blog/2026-03-05-shuvendu-intent-formalization)
  and our post on [small proof-oriented tests](/blog/2026-04-16-spotting-specs).

## Conclusions

**Large verified libraries can now be replicated quickly in a new
language.** Pulse is essentially a new language compared to Low\*. It has
separation logic instead of explicit memory footprints, type classes instead
of tactics, and a different extraction pipeline. Even so, HACL\*'s feature
set, built over many years, was reproduced in about six weeks, and
extended along the way.

**Architecture-level changes are now viable as a rewrite.** hacl-pulse is
not a port. Secret integers as abstract types, `size_t` lengths everywhere,
memory wiping enforced by the type system, and no assembly are cross-cutting
decisions that touch every file. In a mature codebase, decisions like these
are usually out of reach because the migration would cost too much. With
agents, you can enforce them by rewriting everything in the new style.

**State-of-the-art performance should be table stakes.** Other libraries were
very useful here, both as performance targets and as a source of algorithmic
ideas: HACL\* itself, OpenSSL, AWS-LC, libsodium, libjade, and more. When an
agent can read how the fastest implementation does it, try the idea, and
verify the result, reaching state-of-the-art performance (or any other
measurable goal) becomes a matter of token spend. Verified libraries no
longer have to accept "correct but slower" as the price of correctness.

**The incumbents' advantage has shrunk dramatically.** Mature libraries used
to carry a huge advantage in accumulated investment, which was hard for a
newcomer to match. That is no longer true. A newcomer with a better design
can catch up rapidly. For language designers, this means **now is the time to
design new languages. The libraries come for free!**

**Agents connect proof assistants to computer algebra without
infrastructure.** The group-law proofs for Ed25519, P-256, and secp256k1 rely
on certificates produced by computer algebra systems.
[Singular](https://www.singular.uni-kl.de/) computes the polynomial
cofactors behind the completeness identities, and
[PARI/GP](https://pari.math.u-bordeaux.fr/) produces Pocklington primality
certificates for the field primes and shows that certain cubics have no
roots. F\* never trusts these tools. It re-checks every certificate with a
small verified polynomial normalizer. In the past, connecting a computer
algebra system to a proof assistant was a research project in its own right
(see, for example, [*A bi-directional extensible interface between Lean and
Mathematica*](https://arxiv.org/abs/2101.07758)). Here the agent simply wrote
the Singular and PARI/GP scripts, ran them, and turned their output into F\*
modules, with no dedicated infrastructure. The same approach works in any
proof assistant.

## Try it

```
make FSTAR_ROOT=/path/to/fstar-nightly   # verify, extract, compile, test
```

You need a recent F\* [nightly](https://github.com/FStarLang/FStar-nightly/releases)
with Pulse. The tree tracks F\* `master`. If you just want the C, it's in
`dist/`: one `Hacl.c` and one `Hacl.h`.

What's next? The remaining performance gaps are listed in the
[roadmap](https://github.com/FStarLang/hacl-pulse#roadmap). We're also
considering whether to add an EverCrypt-style agile API, and whether to
prove probabilistic bounds on the lattice KEMs' failure rates. We'd love
feedback, especially from anyone who uses HACL\* today: does the API work for
you, and what would it take for you to switch?
