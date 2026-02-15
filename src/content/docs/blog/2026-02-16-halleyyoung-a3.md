---
title: How to train your symbolic program verifier
description: Development of a symbolic program analysis engine from prompts to functioning system
author: Halley Young
---

* Author: Halley Young, Nikolaj Bj&oslash;rner


What if you asked your favorite AI agent:



> Produce mathematics at the level of Vladimir Voevodsky, Fields Medal-winning, 
> foundation-shaking work but directed toward something the legendary Nikolaj Bj&oslash;rner 
> (co-creator of Z3) could actually use?

Our journey creating the __a3__ framework, a system for generating Advanced Automated Analysis engines and so far extracted
static verifiers for Rust and Python. In the process of creating a3-python we used AI to (re)discover a
foundation based on Hilbert's Stellensatz theorems for program analysis, integrate a top dozen advances in symbolic model checking, 
and import mathematical libraries for reasoning about PyTorch code. **NSB: revisit to make sure the right elements are summarized**
The a3-python system is now [available](https://pypi.org/project/a3-python)
for you to give a spin.

## A3-python

__NSB: a section here that uses a3-python on an example: tell the reader what to expect before going through the process of getting there.
Include information about how it is auto-generated and iterated.__

## Querying for confluences

__NSB: we might need to invert the theory pitch to later to get to the usability sooner__

We did not start with _let's make a Python verifier_. Instead our starting point
was a prompt aimed at uncovering confluences between lines of thought that have
been unlikely to be combined so far. Our prompt involving Voevodsky and the co-author of this blog
is on purpose set up to trigger modern AI's power to retrieve and extrapolate. 

The earliest phase produced a long, ambitious manuscript on quantitative model checking. The central move was elegant:

- stop asking only "is the system safe?"
- start asking "how far is it from safety?"
- use that distance as a semantic object you can optimize.

In other words, make verification feel less like a courtroom verdict and more like geometry.
The paper-level ideas were ambitious enough to be interesting and dangerous enough to be wrong
in many ways once code entered the room.
The approach was based on _metric semantics_: traces as distributions, properties as structured
acceptance sets, distance to acceptance as a first-class quantity. _Fascinating_, but also provided
instincts that survied the transition to working prototypes: Safety wasn't considered purely a Boolean, 0/1, property.
Uncertainty has shape. Quantitative semantics was used to prioritize work, and distance to satisfiability guided repair.

But put to the test, to solve real-world code bases, it was killing mountains of false positives and missed true bugs.

In a second iteration we queried our model to shift from measurement to separation.
Instead of asking only _how close is unsafe behavior?_,

- what set is reachable,
- what set is unsafe,
- and can we synthesize a witness that keeps those sets disjoint?

It is much closer to mainstream symbolic program verification techniques. The objective in automated symbolic
program verification is to synthesize a barrier certificate `B(s)`, where `s` are state variables of a program, so that 

- initial states `sInit` are on the safe side, they satisfy `B(sInit) >= 0`,
- unsafe states are on the forbidden side, they satisfy `B(sBad) < 0`,
- and transitions never cross the fence, every non-negative `B` state transitions to another non-negative `B` state.

The idea can be illustrated visually:

![Barrier intuition](../../../assets/slop-feedback-loop/barrier-theory.png)

Our favorite LLM model __NSB: name names here? you used some mixture along the way?__ determined that barriers should be expressed using polynomials
over real and integer numbers. It introduced us to an algebraic proof machinery based on Hilbert's Positivstellensats, sums of squares, semi-definite programming,
and the works [3][4][5][6][7][18]. Considering that the z3 theorem prover supports both polynomial arithmetic but also domains that correspond directly
to datatypes found in mainstream programming languages we were intrigued by the origins of this direction. While Claude __NSB: name model?__ appeared inclined
to present results as its own inventions, we could send the 85 page document to copilot for a quiz on origins: The closest match was a method introduced
20 years ago for cyber physical systems [PennSUPaper] and perhaps a thread of approaches used for synthesizing invariants from Farkas lemma [GulwaniVenkie].


## From Math to Code

__NSB: Describe the initial system__

One thing is creating documents with suave looking scientific definitions and propositions, another is synthesizing code.
Thankfully, the documents provide a great compass for agents to plan implementations. We still need an implementation plan.
We asked Copilot to synthesize a script to call Copilot in a loop, bootstrapping an implementation 


> Combine model-checker-plan with a desire to create a continuous copilot-cli workflow, by in a scheduled and structured way calling f"copilot -p '{prompt}' --allow-all-tools", with different prompts depending on where you are in the process.  First flesh out the plan for the continual process, then write it as a .py using that call_copilot script.   Note that unless told otherwise, copilot's cli will create files itself, not return text of files.
> Note that part of the loop *has* to be downloading a large collection of rust repos, and iteratively debugging for false negatives by having an LLM come up with a hard-to-spot bug of type n and having the model detect it, and debugging for all false positives by running the checker on all rut files in the entire set of repos, seeing where it finds a positive, and asking copilot-cli if it agrees that it's a positive.   Then it should iterate on its results, using barrier certificate theory where it can be helpful, and developing in other ways as well.  The first part, though, should be developing a list of "moving parts" necessary, and iteratively building and then testing each moving part.  Note that the implementation should be in python.
> This should consist of a .py python file which enacts this workflow.
`


![System architecture overview](../../../assets/slop-feedback-loop/system-architecture-overview.png)

Once attached to symbolic execution, SMT feasibility checks, and refinement loops, barrier reasoning stops being decorative math and becomes a high-throughput false-positive filter.

The third era was the hardest: making the theory survive Python exactly enough to matter.

That meant committing to execution details instead of hand-wavy semantics:

- bytecode-level control flow,
- normal and exceptional edges,
- frame/stack state,
- dynamic dispatch,
- unknown library behavior,
- and explicit unsafe predicates for real bug classes.

This is where lots of elegant claims died. Good. They needed to.

The theory was then rewritten to reflect executable reality: safety as reachability
exclusion over an explicit transition system, with contracts for unknown calls and concolic checks as refinement evidence.


## The Compute Aided Verification kitchen sink

__Describe the kitchen sink approach__

While a novel looking foundation and AI models ability to create end-to-end systems based on one approach 
has its own appeal we are not

## Library Specialization

__Describe pytorch axiomatization and provide an example using a3-python__


## Iterating for Quality

__Describe what was the process for driving quality of a3-python and what is in store for AI assisted programming__


__NSB: symbolo-neural__: symbolic verifier which is deterministic, auditable, and eco-friendly; neural triaging to filter important bugs form noise and to explain bugs. The quadrant of symbolic, neural, neuro-symolic and symbol-neural.


# ------- ORIGINAL VERSION ------


# The Slop Feedback Loop: How We Used AI to Filter AI Bugs

**Deliverable first:** `pip install a3-python` gives you a package that automatically discovers bug candidates, filters out as many as possible with static analysis, and then asks an LLM to make the final call only on a much smaller uncertain set.


## The actual engine: AI theorizing -> coding -> testing -> fixing code -> fixing theory

This loop was repeated enough times that it became the project's real method.

### 1) AI theorizing

AI was used to generate broad hypotheses fast:

- new abstractions,
- candidate proof templates,
- odd cross-domain analogies,
- aggressive architectural combinations.

Most of these were not immediately trustworthy.

### 2) Coding

Ideas were encoded in analyzers:

- bytecode/CFG extraction,
- symbolic state propagation,
- unsafe-region checks,
- barrier template synthesis,
- dynamic symbolic/concolic validation.

![Symbolic execution and taint tracking](../../../assets/slop-feedback-loop/symbolic-execution-taint-tracking.png)

### 3) Testing

Then came the expensive truth step:

- synthetic suites,
- regression tests,
- large-repo scans,
- confidence calibration,
- triage audits.

### 4) Fixing code

Typical breakages were familiar:

- path explosion,
- over-conservative unknown-call handling,
- context-loss across call boundaries,
- duplicate floods,
- false positives on guard-heavy code.

### 5) Fixing theory

This was the underappreciated step. Instead of forcing code to match a brittle theory, the theory itself was patched:

- definitions tightened,
- assumptions made explicit,
- proof obligations split by semantics layer,
- unknown behavior modeled as contracts with conservative fallback.

Then the loop restarted.

![Analysis workflow](../../../assets/slop-feedback-loop/analysis-workflow.png)

This is "fighting AI slop with AI slop" in practice: generate aggressively, then subject everything to adversarial execution.

## A short technical example: why the loop mattered

Consider the bug claim "failing assertion escapes uncaught."

At theory level, this is a reachability question into an unsafe region.

At code level, it depends on details:

- is the failing assert reachable,
- are asserts enabled,
- does an enclosing handler catch it,
- does a caller catch it,
- does a `finally` path alter propagation?

A naive detector over-reports. A purely theorem-level account under-specifies runtime behavior. The loop forced both sides to meet in the middle: precise-enough execution semantics plus conservative proof rules.

The same pattern repeated for unknown library calls:

- fully deterministic assumptions were unsound,
- fully nondeterministic assumptions were noisy,
- contract-overapproximation + concolic witness checks gave a workable middle.

![Symbolic vs concolic roles](../../../assets/slop-feedback-loop/symbolic-vs-concolic-roles.png)
   
## Back-in-time detective board: where did these ideas come from?

Trying to reverse-engineer the lineage is half the fun. The final system seems to inherit from at least five worlds:

1. **Quantitative semantics** from the early distance-based theory.
2. **Control-theoretic safety witnesses** from Lyapunov/barrier thinking.
3. **Model-checking refinement** from CEGAR-style loops.
4. **Compiler/runtime realism** from bytecode and exception semantics.
5. **Agentic tool use** from modern LLM coding workflows.

No single field would naturally propose this exact combination on day one.

AI, however, is very good at proposing weird crossovers quickly. The quality filter is not the novelty of the crossover. The quality filter is whether it survives tests.

## What shipped: a static-first, agentic-second package

By the time this became a pip package, the architecture had hardened into a simple principle:

- put deterministic, auditable, non-LLM reasoning first,
- reserve LLM judgment for the residual uncertainty.

![Layer feedback architecture](../../../assets/slop-feedback-loop/layer-feedback-architecture.png)

### Static-first stage

The static stage does the heavy lifting:

- discover candidate issues across many bug types,
- run symbolic checks and path-sensitive reasoning,
- apply barrier/invariant-style elimination,
- deduplicate and score,
- preserve evidence in SARIF.

This is where most noise disappears.

![Bug taxonomy coverage](../../../assets/slop-feedback-loop/bug-taxonomy-67-types.png)

### The kitchensink approach: steal the best ideas, orchestrate them, don't worship any single paper

The static-first stage is not one technique. It's a paper portfolio.

In this repo that portfolio is called `kitchensink`, and it is enabled by default in scanning mode (you can disable it with `--no-kitchensink` when you explicitly want a narrower run).

The practical rule is simple:

1. Classify the bug shape.
2. Route to the strongest low-cost method first.
3. Escalate only when proof/counterexample remains unresolved.
4. Keep competing methods as cross-checks, not decorations.

Concretely, that means combining and sequencing results from:

- Barrier-certificate foundations for safety separation [1][2].
- Algebraic proof machinery (Positivstellensatz, SOS/SDP, hierarchy lifting, sparsity, and DSOS/SDSOS speed layers) [3][4][5][6][7][18].
- Property-directed and CHC-style reachability engines [8][9][10].
- Abstraction-refinement families (classic CEGAR, SAT predicate abstraction, lazy interpolation-based abstraction) [11][12][13].
- Learning/synthesis families (ICE, Houdini, SyGuS) that propose and refine invariants [14][15][16].
- Compositional assume-guarantee reasoning for interprocedural scaling [17].

That is the kitchensink point: treat great papers as interoperable components in a verification control loop, not as mutually exclusive camps.

![Barrier synthesis advanced techniques](../../../assets/slop-feedback-loop/barrier-synthesis-advanced-techniques.png)

### Agentic-second stage

Only the leftovers are sent to an LLM agent with tools to inspect real context:

- read concrete source ranges,
- search for guards and preconditions,
- inspect callers and tests,
- follow imports,
- then produce a TP/FP classification with rationale.

The key is not "LLM decides everything." The key is "LLM decides only where static proof and disproof both stop."

## CI as a ratchet, not a firehose

A practical design choice made this deployable in messy repos: baseline ratcheting.

- Existing accepted findings are recorded.
- New unaccepted findings fail CI.
- Disappearing findings are auto-pruned.

That shifts the team experience from "infinite backlog" to "no net new risk," which is the only sustainable adoption model for large existing codebases.

![Case study: DeepSpeed](../../../assets/slop-feedback-loop/deepspeed-case-study.png)

![Real bugs found example](../../../assets/slop-feedback-loop/deepspeed-real-bugs.png)

## Why this architecture specifically fights slop

It fights slop at three levels:

1. **Theoretical slop**
   AI-generated theory is forced through explicit semantics and proof obligations.

2. **Implementation slop**
   Analyzer claims are checked against tests, concrete runs, and refinement loops.

3. **Operational slop**
   Alert floods are collapsed by static filters before LLM triage and human review.

So yes, this is "AI slop vs AI slop," but not symmetrically.

- Upstream AI expands hypothesis space.
- Midstream formal/static machinery prunes it brutally.
- Downstream agentic AI handles the hard residue.

That asymmetry is what makes it useful.

## The practical takeaway

If you want this pattern outside this repo, keep the order:

1. Generate broadly.
2. Filter with sound-ish machinery first.
3. Escalate only uncertain cases to adaptive intelligence.
4. Keep a CI ratchet so quality only moves one way.

Do those four things and "AI-assisted" starts to look less like hype and more like engineering.

## References (kitchensink stack)

1. S. Prajna, A. Jadbabaie, G. J. Pappas. "Safety verification of hybrid systems using barrier certificates." HSCC, 2004.
2. S. Prajna, A. Jadbabaie, G. J. Pappas. "A framework for worst-case and stochastic safety verification using barrier certificates." IEEE Transactions on Automatic Control, 2007.
3. M. Putinar. "Positive polynomials on compact semi-algebraic sets." Indiana University Mathematics Journal, 1993.
4. P. A. Parrilo. "Semidefinite programming relaxations for semialgebraic problems." Mathematical Programming, Series B, 2003.
5. J.-B. Lasserre. "Global optimization with polynomials and the problem of moments." SIAM Journal on Optimization, 2001.
6. M. Kojima, S. Kim, H. Waki. "Sparsity in sums of squares of polynomials." Mathematical Programming, Series B, 2005.
7. A. A. Ahmadi, A. Majumdar. "DSOS and SDSOS optimization: more tractable alternatives to sum of squares and semidefinite optimization." SIAM Journal on Applied Algebra and Geometry, 2019.
8. A. R. Bradley. "SAT-Based Model Checking without Unrolling." VMCAI, 2011.
9. A. Komuravelli, A. Gurfinkel, S. Chaki. "SMT-based model checking for recursive programs." CAV, 2014.
10. K. L. McMillan. "Interpolation and SAT-Based Model Checking." CAV, 2003.
11. E. Clarke, O. Grumberg, S. Jha, Y. Lu, H. Veith. "Counterexample-Guided Abstraction Refinement." CAV, 2000.
12. E. Clarke, D. Kroening, N. Sharygina, K. Yorav. "Predicate Abstraction of ANSI-C Programs Using SAT." Formal Methods in System Design, 2004.
13. K. L. McMillan. "Lazy Abstraction with Interpolants." CAV, 2006.
14. P. Garg, C. Loeding, P. Madhusudan, D. Neider. "ICE: A Robust Framework for Learning Invariants." CAV, 2014.
15. C. Flanagan, K. R. M. Leino. "Houdini, an Annotation Assistant for ESC/Java." FME, 2001.
16. R. Alur, R. Bodik, G. Juniwal, M. M. K. Martin, M. Raghothaman, S. A. Seshia, R. Singh, A. Solar-Lezama, E. Torlak, A. Udupa. "Syntax-Guided Synthesis." FMCAD, 2013.
17. T. A. Henzinger, S. Qadeer, S. K. Rajamani. "You Assume, We Guarantee: Methodology and Case Studies." CAV, 1998.
18. S. Prajna, A. Papachristodoulou, P. A. Parrilo. "SOSTOOLS: Sum of squares optimization toolbox for MATLAB." 2002.

**Deliverable last:** `a3-python` is the shipped pip package that does exactly this: automatic bug discovery, aggressive static false-positive filtering, and LLM final judgment on the much smaller uncertain set.
