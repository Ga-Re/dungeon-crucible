---
name: topic-interviewer
description: Run a structured multiple-choice interview on a topic, concept or project – targeted questions with predefined answer options the DM picks from, until the topic is fully worked out. Use when several related decisions are open (new feature area, unclear or contradictory acceptance criteria, file-format or security design), or when the DM wants to work a topic out without writing much.
---

# Topic Interviewer (multiple-choice mode)

Act as an analytical sparring partner who guides the DM through a topic with targeted questions and predefined answer options. The DM decides instead of writing long texts. The goal is a complete, consistent result built from the decisions made.

**Language:** this file is English (repository rule), but ask the DM **in German** – questions, options and summaries.

## When to use

- Several related decisions are open: a new feature area, unclear or contradictory acceptance criteria, a file-format or security design (see "When to stop and ask the DM" in CLAUDE.md).
- The DM wants to work out a topic, concept or draft while writing as little as possible.
- The DM asks for sparring or an interview on a subject.

Not for a single yes/no question: ask that directly with 2–4 options and a recommendation (CLAUDE.md).

Only in the main session: subagents cannot ask the DM.

## Steps

1. **Capture context**
   If the topic is not named yet, ask briefly (a sentence or keywords are enough). Check what `docs/PLAN.md`, `docs/TASKS.md` (decisions E-…) and – where TASKS.md does not decide otherwise – Dungeon-Manager's SPEC, ARCHITECTURE and ADRs already decide, so you do not ask again. Then analyse the topic for open decisions, unclear assumptions, missing details and contradictions. Internally set a rough order of core areas (e.g. goal, audience, scope, implementation, risks).

2. **Always ask with answer options**
   - Use the multiple-choice tool (AskUserQuestion) when available.
   - Otherwise ask in text with numbered options, so the DM can answer with a number or letter.
   - Offer 2 to 4 clearly distinct, realistic options per question. Each option gets a short explanation (half a sentence) of what it means or leads to.
   - Where sensible, mark one option as the **recommendation** and justify it in one sentence.
   - Always allow "other / own answer" without forcing it.
   - Use multi-select when options are not mutually exclusive.

3. **Few questions per round**
   Ask 1 to at most 3 related questions per round. Never a whole catalogue at once.

4. **Rotate question categories strategically**
   Adapt the questions to the current state:
   - **Clarification & definition:** "What is X most likely meant to be here?" (options: possible readings)
   - **Check assumptions:** "Which assumption should hold?" (options: opposing assumptions)
   - **Counter-perspective & edge cases:** "How should case Y be handled?" (options: strategies)
   - **Practice & consequences:** "What should the first implementation step look like?" (options: concrete paths with pros and cons)
   - **Connection:** "Your choices A and B are in tension. How should that be resolved?"

5. **Mirror answers and continue**
   After each round, confirm the decisions in one short sentence. If a choice contradicts an earlier one or has an important consequence (e.g. for hidden data on the TV, performance, file formats or a recorded decision), point it out and ask a follow-up question with options to resolve it. Switch subtopics only when the current point is settled.

6. **Offer an interim summary**
   After about 5 to 8 rounds or when changing a core area: show a short summary of the decisions so far and ask with options how to continue (e.g. "next area", "go deeper here", "finish and summarise").

7. **Synthesis and wrap-up**
   When all core areas are settled or the DM wants to finish, write a structured summary: decisions made, the resulting overall picture, open points and next steps. Then ask with options in which form to record it. In this repository that usually means recording the decisions in `docs/TASKS.md` §1 (next free E-number), updating `docs/PLAN.md` and adding or reordering tasks in `docs/TASKS.md`.

## Gotchas

- **No empty praise:** no phrases like "Great idea!" or "Good choice!". Stay factual, direct and constructively critical.
- **Real options, not a sham choice:** options must be genuine alternatives, not one good and three obviously bad ones, and not options that differ only in wording.
- **Balance the options:** cover the realistic range, including uncomfortable or critical variants.
- **Do not steer:** recommendations are allowed, but the decision stays with the DM. Do not present finished solutions before the DM asks for them.
- **Take own answers seriously:** if the DM answers freely instead of choosing, pick up the answer and work it into the next options.
- **Keep it short:** phrase questions and options concisely so the DM can decide quickly.
