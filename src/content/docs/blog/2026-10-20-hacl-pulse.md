---
title: "hacl-pulse: Re-verifying HACL* in Pulse, with Agents"
description: A from-scratch reimplementation of the HACL* verified crypto library in F* and Pulse, built with AI agents in six weeks, at feature parity and close to HACL*'s performance.
author: Gabriel Ebner
---

* Author: Gabriel Ebner

> **TL;DR:** [hacl-pulse](https://github.com/FStarLang/hacl-pulse) is a
> from-scratch reimplementation of the
> [HACL\*](https://github.com/hacl-star/hacl-star) verified cryptographic
> library in [F\*](https://fstar-lang.org) and
> [Pulse](https://fstar-lang.org/tutorial/book/pulse/pulse.html), extracted
> to C by F\*'s new Custard backend. It covers every algorithm HACL\* offers
> (though not yet its platforms, bindings, or agile EverCrypt layer), and adds
> ML-KEM, ML-DSA, and HPKE in all four modes. It proves correctness theorems
> about the specs themselves, including the elliptic-curve group laws that
> HACL\* admits. Every primitive runs within 1.32x of HACL\*'s best
> configuration, and 16 run faster. It took about six weeks, and nearly all
> of it was written by AI agents running Claude Opus 5 and Opus 5.5.

## Why rebuild HACL\*?

HACL\* is one of the success stories of formal verification. Its verified C
code ships in Firefox, Linux, the Tezos and Python ecosystems, and elsewhere.
It was written over many years in Low\*, a C-like subset of F\*, and carries
workarounds for features F\* lacked at the time: one integer type indexed by
width and secrecy, a custom tactic to specialize width-generic code, and
32-bit lengths everywhere. Its fastest paths use
[Vale](https://github.com/project-everest/vale), a separate framework for
writing and verifying x86-64 assembly.

F\* has changed a lot since then.
[Pulse](https://fstar-lang.org/tutorial/book/pulse/pulse.html) is a mature
separation-logic language for imperative code, type classes are first-class,
and [Custard](https://github.com/FStarLang/FStar/blob/master/doc/ref/custard.md)
extracts Pulse straight to C, monomorphizing type-class code as it goes. And,
as we've written in [earlier](/blog/2026-02-04-nik-agentic-pop)
[posts](/blog/2026-03-06-autoclrs), agents can now carry most of the proof
engineering. So we asked: **what would HACL\* look like if we wrote it today?**

The answer is not a port. Wherever HACL\* worked around a missing language
feature, hacl-pulse uses the feature.

## What's in the box

All of the following are specified, implemented, verified, extracted to C,
and tested against published vectors (34 C test harnesses):

* **Hashes:** SHA-1, SHA-2, SHA-3/SHAKE, BLAKE2s/b, and MD5, one-shot and
  incremental.
* **MACs and KDFs:** HMAC (one-shot and incremental), HKDF, and Poly1305.
* **Ciphers and AEADs:** ChaCha20, Salsa20/XSalsa20, AES-GCM,
  ChaCha20-Poly1305, and NaCl `secretbox`/`box`.
* **Curves:** X25519, Ed25519, P-256, and secp256k1 (with low-S for Bitcoin).
* **Bignum:** Montgomery arithmetic, constant-time modexp, FFDHE (all five
  RFC 7919 groups), and RSA-PSS.
* **Randomness:** HMAC-DRBG with an OS entropy shim.
* **Post-quantum:** FrodoKEM (all four parameter sets), and **ML-KEM** and
  **ML-DSA** (all three parameter sets each).
* **HPKE** (RFC 9180) in all four modes with all three AEADs.

That's about 157,000 lines of F\* and Pulse (57K of specification, 94K of
implementation and proof), extracted to a single 56K-line `Hacl.c`. There is
no assembly. Hardware fast paths (AES-NI, PCLMULQDQ, the SHA extensions,
AVX2, and AVX-512) are C intrinsics behind narrow, axiomatized interfaces,
selected at run time.

## Modernizing the design

hacl-pulse departs from HACL\*'s design in five places (details in the
[README](https://github.com/FStarLang/hacl-pulse#the-five-design-commitments)):

1. **Secret integers are types, not an index.** Each secret width is its own
   abstract type whose interface exposes only constant-time operations: no
   comparison, no division, no branching. Declassification goes through a
   single module, so auditing where secrets become public is a search for one
   name. In C these are plain `uint32_t` and friends.
2. **Width-generic code is a type class, not a tactic.** SHA-2's core is
   written once against a `word` type class, and Custard monomorphizes it
   into `uint32_t` and `uint64_t` copies with no indirection. Algorithms are
   parameter records, so SHA-224/256/384/512 become four specialized C
   functions with their constants as literals.
3. **`size_t`, not 32-bit lengths.** No length is ever truncated.
4. **No assembly.** The trusted C is small and explicit: the entropy shim,
   the vector intrinsics, a 64-bit add-with-carry, and memory wiping.
5. **Scratch memory is wiped, and the type system enforces it.** Every stack
   array carries a ghost `must_wipe` resource that only `wipe` consumes.
   Pulse rejects a function that ends holding a resource, so a forgotten
   wipe is a *type error*, not a code-review comment. Lints and a
   `-fstack-usage` check also ensure no stack array is sized by caller input.

## Proving the specs mean what they should

A refinement proof shows that the C computes what the spec says, not that
the spec is right. Test vectors are part of the answer. The rest is a set of
theorems *about the specifications*, the statements a cryptographer would
write down first:

* **AEADs:** decryption inverts encryption for ChaCha20-Poly1305, AES-GCM,
  and NaCl secretbox and box.
* **Key exchange:** both parties agree for X25519, P-256 and secp256k1 ECDH,
  and all five FFDHE groups.
* **Signatures:** honest signatures verify for Ed25519, ECDSA on both
  curves, and RSA-PSS.
* **KEMs and HPKE:** encapsulation and seal/open round-trip for ML-KEM,
  FrodoKEM, and every HPKE mode. The lattice KEM theorems assume an explicit
  noise bound.

Along the way, the library proves facts that are usually assumed: that the
P-256 and secp256k1 group orders are prime, that the ML-KEM NTT is a ring
isomorphism, that the X25519 ladder computes a scalar multiple on the
Edwards group, and **the group laws for Ed25519, P-256, and secp256k1**.
The last of these is the most interesting, so let's zoom in.

## Zooming in: the elliptic-curve group laws

**Why we needed them.** Fast implementations compute a fixed-base scalar
multiple *k G* from a precomputed table of multiples of *G*. For example,
a 4-bit window splits *k* into digits and adds up *d<sub>i</sub>
(16<sup>i</sup> G)*. That's only correct if scalar multiplication is a
homomorphism from the integers, which holds because the curve points form a
commutative group. So the table needs associativity of point addition.
Benchmarks made this concrete. On P-256, variable-base ECDH (where HACL\*
has no table either) was within 1.15x of HACL\*, while fixed-base was at
2.59x, so the whole gap was the table. The agent first wrote down the
group-law statements as interfaces for all three curves, as a specification
of the work to be done, and noticed something surprising along the way:
**HACL\* doesn't prove these laws.** In its `Spec.{Ed25519,P256,K256}.Lemmas`
they are `admit()`, so HACL\*'s windowed Ed25519, windowed P-256, and GLV
secp256k1 all rest on unproved facts.

**The approach.** Associativity is the hard law, and we took the standard
route used by Bernstein and Lange and by
[Fiat-Crypto](https://github.com/mit-plv/fiat-crypto) in Coq: clear
denominators, and show that the resulting polynomial identity holds modulo
the curve equations. That last step is ideal membership. Because the
formulas are homogeneous, every point reduces to a canonical representative,
and there the curve equation becomes a rewrite rule (on Ed25519,
*u<sup>2</sup>v<sup>2</sup> → (v<sup>2</sup> − u<sup>2</sup> − 1)/d*). The
rules form a Gröbner basis, so rewriting decides membership. If the
difference of the two sides reduces to zero, the identity holds.

**A small verified computer algebra system.** The original plan was to
close these identities with F\*'s ring-normalization tactic. But they are
far too large for that, or for an SMT solver. P-256 associativity is about
26,000 monomials before reduction. So the agent wrote one:
`Spec.Group.Poly` represents polynomials as lists of monomials, implements
addition, multiplication, and reduction as ordinary functions, and proves
that each one commutes with evaluation modulo the prime. Running it with
F\*'s normalizer is a proof by reflection: if the computed result is the
empty polynomial, the identity holds over the field. Formulas are
transcribed over a type that pairs each polynomial with the field element
it denotes, so the transcription can't drift from the spec.

**Where the computer algebra certificates come in.** Associativity is pure
computation, but other facts need a *search*, which is a job for an
external computer algebra system (CAS). F\* never trusts the CAS. It only
checks the certificates the CAS produces:

* **Completeness** (the addition formulas never divide by zero) needs
  polynomial cofactors showing that a denominator lies in a certain ideal.
  [Singular](https://www.singular.uni-kl.de/)'s `lift` computes them. On
  Ed25519 the argument also uses the fact that *d* is not a square, which
  F\* checks by computing Euler's criterion.
* **No roots.** On the two Weierstrass curves, completeness depends on
  certain polynomials having no root in the field. For example, a root of
  *x<sup>3</sup> − 3x + b* would be a point of order two on P-256. The
  certificate is a polynomial *u* with *u (x<sup>p</sup> − x) ≡ 1* modulo
  the polynomial, which rules out a root by Fermat's little theorem.
  [PARI/GP](https://pari.math.u-bordeaux.fr/) computes *u*, and F\* checks
  the product.
* **Primality.** The proofs need the field primes to be prime, and ECDSA
  needs the group orders to be prime. PARI/GP builds recursive Pocklington
  certificates, and a verified checker in F\* validates them.

Python generators turn the CAS output into F\* modules, and every
[generator](https://github.com/FStarLang/hacl-pulse/tree/master/spec/group-gen)
reproduces its committed module byte-for-byte. On top of the group laws,
`Spec.Group.Smul` proves the scalar-multiplication facts a window needs
once, over an abstract commutative group, and instantiates them per curve.
That's not just tidier. A goal over an abstract predicate takes
milliseconds of Z3 time, while the same goal over 78-digit field equations
takes minutes. In total this is about 10,000 lines, and it's what made the
fixed-base windows on all three curves possible.

The idea of an untrusted CAS paired with a trusted checker is an old one
(Harrison and Théry's
["skeptic's approach"](https://doi.org/10.1023/A:1006023127567) to combining
HOL and Maple). What's new is the cost. Nobody built an interface between
F\* and Singular or PARI/GP. The agent wrote the scripts, ran them, read
the output, and wrote the generators.

## Performance

A verified library that's too slow to use isn't much of a win, so
performance got as much attention as proofs. We compare against **HACL\*
configured for the machine and allowed everything it has**: Vale assembly,
AVX2, and BMI2/ADX. On an AMD EPYC (Zen 3) with gcc 15:

* **16 of 26 benchmarks beat HACL\*'s best, and all are within 1.32x.**
* Salsa20 and secretbox run at 0.24x of HACL\*'s time (HACL\* has no vector
  Salsa20), SHA-512, SHA-3, and SHAKE at about 0.55x, and RSA-PSS
  verification at 0.44x.
* P-256 runs at 0.64x to 0.76x across the board, thanks to a field
  specialized to its prime and a four-base-point fixed-base table.
* The slowest rows are X25519 and Ed25519 signing (about 1.3x, against
  HACL\*'s BMI2/ADX assembly) and MD5. Under clang, X25519 matches HACL\*.

Against OpenSSL, AWS-LC, libsodium, libjade, Firedancer, and dalek,
hacl-pulse is fastest at secp256k1 signing (about 4x ahead), and most
primitives are within 1.1x to 1.4x of the fastest library. The largest gaps
are SHA-512 and bignum modexp, about 2x behind hand-tuned assembly.

## Verification makes optimization safe

Optimized crypto code is where bugs hide: a carry handled slightly
differently, a dropped lane in an unrolled loop, a deferred reduction that
overflows on an untested input. In an unverified library, every speedup
trades confidence for performance.

In hacl-pulse there is no such trade. **An optimized implementation must
prove the same specification as the code it replaces.** SHA-3's permutation
must equal the spec's permutation, rolled or unrolled. X25519's field
multiply must compute multiplication modulo 2^255 - 19, whether it uses five
51-bit limbs or four 64-bit ones. If the change verifies, it's correct, and
nothing above it needs re-examining.

That changed what we were willing to try. The roughly 70 parts of
[`bench/REPORT.md`](https://github.com/FStarLang/hacl-pulse/blob/master/bench/REPORT.md)
record each optimization (the motivating measurement, the experiment, and
the result), and many are changes you'd normally make only with great care:

* **Unrolling Keccak by hand.** The theta, rho/pi, and chi steps are written
  out lane by lane. One helper is verified against a symbolic lane index and
  applied to 25 literal ones. SHA-3 now runs at about half of HACL\*'s time.
* **Changing a field representation.** Curve25519 went from eight 32-bit
  limbs to five 51-bit limbs, then a straight-line multiply, then four
  64-bit limbs. Each step changed the carry discipline, which is exactly
  where field arithmetic usually breaks.
* **Deferring algebra.** Four-way GHASH sums four raw 256-bit products and
  reduces once instead of four times. That's correct only because the
  reduction is linear, which three small GF(2^128) lemmas make explicit.
  GHASH went from 2.11 to 1.28 cycles per byte.
* **Replacing simple algorithms with clever ones:** windowed scalar
  multiplication on all three curves, 4-bit windows and triangle squaring in
  modexp, and a P-256 field specialized to its prime.

This matters even more with agents. An agent can propose and benchmark
dozens of optimizations in an afternoon, far more than anyone could review
line by line. With verification, people judge *whether a change is worth
it*, and F\* checks *whether it's right*. The cost of an optimization shows
up as proof effort, not bugs. The recurring fix for a slow proof is to split
the routine into helpers with tight specifications rather than raise solver
limits. One BLAKE2 module went from an 18-minute timeout to 25 seconds that
way.

### Three caveats

"If it verifies, it's correct" means correct *with respect to the spec,
under the stated assumptions*. Three caveats came up along the way.

**Constant-time execution is not in the spec.** Windowed scalar
multiplication reads one of sixteen precomputed points, chosen by four
secret bits, so `Hacl.Bignum.Base.table_select` touches every entry and
folds each through a mask. F\* proves the result is entry *d*, but it can't
state that the time is independent of *d*. That's a property of the emitted
instructions, not the result. Clang `-O3` recognized the sixteen masks as
comparisons against 0 to 15 and compiled them into a secret-dependent branch
cascade, with a 158% timing spread across digits. The fix is a value
barrier, `Hacl.Launder.launder`: an identity function wrapping the mask in
an empty inline `asm` the optimizer can't see through. The spread dropped to
1.2%, and `tests/test_consttime.c` and `tests/test_launder.c` fail if it
returns
([full story](https://github.com/FStarLang/hacl-pulse#the-compiler-is-allowed-to-undo-a-constant-time-algorithm)).

**Hardware intrinsics enlarge the trusted computing base.** The vector
backends and the 64-bit add-with-carry are described to F\* by `assume val`
axioms in `lib/Hacl.Vec128.fst`, `Vec256.fst`, `Vec512.fst`, and
`Carry64.fst`, and implemented by handwritten C headers (`c/Hacl_*.h`). F\*
verifies the code that uses them *assuming* the axioms hold. Differential
tests (`test_vec128.c`, `test_vec256.c`, `test_vec512.c`, `test_carry64.c`)
check each intrinsic against an independent reference, and every new
intrinsic gets careful human review.

**The specs themselves need checking.** Early on, `Spec.Curve25519`'s
doubling step used `BB` where RFC 7748 says `AA`. Everything verified,
because the code faithfully implemented the spec, typo and all. A small
Python oracle run against the RFC 7748 vectors found it in minutes. This is
why every primitive is tested against published vectors, and why the specs
now carry the correctness theorems above.

So verification doesn't make the risk disappear. It concentrates it in a few
small, named, tested places: the timing of a handful of secret-indexed
routines, a short list of axiomatized intrinsics, and the specs. Everything
else can be optimized as aggressively as the proofs allow.

## Where hacl-pulse goes beyond HACL\*

* **New algorithms.** ML-KEM (FIPS 203) and ML-DSA (FIPS 204) in all three
  parameter sets each, which HACL\* doesn't have. HPKE in all four modes
  with all three AEADs, where HACL\* ships only Base mode over
  ChaCha20-Poly1305. A portable, constant-time AES-GCM, where HACL\* has only
  Vale assembly.
* **New theorems.** The group laws for all three curves, primality of the
  field primes and group orders, and correctness theorems for every AEAD,
  key exchange, signature scheme, and KEM. Some of these facts appear in
  HACL\*, but unproved: its AEAD `correctness` lemma, the primality of the
  P-256 prime, and the group laws are all `admit()`.
* **Safety enforced by types.** Wiping secret scratch memory is checked by
  Pulse's resource discipline, secret integers have no non-constant-time
  operations, no stack frame is sized by caller input, and lengths are
  `size_t`.
* **Speed.** 16 of 26 benchmarks beat HACL\*'s best configuration,
  including Salsa20 and secretbox (0.24x), SHA-512, SHA-3, and SHAKE (about
  0.55x), RSA-PSS verification (0.44x), and all of P-256 (0.64x to 0.76x).
  On secp256k1 signing, hacl-pulse is about 4x faster than any library we
  measured.
* **No assembly.** Every fast path is verified Pulse over a small set of
  tested C intrinsics, so there's no separate assembly-verification
  toolchain to maintain.

## Where hacl-pulse still falls short of HACL\*

Parity is about algorithms. On most other things that make a library usable
in practice, HACL\* is still well ahead.

* **x86-64 only.** The generated C has unconditional x86 target attributes
  (`"bmi2"`, `"avx2"`, ...) and uses `unsigned __int128`, so it builds only
  for 64-bit x86 with GCC or Clang: no ARM or NEON, no 32-bit, no MSVC.
  HACL\* supports all of those.
* **No agile layer.** There's no EverCrypt-style provider for choosing an
  algorithm at run time behind one state type. This is deliberate, since
  dispatch (AES-NI or portable AES, say) happens inside each algorithm. But a
  caller who wants "a hash" or "an AEAD" chosen at run time has to write the
  switch.
* **No other language targets.** HACL\* has
  [OCaml bindings](https://opam.ocaml.org/packages/hacl-star/), a
  WebAssembly/JavaScript build, and verified Rust used by
  [libcrux](https://github.com/cryspen/libcrux). hacl-pulse produces only C.
* **Not a drop-in replacement.** The API differs in names
  (`Hacl_Streaming_SHA2_*`, not `Hacl_Hash_SHA2_*`), lengths, DRBG state
  ownership, and error conventions. A few HACL\* surfaces have no counterpart
  yet: streaming Poly1305, BLAKE2 salt and personalization, and the
  fixed-width `Bignum256`/`Bignum4096` and `GenericField` APIs.
* **One amalgamated file.** `dist/` is a single 2.5 MB `Hacl.c`. HACL\* ships
  one file per algorithm, so embedders can take only what they need.
* **Assembly-level curve performance.** X25519 and Ed25519 signing are about
  1.3x behind HACL\*'s BMI2/ADX assembly under gcc, and bignum about 2x
  behind OpenSSL. That's part of the cost of avoiding assembly.
* **Maturity.** HACL\* has years of deployment, external scrutiny, and
  stable releases. hacl-pulse is six weeks old, unaudited, tracks F\*
  `master`, and has been checked with only one F\* and Z3 toolchain.

Most of these are engineering rather than research. Portable and ARM
backends, Rust extraction, and per-algorithm distribution are all on the
table. But today hacl-pulse is a demonstration of what a modern verified
crypto library can look like, not a production replacement for HACL\*.

## How it was built

hacl-pulse went from an empty repository to feature parity in about six
weeks and 400 commits. Almost all of the specifications, code, and proofs
were written by AI agents running Claude Opus 5 and, later, Opus 5.5,
following the workflow from our [AutoCLRS](/blog/2026-03-06-autoclrs) and
[agentic PoP](/blog/2026-02-04-nik-agentic-pop) posts. Humans set the
direction. The first commits were
[design documents](https://github.com/FStarLang/hacl-pulse/tree/master/design):
an inventory of HACL\*'s API, the design changes above, and a feasibility
study for replacing Vale. Everything the agents produced was checked by the
verifier, the published test vectors, and the benchmark harness.

* **The design documents paid off.** They gave the agents a stable target
  and gave us a checklist for parity.
* **Proof engineering knowledge accumulates.** The README's
  ["Proof engineering notes"](https://github.com/FStarLang/hacl-pulse#proof-engineering-notes)
  record 72 lessons, each written down after it cost real time. One example
  is "a product of two variables under a quantifier poisons the whole SMT
  query." F\* discharges proofs with the Z3 solver, which handles linear
  arithmetic well and nonlinear arithmetic poorly. An invariant like "for
  all `k < i * n`, ..." puts a product of variables under a `forall`, and
  that can make *every* fact in the query unprovable, even `i == j` from
  `i < j + 1` and `not (i < j)`. FrodoKEM's message encoding hit this and
  took over four hours to verify. The fix was to restate the invariant so
  that the bound stays linear. Notes like this help the next agent, or human.
* **Specification review is still the bottleneck.** A verified refinement of
  the wrong spec is still wrong, as the Curve25519 bug showed. That's why the
  specs carry their own theorems (AEADs decrypt what they encrypt, key
  exchanges agree, honest signatures verify, KEMs and HPKE round-trip),
  which are much easier to review than the spec functions themselves. See
  also our posts on [intent formalization](/blog/2026-03-05-shuvendu-intent-formalization)
  and [small proof-oriented tests](/blog/2026-04-16-spotting-specs).

## Conclusions

**Large verified libraries can now be replicated quickly in a new
language.** Pulse is essentially a new language compared to Low\*, with
separation logic instead of explicit memory footprints, type classes instead
of tactics, and a different extraction pipeline. HACL\*'s feature set, built
over many years, was reproduced and extended in about six weeks.

**Architectural changes are now viable as rewrites.** Secret integers as
abstract types, `size_t` everywhere, type-enforced memory wiping, and no
assembly are cross-cutting decisions that touch every file. In a mature
codebase, the migration would usually cost too much. With agents, you can
enforce such decisions by rewriting everything in the new style.

**State-of-the-art performance should be table stakes.** Other libraries
(HACL\*, OpenSSL, AWS-LC, libsodium, libjade, and more) were invaluable as
performance targets and sources of algorithmic ideas. When an agent can read
how the fastest implementation works, try the idea, and verify the result,
reaching the state of the art (or any other measurable goal) becomes a matter
of token spend. Verified code no longer has to be "correct but slower."

**The incumbents' advantage has shrunk dramatically.** Mature libraries used
to have a huge lead in accumulated investment that newcomers could hardly
match. Now a newcomer with a better design can catch up rapidly. **Now is the
time to design new languages. The libraries come for free!**

**Agents connect proof assistants to computer algebra without
infrastructure.** Connecting a computer algebra system to a proof assistant
used to be a research project in its own right (see, for example, [*A
bi-directional extensible interface between Lean and
Mathematica*](https://arxiv.org/abs/2101.07758)). For the group laws, the
agent simply wrote Singular and PARI/GP scripts, ran them, and turned their
output into certificates that F\* checks. No infrastructure was needed, and
the same approach works in any proof assistant.

## Try it

```
make FSTAR_ROOT=/path/to/fstar-nightly   # verify, extract, compile, test
```

You need a recent F\* [nightly](https://github.com/FStarLang/FStar-nightly/releases)
with Pulse. If you just want the C, it's in `dist/`. The remaining
performance work is in the
[roadmap](https://github.com/FStarLang/hacl-pulse#roadmap), and we're
considering an agile API and probabilistic failure bounds for the lattice
KEMs. We'd love feedback, especially from HACL\* users: what would it take
for you to switch?
