---
title: "hacl-pulse: Re-verifying HACL* in Pulse, with Agents"
description: A from-scratch reimplementation of the HACL* verified crypto library in F* and Pulse, built with AI agents in six weeks, at feature parity and close to HACL*'s performance.
author: Gabriel Ebner
---

* Author: Gabriel Ebner, with thanks to Nik Swamy
  <!-- TODO: confirm author list and acknowledgements -->

> **TL;DR:** [hacl-pulse](https://github.com/FStarLang/hacl-pulse) is a new,
> from-scratch reimplementation of the
> [HACL\*](https://github.com/hacl-star/hacl-star) verified cryptographic
> library. It is written in [F\*](https://fstar-lang.org) and
> [Pulse](https://fstar-lang.org/tutorial/book/pulse/pulse.html) and extracted
> to C by F\*'s new Custard backend. It covers everything HACL\* offers except
> the EverCrypt agile provider. It also adds things HACL\* doesn't have:
> ML-KEM (FIPS 203), ML-DSA (FIPS 204), and HPKE in all four modes. It proves
> functional-correctness theorems about the specs themselves, including the
> elliptic-curve group laws that HACL\* admits. On the target machine every
> primitive runs within 1.32x of HACL\*'s best configuration, and 16 of them
> run faster. It took about six weeks, and nearly all of the code was written
> with Copilot CLI.

## Why rebuild HACL\*?

HACL\* is one of the success stories of formal verification. Its verified C
code ships in Firefox, Linux, the Tezos and Python ecosystems, and elsewhere.
<!-- TODO: double-check the deployment list before publishing -->
It was written over many years in Low\*, an embedded subset of F\* designed
for C-like code, and it carries some workarounds for features F\* did not have
at the time: a single integer type indexed by width and secrecy, a custom
tactic to specialize width-generic code, 32-bit lengths everywhere, and Vale
assembly for the fast paths.

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

hacl-pulse has feature parity with HACL\*'s C and F\* APIs. All of the
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

## Five design commitments

The [README](https://github.com/FStarLang/hacl-pulse#the-five-design-commitments)
explains these in detail. In brief:

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
and the result. Our favorite entry is
["The compiler is allowed to undo a constant-time algorithm"](https://github.com/FStarLang/hacl-pulse#the-compiler-is-allowed-to-undo-a-constant-time-algorithm).
F\* proves that the masked table lookup in the windowed scalar multiplication
returns the right entry. It has no way to say that the lookup takes the same
time whatever the secret index is. Clang noticed the sixteen comparisons
against constants and was entitled to compile them into something
data-dependent. The fix cost some clang performance, and it's a good reminder
of where the verified guarantee stops and the trusted toolchain starts.

## How it was built

<!-- TODO: This section is inferred from the commit history (383 of 400
commits co-authored with Copilot, Sep 6 to Oct 19 2026). Please replace with
first-hand details: models used, how much was human-written (specs? design
docs?), how specs were reviewed, rough agent-hours, what went wrong. -->

hacl-pulse went from an empty repository to feature parity in about six
weeks, across roughly 400 commits. Almost all of them were written with
[Copilot CLI](https://github.com/features/copilot/cli) as co-author. The
workflow followed the pattern from our
[AutoCLRS](/blog/2026-03-06-autoclrs) and
[agentic PoP](/blog/2026-02-04-nik-agentic-pop) posts. Humans set the
direction. The first commits were [design documents](https://github.com/FStarLang/hacl-pulse/tree/master/design):
an inventory of HACL\*'s API, the design commitments above, and a
feasibility study for replacing Vale. Agents did most of the specification,
implementation, and proof work. Every claim was then checked against the
verifier, the published test vectors, and the benchmark harness.

A few observations:

* **The design documents paid off.** Writing down what HACL\* does and what
  we wanted to do differently gave the agents a stable target and gave us a
  checklist to measure parity against.
* **Agents are good at performance engineering when they can measure.** Many
  of the optimizations in `bench/REPORT.md` are hypothesis/experiment/result
  loops. Each one has a verified-correct change on one side and a cycle count
  on the other.
* **Proof engineering knowledge accumulates.** The README's
  ["Proof engineering notes"](https://github.com/FStarLang/hacl-pulse#proof-engineering-notes)
  capture lessons such as "a product of two variables under a quantifier
  poisons the whole SMT query." These notes help the next agent (or human)
  as much as they helped this one.
* **Specification review is still the bottleneck.** This is why we invested
  in correctness theorems about the specs and in independent test vectors,
  rather than trusting that a verified refinement of *some* spec is enough.
  See Shuvendu's post on [intent formalization](/blog/2026-03-05-shuvendu-intent-formalization)
  and our post on [small proof-oriented tests](/blog/2026-04-16-spotting-specs).

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
