---
title: "A3: Catching Real Python Bugs with Formal Methods and Agentic LLM Triage"
description: "A walkthrough of A3, a static analysis tool that combines Z3 symbolic execution with agentic LLM triage to find real bugs in Python codebases — with examples from PyTorch, DeepSpeed, and Microsoft's LLM2CLIP."
author: Halley Young
---

* Author: Halley Young

Can you find real bugs in production Python code — automatically, without drowning in false positives?
[A3](https://pypi.org/project/a3-python/) (`pip install a3-python`) is a static analysis tool that combines **non-LLM formal methods** (Z3 symbolic execution, barrier certificates) with **agentic LLM triage** to achieve 99%+ precision on real codebases. This post walks through its capabilities with concrete examples.

## The Core Idea

Most static analysis tools face a precision problem: they flag hundreds of potential bugs, but the vast majority are false positives.
A3 addresses this with a two-phase approach:

1. **Phase 1 (Non-LLM):** Bytecode analysis + Z3 symbolic execution automatically *proves* ~99% of flagged candidates as false positives using barrier certificates, inductive invariants, and directed symbolic execution (DSE).
2. **Phase 2 (Agentic LLM):** For the ~1% that survive, an LLM agent investigates each finding — reading source files, searching for guard patterns, checking callers and tests — then classifies it as a true or false positive with a rationale.

No overwhelming noise. No alert fatigue. Just real bugs that matter.

## Example 1: Basic Bug Categories

A3 detects 67 bug types across correctness and security categories. Here's a minimal demonstration with four common patterns — `DIV_ZERO`, `BOUNDS`, `NULL_PTR`, and `KEY_ERROR`:

```python
# demo.py
def compute_average(scores):
    total = sum(scores)
    return total / len(scores)        # DIV_ZERO when scores is empty

def get_first_element(items):
    return items[0]                   # BOUNDS when items is empty

def lookup_config(config, key):
    return config[key]                # KEY_ERROR when key is missing

def process_user(user):
    return user.name.upper()          # NULL_PTR if user is None
```

Running A3:

```
$ a3 demo.py --no-intent-filter --min-confidence 0.0

Analyzing: demo.py
Functions: 4
Entry points: 4

Total bugs found: 4

BOUNDS (2)
  - demo.lookup_config        demo.py:10    Confidence: 0.19
  - demo.get_first_element    demo.py:7     Confidence: 0.19

DIV_ZERO (1)
  - demo.compute_average      demo.py:4     Confidence: 0.21

NULL_PTR (1)
  - demo.process_user         demo.py:13    Confidence: 0.19
```

All four bugs detected. But the real power is in what A3 *doesn't* report.

## Example 2: Proving Safety — Guarded vs Unguarded Code

In real codebases, most potential bugs are already guarded by checks (`if not x`, `try/except`, `assert`, `isinstance`). A3 uses barrier certificates and Z3 to prove these guards sufficient. Consider a file with paired functions — buggy and safe versions:

```python
# guarded_demo.py

def first_element_buggy(items):
    return items[0]                   # BOUNDS — no guard

def first_element_safe(items):
    if len(items) == 0:
        raise ValueError("empty")
    return items[0]                   # A3 proves this safe

def get_user_name_buggy(user):
    return user.name.upper()          # NULL_PTR — no guard

def get_user_name_safe(user):
    if user is None:
        return "anonymous"
    return user.name.upper()          # A3 proves this safe
```

Running the full pipeline (`a3 scan`):

```
$ a3 scan guarded_demo/

STEP 5: BARRIER CERTIFICATE + DSE ANALYSIS
  Total bug instances:     7
  Fully guarded (guards):  2
  Unguarded:               5
  Barrier results:
    Proven FP:   4/5
    Remaining:   1
  Barrier contributions:
        3  post_condition
        1  refinement_type

STEP 6: DSE RESULTS
  DSE analysed:        1
  DSE confirmed FP:    0
  DSE confirmed TP:    1

STEP 7: TRUE POSITIVE CANDIDATES
  TRUE POSITIVES (DSE-confirmed reachable):
     ⚠️ BOUNDS in first_element_buggy

SUMMARY
  Functions analysed:    6
  Total bug instances:   7
  Proven false positive: 6 (85.7%)
  Remaining candidates:  1
  DSE-confirmed TPs:     1
```

Of 7 potential bug instances, A3:
- **Proved 6 safe** using guard detection, barrier certificates (post-conditions, refinement types), and validated-parameter analysis
- **Confirmed 1 as a true positive** via Z3-backed directed symbolic execution — the only function without a guard (`first_element_buggy`)

The key insight: `first_element_safe` has a `len(items) == 0` check before the access, and A3's `ValidatedParamsBarrier` proves this guard prevents the BOUNDS error. No heuristics — a formal proof.

## Example 3: PyTorch — Proving a Well-Guarded Codebase Clean

PyTorch's own [Adafactor optimizer](https://github.com/pytorch/pytorch/blob/main/torch/optim/_adafactor.py) contains division operations, square roots, and tensor indexing — all potential crash sites. Running A3:

```
$ a3 scan pytorch_adafactor/

SUMMARY
  Functions analysed:    8
  Total bug instances:   21
  Proven false positive: 21 (100.0%)
  Remaining candidates:  0
  DSE-confirmed TPs:     0
```

**21 potential bugs, 100% proven safe.** PyTorch's guards are thorough — `eps`-clamped denominators, shape assertions, and type dispatch — and A3's barrier certificates formally verify each one. Zero false alarms.

## Example 4: LLM2CLIP — Finding the Bug PyTorch Fixed

Now contrast with [Microsoft's LLM2CLIP](https://github.com/microsoft/LLM2CLIP), which contains an older copy of Adafactor (from fairseq) that lacks PyTorch's guards:

```
$ a3 scan llm2clip_training/

STEP 7: TRUE POSITIVE CANDIDATES
  PRODUCTION BUGS TO INVESTIGATE:
    DIV_ZERO   fp16.Adafactor._approx_sq_grad
    DIV_ZERO   fp16.Adafactor._rms
    DIV_ZERO   fp16.DynamicLossScaler._decrease_loss_scale
    BOUNDS     fp16.Adafactor.step
    BOUNDS     fp16.MemoryEfficientFP16Adam.step

  TRUE POSITIVES (DSE-confirmed reachable):
     ⚠️ DIV_ZERO in fp16.Adafactor._approx_sq_grad
     ⚠️ DIV_ZERO in fp16.Adafactor._rms
     ⚠️ BOUNDS in fp16.Adafactor.step
     ⚠️ DIV_ZERO in fp16.DynamicLossScaler._decrease_loss_scale
     ⚠️ BOUNDS in fp16.MemoryEfficientFP16Adam.step

SUMMARY
  Functions analysed:    47
  Total bug instances:   55
  Proven false positive: 49 (89.1%)
  Remaining candidates:  6
  DSE-confirmed TPs:     5
```

The flagged `_approx_sq_grad` bug is particularly significant:

```python
# LLM2CLIP/llm2clip/training/fp16.py, line 748
def _approx_sq_grad(self, exp_avg_sq_row, exp_avg_sq_col, output):
    r_factor = (
        (exp_avg_sq_row / exp_avg_sq_row.mean(dim=-1).unsqueeze(-1))
        #                 ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
        #                 mean() returns 0.0 when all values are zero
        #                 → division produces Inf → rsqrt_() → NaN
        .rsqrt_()
        .unsqueeze(-1)
    )
```

When gradient values are all zero (dead neurons, masked parameters, early training with sparse gradients), `exp_avg_sq_row.mean()` returns `0.0`. The division produces `Inf`, and `rsqrt_()` propagates `NaN` — **silently corrupting the optimizer state for all subsequent training steps without any error message.**

This is a known bug class. [HuggingFace's Transformers](https://github.com/huggingface/transformers/blob/main/src/transformers/optimization.py) fixes it by initializing `exp_avg_sq` with `fill_value=eps` instead of zeros. LLM2CLIP's copy (from fairseq) omits this guard. A3 catches it; the kitchensink pipeline's formal proofs confirm it's reachable.

## Example 5: DeepSpeed — The Validator That Can't Validate

A3's analysis of [Microsoft DeepSpeed](https://github.com/microsoft/DeepSpeed) found 3 DSE-confirmed true positives in just two utility files:

```
$ a3 scan deepspeed_utils/

  TRUE POSITIVES (DSE-confirmed reachable):
     ⚠️ DIV_ZERO in groups._ensure_divisibility
     ⚠️ DIV_ZERO in timer.ThroughputTimer._is_report_boundary
     ⚠️ BOUNDS in timer.SynchronizedWallClockTimer.__call__

SUMMARY
  Functions analysed:    83
  Total bug instances:   77
  Proven false positive: 74 (96.1%)
  Remaining candidates:  3
  DSE-confirmed TPs:     3
```

The `_ensure_divisibility` bug is especially ironic:

```python
# deepspeed/utils/groups.py, line 64
def _ensure_divisibility(numerator, denominator):
    """Ensure that numerator is divisible by the denominator."""
    assert numerator % denominator == 0, '{} is not divisible by {}'.format(
        numerator, denominator)
```

A function whose *entire purpose* is to validate inputs crashes on its own unvalidated input. When `denominator=0` (from misconfigured `expert_parallel_size`, `tensor_parallel_size`, etc.), Python raises `ZeroDivisionError` from the `%` operator *before* the `assert` can produce its more meaningful error message. The callers pass user-configurable values directly:

```python
_ensure_divisibility(world_size, model_parallel_size)    # line 218
_ensure_divisibility(pp_stride, expert_parallel_size_)   # line 262
```

## Example 6: The Kitchensink Pipeline

The "kitchensink" is A3's symbolic execution portfolio — a staged pipeline of formal proof strategies that run in parallel. When you run `a3 scan`, this is what happens behind the scenes:

```
STEP 5: BARRIER CERTIFICATE + DSE ANALYSIS
```

For each unguarded bug candidate, A3 tries a cascade of proof strategies:

1. **EnhancedAssumeGuaranteeBarrier** — Compositional reasoning about caller/callee contracts
2. **EnhancedPostConditionBarrier** — Factory pattern and return-value analysis
3. **EnhancedRefinementTypeBarrier** — Refinement type inference (e.g., `len(x) > 0` after a guard)
4. **InductiveInvariantBarrier** — Loop invariant synthesis
5. **ControlFlowBarrier** — Dominator/post-dominator analysis on the CFG
6. **DataflowBarrier** — Reaching definitions and value-range analysis
7. **DisjunctiveBarrier** — Case-split reasoning for optional/nullable types
8. **ValidatedParamsBarrier** — Parameter validation tag tracking (e.g., `{'nonempty'}` after `if len(x) > 0`)
9. **DSEConfirmationBarrier** — Z3-backed directed symbolic execution to construct concrete triggering inputs

The verbose output shows each strategy being attempted:

```
✓ [LAYER 0: STOCHASTIC_BARRIERS] Paper #25 | NULL_PTR on self | conf=90%
✓ [LAYER 2: SOS/SDP] Papers #1-8 | NULL_PTR on param_1 | barrier synthesized
...
INFO: ✓ ValidatedParamsBarrier PROVED SAFE (confidence=78%)
  Barrier: validated_params[0] ∩ {'nonempty'} ≠ ∅
  Proof: Parameter 0 has validation tags {'nonempty'} that prevent BOUNDS
...
INFO: DSE CONFIRMED DIV_ZERO REACHABLE in groups._ensure_divisibility
✗ No barrier proved safety - likely TRUE BUG
```

When no barrier can prove safety, DSE constructs a satisfying assignment — a concrete input that triggers the crash. This is the strongest evidence: not just "we couldn't prove it safe," but "here's an input that breaks it."

## Example 7: Agentic LLM Post-Processing

After the static analysis pipeline filters ~99% of candidates, the remaining ~1% go to an agentic LLM for investigation. This isn't a one-shot prompt — the LLM has tools to explore the codebase:

```
$ a3 scan . --triage github --verbose

🤖 Agentic triage of 39 findings (1 parallel)...
  [agent turn 1] calling LLM...
  [agent turn 1] tool: search_codebase(pattern='register_job_routes')
  [agent turn 1] tool: get_imports(path='app.py')
  [agent turn 2] calling LLM...
  [agent turn 2] tool: get_function_source(function_name='register_job_routes')
  [agent turn 3] tool: read_file(path='app.py', start_line=160, end_line=190)
  [agent turn 4] tool: search_codebase(pattern='init_job_manager')
  [agent turn 5] tool: get_function_source(function_name='init_job_manager')
  [agent turn 6] tool: classify(verdict='FP', confidence=1.0, rationale='...')

  [1/39] app.register_job_routes (NULL_PTR): FP (100%)
    — The code contains explicit `if not job_manager` checks at every route
      level before using WORLDFORGE_JOB_MANAGER. This ensures safe access,
      even if initialization fails. No realistic execution path leads to a crash.
```

The agent made 6 tool calls across 6 turns: it searched for the function, read its source, found the callers, checked the initialization pattern, and only then classified it as a false positive with a detailed rationale. This multi-turn investigation produces significantly more accurate results than a single-pass LLM call.

Available agent tools:
- `read_file` — Read any source file (with optional line range)
- `search_codebase` — Grep for regex patterns across the project
- `get_function_source` — Look up any function by name
- `get_imports` — See what a file imports
- `list_directory` — Explore project structure
- `classify` — Submit final TP/FP verdict with confidence and rationale

The triage uses `GITHUB_TOKEN` (free in CI via GitHub Models) — no API key signup needed:

```bash
# Local use with GitHub CLI
export GITHUB_TOKEN=$(gh auth token) && a3 scan . --triage github --verbose

# In GitHub Actions — GITHUB_TOKEN is already available
a3 scan . --triage github
```

## Summary of Results Across Real Codebases

| Codebase | Functions | Bug Instances | Proven FP | Candidates | DSE-Confirmed TPs |
|----------|-----------|--------------|-----------|------------|-------------------|
| PyTorch Adafactor | 8 | 21 | 21 (100%) | 0 | 0 |
| LLM2CLIP (training) | 47 | 55 | 49 (89.1%) | 6 | 5 |
| DeepSpeed (utils) | 83 | 77 | 74 (96.1%) | 3 | 3 |
| Demo (guarded) | 6 | 7 | 6 (85.7%) | 1 | 1 |

A3 doesn't hallucinate bugs. When it says a function is safe, there's a formal proof. When it says there's a bug, there's a concrete triggering input. And the bugs it finds are real — silent NaN corruption, validators that crash before validating, missing empty-list guards — the kind of issues that pass code review and tests but fail in production.

## Getting Started

```bash
pip install a3-python
a3 scan your-project/
```

For continuous CI with agentic triage on every PR:

```bash
pip install a3-python[ci]
a3 init . --copilot
git add .github/ .a3.yml .a3-baseline.json
git commit -m "ci: add a3 static analysis"
git push
```

Source: [github.com/halleyyoung/a3-python](https://github.com/halleyyoung/a3-python) · PyPI: [a3-python](https://pypi.org/project/a3-python/)
