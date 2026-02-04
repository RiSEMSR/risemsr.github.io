---
title: Agentic Proof-Oriented Programming
description: Exploring AI-assisted proof-oriented programming with Copilot CLI and F*.
author: Nik Swamy
---

* Author: Nik Swamy, with thanks to Lef Ioannidis, Matthai Philipose, Alex
  Lavaee, Jana Kulkarni, and many others
 
Can AI assist in building programs with formal proofs of correctness? Researchers in
MSR and elsewhere have been working on this research goal for a few years
([1](https://arxiv.org/abs/2405.01787), [2](https://arxiv.org/abs/2404.10362),
[3](https://sites.google.com/view/autoverus), ...), but my recent experience
using [Copilot CLI](https://github.com/features/copilot/cli) to develop programs with proofs in [F\*](https://fstar-lang.org) and
[Pulse](https://fstar-lang.org/tutorial/book/pulse/pulse.html) has been eye
opening. We might be on the verge of Agentic PoP---AI-assisted proof-oriented
programming, where human experts focus on specifications, high-level design, and
a few key invariants, and AI agents take care of the mechanics of constructing
formal proofs. 

This could vastly expand the scope of proof-oriented programming: could it be
possible to tackle significantly larger verified systems with small teams of
experts to review specifications and orchestrate many PoP agents? I'm much more
optimistic about this than I was even just a week ago!

In short: using Copilot CLI and Claude Opus 4.5, I was able to produce formally
verified, imperative, concurrent libraries in Pulse, starting with simple things
like a bubble sort on arrays and a ring buffer, but also a priority queue, an
iterator library for linked lists, a hashtable with chained buckets, and even
concurrency control primitives like a reader-writer lock and a counting
semaphore. This is a total of about 10,000 lines of verified code and proofs,
something that would have probably taken me some weeks of focused work to
produce. The resulting code has been committed to the Pulse repository in a
series of pull requests---backed by a machine-checked proof, this type of code is much
easier to review and merge.

This is the first in a series of posts on this blog exploring the use of AI to
construct provably correct programs. Many of us in RiSE are exploring this
space, and at the moment we probably have more questions than answers. But, it's
an exciting time, and we hope this will interest you to explore too, to try out
our tools with agentic strategies that we haven't thought of yet, and to help us
find what the limits are.

I'll dive right in and provide some context as I go, starting with a brief
introduction to proof-oriented programming in F\*.

## Background: Proof-oriented Programming

If you know about F\* feel free to skip this section.

F\* is a proof-oriented programming language. Within the same language, one
writes executable programs backed by mathematical specifications and formal
proofs, demonstrating that the programs meet their specifications. For just a
quick taste, one might write a quicksort function on lists with the following
specification and proof:

```fstar
let rec quicksort (l:list int)
: Tot (m:list int { sorted m /\ permutation l m })
      (decreases (length l)) =
  match l with
  | [] -> []
  | pivot::rest ->
      let less = filter (fun x -> x < pivot) rest in
      let greater = filter (fun x -> x >= pivot) rest in
      partition_lemma l pivot less greater; //call a supporting lemma
      quicksort less @ (pivot :: quicksort greater)
```

This functions sorts a list of integers, and its type states that the result `m`
is a sorted permutation of the input list `l`, and that the function always
terminates. The code is decorated with various annotations to help F\* prove it
correct, including the `decreases` clause to indicate why the recursion
terminates, and a call to a supporting lemma `partition_lemma` that helps prove
that the partitioning step is correct. For a summary of F\*, check out this
chapter from the F\* tutorial: [A Capsule Summary of
F\*](https://fstar-lang.org/tutorial/book/intro.html#introduction).

As you can probably tell from this example, proof-oriented programming involves
thinking deeply about the properties of programs, and then convincing the
compiler (which internally uses another RiSE tool, the SMT solver
[Z3](https://github.com/Z3Prover/z3)) that those properties hold through various
proof hints.

F\* supports a variety of programming paradigms, not just functional
programming. For example, one can write imperative programs with shared-memory
concurrency and prove them correct in Pulse, an embedded language in F\*. You
can learn more about Pulse
[here](https://fstar-lang.org/tutorial/book/pulse/pulse.html#pulse-proof-oriented-programming-in-concurrent-separation-logic).

Programming in this way requires quite a bit of expertise, and it can be quite
laborious to produce a large verified program, but it offers very strong
assurances about your program. We have used F\* and related tools to build
several large high-assurance systems and system components, many of which have
been running for years in production systems at Microsoft, e.g., see [Project
Everest](https://project-everest.github.io/). A question many people have been
asking recently is whether or not AI can make proof-oriented programming easier.

## Setup

Copilot CLI integrates tool-using AI models with your command line development
environment. It provides support for multiple models and is configured, by
default, to use Claude Sonnet 4.5. It also provides support for Claude Opus 4.5,
which is what I mainly used.

My dev environment includes fstar.exe, the Pulse language extensions, and
various libraries. Copilot CLI allows you to expose these tools to agents, just
by writing basic prompts that describe the tools and their usage.

Here's a [codespace](https://github.com/FStarLang/pulse-sandbox) that reproduces
my setup in a VM---so you can try it out yourself in your browser. You'll need
to click on "Code" then "Codespaces" to launch a codespace.

![Pulse Sandbox Codespace](../../../assets/pulse-sandbox-codespace.jpg)

The agent descriptions I used are also available there. I actually started with
much simpler descriptions and then after interacting with the agents for a
while, I had them summarize my interactions into the
[agent](https://github.com/FStarLang/FStar/tree/master/.github/agents) &
[skill](https://github.com/FStarLang/FStar/tree/master/.github/skills)
descriptions included in the codespace.

## Warmup: Bubble Sort in Pulse

I started with some simple proofs in pure F\* (e.g., pure functions to find a
minimum element in a list, remove duplicate elements from a list), and these
kinds of exercises worked well with Copilot CLI. So, I moved on to see if I
could get the agent to help me write imperative code in Pulse. 

My first attempt didn't go so well. I gave the agent a task analogous to the
pure F\* tasks, but this time on mutable data structures, i.e., find the minimum
element in a mutable array. The agent stumbled on this, trying to write a while
loop with an invariant in a style that was documented in an older version of the
Pulse tutorial, but is no longer recommended. I can't confirm this, but perhaps
the model had been trained on this older tutorial content. So, I augmented the
prompt with one example of how to write a while loop with an idiomatic
invariant.

### A Small Example in Pulse, for the Model & You

Here's the example I added to the agent description to give the model some
reference code using an idiomatic while loop in Pulse. The reader might find this
example useful too, if only to get a feeling of what Pulse code looks like:

```pulse
// Pure specification: what it means for an index to be the max position
let is_max_position (s: Seq.seq int) (idx: nat{idx < Seq.length s}) : prop =
  forall (i: nat). i < Seq.length s ==> Seq.index s idx >= Seq.index s i

fn max_position (a: array int) (len: SZ.t)
requires a |-> Frac 'p 's
requires pure (SZ.v len == Seq.length 's /\ Seq.length 's > 0)
returns result: SZ.t
ensures a |-> Frac 'p 's 
ensures pure (SZ.v result < Seq.length 's /\ is_max_position 's (SZ.v result))
{
    // Initialize max_idx to 0, loop counter to 1
    let mut max_idx = 0sz;
    let mut i = 1sz;
    while (!i < len)
    invariant exists* vi vmax_idx. 
      i |-> vi **
      max_idx |-> vmax_idx **
      pure (
        SZ.v vi <= Seq.length 's /\
        vmax_idx < vi /\
        (forall (k: nat). k < SZ.v vi ==> Seq.index 's (SZ.v vmax_idx) >= Seq.index 's k)
      )
    {
      let vi = !i;
      // Update max_idx if we found a larger element
      if (a.(vi) > a.(!max_idx)) {
        max_idx := vi;
      };
      i := vi + 1sz; // Increment loop counter
    };    
    !max_idx; // Return the max position
  }
```

The function `max_position` takes a mutable array of integers `a` and its length
`len`, along with some ghost parameters for permissions and the abstract
sequence `s` that represents the contents of array `a`. The preconditions state
that `a` points to `s` with some fractional permission `p`---only requiring `p` 
"parts of ownership" over `s`---and that `len` matches the length of `s` and 
is greater than 0. The function returns the index of the maximum element in `a`,
ensuring that the array's permissions are preserved, that the returned index is
valid and corresponds to the maximum element in `s`, where `is_max_position`
is a pure mathematical function defined as a specification in F\*.

Some of the complexity of the code comes from manipulating array indices,
which like in C are of type `SZ.t`, the type of machine-sized integers in Pulse.
One has to decorate loops with invariants to convince the checker that the code
is correct.

### Back to Bubble Sort

With this one example, I asked the agent to implement bubble sort on an array of
integers and prove it correct. To my surprise, it produced a correct
specification and implementation of bubble sort, around 200 lines of code, with
the usual doubly nested loop that one expects in bubble sort. In doing so, the
agent repeatedly invoked the Pulse verifier, fixed errors, and refined the proof
until it was correct. The entire process took around 10 minutes and was entirely automated.
Once it was done, I asked the agent to generalize the code to use a typeclass for elements with a
total order, rather than just integers, and this too it did very quickly. The
full result is available online,
([PulseExample.BubbleSort](https://github.com/FStarLang/pulse/blob/5e02af0713aed5d96eeb1b0c62c33a13e0089d5f/share/pulse/examples/PulseExample.BubbleSort.fst)).
but here's a snippet of the main specification: the main point to note is that
the array contents at the end (`s`) is a sorted permutation of the initial
contents (`s0`).

```pulse
// Generic bubble sort with complete formal specification and proof
fn bubble_sort (#t:eqtype) {| total_order t |}
  (a: array t) (#s0: Ghost.erased (Seq.seq t)) (len: SZ.t)
requires A.pts_to a s0 ** pure (
  SZ.v len == Seq.length s0 /\
  Seq.length s0 <= A.length a /\
  SZ.v len > 0
)
ensures exists* s. A.pts_to a s ** pure (
  Seq.length s == Seq.length s0 /\
  sorted s /\
  permutation s0 s
)
```

Of course, bubble sort is not necessarily the best sorting algorithm. I picked
it because, as far as I know, there is no existing verified implementaton of
bubble sort in F\* or Pulse, so it was a good first test. In contrast, there are
several implementations of quicksort, insertion sort, mergesort, etc.

## Plan Mode: Extend the Pulse Library

Encouraged by the model's unexpected fluency in Pulse, I switch Copilot CLI to
"plan mode", where you can ask the agents to plan for a more complex task. It
was getting late in the evening, so I wanted to set a task to run overnight.
Now, by default, Copilot CLI does not support tasks that run all night, but I
didn't realize that at the time. Nevertheless, I asked the agent to review the
Pulse library and to identify five data structures and algorithms that were
missing, and to implement them with full specifications and proofs. It proposed
to implement a stack, a ring buffer, a linked list iterator, a priority queue,
and a hashtable with chained buckets. I approved the plan, and went to bed. 

When I checked on it in the morning, the ring buffer and stack were done. The
stack was not particularly interesting---it could be easily implemented on top
of LinkedList. The ring buffer was non-trivial though, and the agent produced a
nice, idiomatic specification for the library, with a snippet shown below---the
full code, spec, and proof is about 500 lines of code
([PR](https://github.com/FStarLang/pulse/pull/531/))

```pulse
/// Push an element to the back of the ring buffer
/// Behavior when full: Returns false and does not modify the buffer (reject mode)
/// This ensures we never lose data without explicit acknowledgment
fn push_back (#t:Type0) (rb:ringbuffer t) (x:t)
  (#s:erased (Seq.seq t))
  (#cap:erased nat{cap > 0})
  requires is_ringbuffer rb s cap
  returns success : bool
  ensures exists* (s':Seq.seq t).
    is_ringbuffer rb s' cap **
    pure ((success ==> (Seq.length s < cap /\ s' == Seq.snoc s x)) /\
          (not success ==> (Seq.length s == cap /\ s' == s)))
```

The linked list iterator had failed, with a remark in the code that
Pulse.Lib.LinkedList was missing a function to read the head of the
list---embarrassing! So, I asked it to implement that function in the linked
list library first, and then to re-attempt the iterator library. This time it
succeeded, producing a nice iterator library that allowed one to traverse linked
lists, with full specifications and proofs. Interestingly, the proof of
iterators requires using separations logic's "magic wand" operator, which in
Pulse is called a "trade". The model had no trouble with this, after looking
through the library to find other uses of trades
([PR](https://github.com/FStarLang/pulse/pull/530/)).

The priority queue and hashtable are both larger tasks, and the agent appeared
to simply run out of time, leaving behind an explanation that the task was too
complex to complete in the given time. I set it to re-attempt these tasks one by
one, and with some high-level guidance from me, describing a few common pitfalls
of reasoning about sequences and sets in F\* and Pulse, it was able to complete
both these proofs---more on the guidance I provided below.

The priority queue is about 1,500 lines of verified code, specification, and
proof ([PR](https://github.com/FStarLang/pulse/pull/535)); the hashtable is
about 4,000 lines long ([PR](https://github.com/FStarLang/pulse/pull/537/)),
including an interface that supports an iterator over all the key-value pairs in
the hashtable.

## Expert Guidance: Reader-Writer Lock

Basic sequential data structures are one thing, but can the agent help with
concurrent data structures? I decided to try a reader-writer lock. The Pulse
libraries include a simple mutex and a barrier, so a reader-writer lock would be
a useful addition, i.e., a lock to protect a resource that allows multiple
readers to acquire the lock but only one writer.

Proving this data structure in Pulse, as in other separation logics, requires
the use of atomic operations, fractional permissions, ghost state, invariants,
and step-indexing with later credits, all of which are fairly advanced features
of Pulse. The agent produced a nice specification of a reader-writer lock, but
struggled to get the implementation correct. 

A first attempt tried to build a reader-writer lock on top of a simple mutex---this does not work as it does not distinguish between read and write access. I tried to guide it towards the solution I wanted in natural language, e.g.,

> The interface looks good, but the implementation has admits and is not correct. You need to implement a new kind of lock from scratch, using atomic operations on a machine word, where the value of the word indicates the number of readers that have currently acquired the lock, and with a designated value to indicate that a writer has acquired it, e.g., MAX_UINT32. You also need some ghost state to do the permission accounting, so that you can maintain an invariant that when the lock has not been acquired, you have full permission to the predicate, and otherwise you have a share that is 1 - the sum of the fractions that have been handed out to all the readers


This helped, but the agent still struggled to get the proof correct. I tried more
detailed technical guidance in natural language:

> Your invariant and ghost state construction is not strong enough. Consider the following: in your ghost state, maintain a map `reader_perms` from `nat -> option perm`. `reader_perms i = Some f` means that reader i holds `f` fraction. Maintain an invariant that says that if the current counter = n, where n is not a sentinel, then there are exactly n positions at which reader_perms is Some _. Also maintain a ghost freshness counter, above which reader_perms is always None. Then the sum of all the permissions in the reader_perms  to the freshness counter is the total permission handed out to readers and the lock holds 1 - this total amount. This way, then the counter is 0, you know the lock holds full permission. When a reader acquires, increment the freshness counter, associate that fresh position with the reader token, and record that fraction given to the reader (half the current amount) in the map. When the reader releases, clear that entry in the map, decrement the counter, and add the fraction stored at that point back to the amount held by the lock. Ask any clarifying questions, make a plan, and then implement it without any admits!

But this didn't produce a fully correct proof either. To be honest, I found it
awkward to describe technical invariants in natural language---it's just not
precise enough. And, in fact, my guidance was not quite right either, as I
realized later.

> Actually, my answer to your clarifying questions was wrong. The ownership of the ghost map does need to be split so that each reader has #0.5 knowledge of their index id in the map, while the lock retains the other half permission over that point in the map. You observed this need to split maps in this manner in your reasoning trace. Take a look at Pulse.Lib.GhostFractionalTable, which lets you define a ghost table and then share out ownership of individual entries in the table. You might also want to take a look at the implementation of Pulse.Lib.ConditionVar, which also uses a similar table (though it is an SLPropTable built on top of GhostFractionalTable), and notice how its invariant relates the content of the table to a sequence. You can use a similar style, but in this case you are summing up permissions rather than taking the separating conjunction of all predicates in the table

This too did not fully work, but it was getting closer to a solution. Finally, I switched
tack and decided that I would write down what I thought was the correct invariant
in formal F\* code:

> Let's try a different approach. Look at Pulse.Lib.RWLockMine.fst. I have defined the rw_lock_inv predicate, the reader_parts and reader_token and writer_token. This invariant should work (though I may have missed some details, this is the sketch I have in mind). Now, can you use this invariant to program the rest of the library, keeping the same interface as we had before. Work in Pulse.Lib.RWLockFresh. No admits! If you think you need to change my invariant, then stop and ask for help. Otherwise, go for it and finish the proof. No admits!!

This time, it did work. My conjectured invariant was indeed strong enough to prove
the library correct. This is the invariant I had written down---I don't expect
you to read it in detail, but you can see that it is quite involved. 

```fstar
// Explicit pure predicate for table_relation
// We'll have to fold and unfold this in proofs
// Useful to guide instantiations of existstials in rwlock_inv_aux
let table_relation (n : U32.t) (table_size : nat) (entries:index_set) (spec:table_spec) (f:perm) =
  pure (
    (if n = writer_sentinel 
     then Set.cardinality entries = 0  //if the writer holds, then there are no active readers
     else Set.cardinality entries == U32.v n) /\ //otherwise, number of active readers = n
    table_spec_well_formed spec table_size entries /\ //the 
    total_frac spec entries +. f == 1.0R
  )

let ghost_counter_perm (n:U32.t) : perm =
  if n = writer_sentinel then 0.5R else 1.0R

let rwlock_inv_aux (pred : perm -> slprop)
                   (counter : B.box U32.t)
                   (ghost_counter: GR.ref U32.t)
                   (perm_table : GFT.table frac)
: slprop
= exists* (n : U32.t) (table_size : nat) (entries:index_set) (spec:table_spec) (f:perm). 
    B.pts_to counter n ** //counter is the actual physical counter on which do atomic operations
    GR.pts_to ghost_counter #(ghost_counter_perm n) n ** //ghost witness of counter value, only half when writer locks
    GFT.is_table perm_table table_size ** //permission to the table itself, allcoated up to table_size
    OR.on_range (owns_half_table_entry perm_table spec) 0 table_size ** //half permission to all the table entries up to table size
    (if n = writer_sentinel then emp else pred f) ** //available permission in the lock
    table_relation n table_size entries spec f ///pure relation tying it all together

/// Reader parts: the permission data for a reader token
let reader_parts #pred (l : rwlock pred) (f:frac) : slprop = 
  exists* (i : nat).
    GFT.pts_to l.perm_table i #0.5R f ** //entry i in the table has a non-zero fraction
    pure (f >. 0.0R) 
    //so, the cardinality of the set of active entries is at least 1
    //and so the counter must be at least 1
```

But, with this ~30 line invariant, the agent then proceeded to write a fully
verified module about 1,200 lines long:
[PR](https://github.com/FStarLang/pulse/pull/534)

This, to me, was a very pleasant interaction. I enjoy thinking about invariants
and the key ideas underlying the correctness of algorithms and data structures.
Convincing a tool that the invariant is correct often requires a lot of,
frankly, tedious steps to get the proof to go through. In this case, I was able
to focus on the key invariant, and the agent took care of the rest.

In other words, these agents are not an outright replacement for human
expertise. Instead, they seem to accelerate expert humans. I would imagine that
they also reduce the barrier to entry for less experienced users, e.g., one
might get quite far just by being able to read and critique formal
specifications, rather than needing to write such specifications and proofs. Put
a different way, riffing on [Cory Doctorow's thought-provoking
article](https://www.theguardian.com/us-news/ng-interactive/2026/jan/18/tech-ai-bubble-burst-reverse-centaur), 
I still feel distinctly a centaur, not a reverse centaur.

## Learning from Examples: Counting Semaphore

As a last experiment, I wanted to see if the agent could learn from the
reader-writer lock and apply similar ideas to implement a counting semaphore.
There are lots of similarities between the two: a counting semaphore also allows
multiple threads to acquire a permit, up to a maximum count.

Explicitly asking the agent to reference the reader-writer lock and adapt it to
produce a counting semaphore worked out quite smoothly---I had to critique and
revise the specification, and I had to provide some informal guidance about the
invariant, but I did not need to drop down and write a formal invariant myself.
[PR](https://github.com/FStarLang/pulse/pull/541)

An interesting anecdote: once the proof was complete, I noticed that the code
had a needless dynamic check for an overflow when releasing a permit, decorated
with a comment saying that this couldn't happen at runtime though the agent
could not prove it. I asked the agent to remove this check, explaining that the
overflow is impossible because when a permit is held, the counter value is
strictly less than maximum bound, meaning an increment of the counter is safe.
That was enough for it to refactor the proof, removing the check and completing
the proof correctly.

Again, this level of interaction with a proof assistant was unheard of. Too
often, mechanized proof assistants feel like proof curmudgeons, requiring to
convince the machine of every step. Being able to express intuition and
high-level intent and for the proof assistant to complete the work is a dream. 

## Questions, Limitations, ... 

I hope I haven't been too effusive in my description of this experience. I have
truly been amazed by my experience, but I also have many questions for what's
ahead. First, let me be explicit about some limitations. 

### Specifications are not Omnipotent

Good specifications abstract important aspects of programs. For example, the
specification of bubble sort only says that it returns a sorted permutation of
the input. The specification does not say that the algorithm implemented is
really bubble sort, e.g., insertion sort and merge sort also have the same specification.

Functional specifications in F\* and Pulse usually do not cover
aspects related to complexity and resource usage, much less concrete performance
aspects. Specifications do not account for underlying assumptions about the runtime,
operating system, and hardware stack, on top of which we execute programs.
As Donald Knuth famously said, "Beware of bugs in the above code; I have
only proved it correct, not tried it." 

Dynamic approaches to software assurance, like testing, fuzzing and profiling 
are still necessary to complete the picture. Verified Pulse programs can be 
*extracted* to OCaml, C, or Rust for execution. The agents appear perfectly
capable of wielding F\*'s compilation toolchain to produce such executable code
and testing it---but I'll leave writing about that for the future.

Finally, a major limitation of Pulse is that the language currently supports only
*partial* correctness proofs, meaning a verified program can loop forever. We
are working to improve this, allowing proofs of termination in Pulse, though
some properties like liveness proofs for concurrent programs will be harder to
add. In contrast, pure functions in F\* are always proved terminating.

All of which is to say that formal specifications and proofs help to *reduce*
what a human needs to audit about the code, it does not eliminate it completely.

### What are the Limits?

This is the big question. Certainly, the tasks I set for the agents were
non-trivial, but they were still at the scale of a single verified module at a
time. How far can this be pushed? Can an agent decompose an application into a
hierarchy of composable, verified modules? We have some experiments with that to
report on in a future post. 

Along another dimension, what is the barrier to entry for non-experts? Could
someone who is not an author of F\* and Pulse use this approach to build a
non-trivial verified system?

What else can we use agentic proof engineers for? Proof maintenance is a big
issue in mechanized proof---as tools and specifications evolve, the proofs need
to adapt too. Early experiments suggest that agents can help with this
too---more in a future post.

### Learning from Agents

Agents seem to be fine working around the rough edges of F\* and Pulse. There's
a lot to learn from agent traces. As I mention below, in producing these proofs,
the agents called the F\* verifier thousands of times. Mining those traces,
noting the kinds of errors produced, the reasoning steps the agent tries and 
fails to adapt to formal code, the error messages that the agent has to work
hard to decipher---all of this and more could be a great way to improve the
tools. 

### Costs \& Consequences?

If we truly are on a path where the mechanics of proof engineering is largely
automated, what are some consequences?

On the one hand, I'm excited to try to build verified systems at a much larger
scale than previously. 

Conversely, I also wonder about how to ensure that agents do not diminish the
pipeline of younger researchers and engineers learning how to do mechanized
proofs. Is it possible to learn high-level proof-oriented architecture without
ever wrestling with a proof? I don't know.

This code was produced over the course of a single 67 hour session with Copilot
CLI and Claude Opus 4.5. Of course, the session was not continuously active, but
it did involve around 6M input tokens, 2M output tokens, and around 4,300 tool
invocations. The total cost for that ranges between $120--$200, depending on
caching efficiency. There are also environmental and other costs to consider.
Understanding how to weigh those costs when taking on large AI-enhanced projects
is important, though I have nothing meaningful to say about that, at least not
yet.

