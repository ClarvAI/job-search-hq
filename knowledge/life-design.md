# Life Design: the method behind /explore

Last researched: 2026-10-29. App reference (not user data). The `explore` skill follows the flow below; `coach-prep`, `thank-you` and `today` use parts of it. It blends several approaches rather than copying one program. Credit the ideas when the user asks where they come from; don't present any step as a specific school's official exercise.

## Where the ideas come from

| Source | What we borrow | Reference |
|---|---|---|
| Burnett and Evans, *Designing Your Life* (Stanford Life Design Lab and d.school course) | Reframing stuck beliefs ("my one perfect job is out there" becomes "I build a path by trying things"); separating fixed facts of life from problems you can act on; noticing energy and engagement over a week or two; writing short views on why you work and what makes life meaningful; drafting several different possible lives instead of one plan; talking to people living a version of that life before testing it; choosing well and then letting go of the other options. | Book (2016) and *Designing Your Work Life* (2020); summaries such as antoinebuteau.com/designing-your-life-book-summary |
| Johns Hopkins, Integrative Learning and Life Design (ILLD) | Four stages in plain words (get curious, imagine possible lives, experience more, craft your story); the four questions after any experience: what energized you, what challenged you, what did you discover, what might you try next; careers as "squiggly lines"; the learner decides; AI helps you get unstuck, it doesn't write your story for you. | illd.jhu.edu (read 2026-10-13); imagine.jhu.edu "Three Lives" activity |
| Herminia Ibarra, *Working Identity* (INSEAD) | You learn what you want by doing, not by introspection alone: crafting small experiments, shifting connections (new people outside your current circle), and making sense (revising your story as you go). The best-supported idea for mid-career changers. | INSEAD working paper 2004-21 |
| Mark Savickas, career construction and Life Design counseling | Career adaptability: concern (thinking about the future), control (owning the decision), curiosity (exploring), confidence (believing you can act). Useful as a check on what someone is missing, never as a score. | marksavickas.com, Career Adapt-Abilities chapter |
| John Krumboltz, planned happenstance | Unplanned events open doors if you're curious, persistent, flexible, optimistic and willing to take small risks: ask after each try what happened that they didn't plan. | Krumboltz (2009); summary at tahatu.govt.nz |
| Wrzesniewski and Dutton, job crafting | For someone employed: reshape the current job's tasks, relationships or meaning to test a direction before leaving. | Academy of Management Review (2001) |

**What the evidence says:** small, mostly student studies (not randomized). A Stanford study of the Designing Your Life course (Oishi, 2012) found higher career self-efficacy and fewer dysfunctional career beliefs than a comparison group, but no drop in uncertainty. Promise momentum and better next steps, not certainty.

**Known criticisms:** it can assume time, money and headspace the user may not have; too many options can overwhelm; it's career-centric. The guardrails below answer each one.

## The flow (what `explore` does)

1. **Check the constraints first** (guardrail: money and time). How soon do they need income? What can't change right now (location, caregiving, visa, health, money)? Those are fixed facts to design around, not problems to solve; say so kindly. Everything after this stays inside what's affordable for the next 6-12 months.
2. **Notice energy** (Stanford energy log, Hopkins "get curious"). Recall-based by default: two or three times in the last year or two they lost track of time or felt drained, and what they were doing. Offer an optional one-week log (one line a day: what I did, energy up or down, absorbed or not) saved in the notes.
3. **What matters** (Stanford work and life views, Hopkins reflect). Two short answers in their words: what work is for, for them; what makes a life good. Plus strengths people come to them for and where they do their best work. Reflect back; they confirm.
4. **Unstick beliefs** (Stanford reframing, Savickas). Listen for "I'm too old", "I have to pick the right one", "I wasted my degree". Offer a reframe in one line and one fact behind it. No lecturing.
5. **Three possible lives** (Stanford several lives, Hopkins Three Lives). Three different next 3-5 years: (a) the current path, carried forward and improved; (b) what they'd do if that path disappeared tomorrow; (c) the one they'd try if money and other people's opinions mattered less (still inside step 1's constraints). For each: a short title, what a week looks like, one question it raises. They rate each, in their own words or 1-5: how much they like it, confidence they could do it, whether the money and time work, how well it fits what matters.
6. **Talk before trying** (Stanford conversations, Ibarra shifting connections). For the one or two leading lives, two conversations each with people already doing that work, especially outside their current circle (`network` drafts the asks).
7. **Try small** (Ibarra experiments, Stanford trying it out, job crafting). One time-boxed experiment per leading life, with a date: a shadow day, a short project, a course module, a volunteer shift, a freelance gig, or (employed) a crafted piece of their current job. Real applications only for roles they'd take.
8. **Reflect after each try** (Hopkins four questions, Krumboltz). The four questions, plus "Did anything happen you didn't plan that's worth following?" Then: this direction got stronger, weaker, narrower, or a new one appeared.
9. **Make sense and tell the story** (Ibarra making sense, Hopkins craft your story). When a direction wins, turn what they tried and learned into two or three sentences for networking and a "why this change" answer; new true facts go to the master resume or story bank only with their OK.
10. **Choose and act.** One next step with a date, every time. When a direction is clear: set it as the target in preferences (their yes), then `find-jobs`, `tailor-resume`, `network`.

If someone seems stuck on one adaptability (no thought about the future, waiting for others to decide, no curiosity, no belief they can act), aim the next step at that one. Don't name or score it.

## Guardrails

- **Money first.** Ask about urgency before imagining lives and experiments. With income needed soon, run exploration alongside applying for a bridge job, never instead of it.
- **Three, not ten.** At most three lives and one or two leading directions at a time. Clarity comes from trying, not from more options.
- **Every session ends with a dated next step.**
- **Their words, their choice.** Reflections are written in the user's words. The assistant offers structure, options and evidence; it never decides, and nothing in the notes is a resume fact until they confirm it.
- **Not therapy.** If reflection brings up distress, grief or crisis, stop the exercise, respond with care, and point to a counselor or crisis line (the `today` skill's wellbeing line has the numbers). Money trouble, visa or health questions go to the right professional.
- **No tests or labels.** No personality types, scores or diagnoses.
