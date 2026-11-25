---
name: next-task
description: Start the next task from docs/TASKS.md following the project workflow (pick, branch, read references, plan). Use when the DM says to start or continue work.
disable-model-invocation: true
---

Start work on a task following CLAUDE.md.

1. If `$ARGUMENTS` names a task (e.g. `DC-094`), use it. Otherwise take the next open task in `docs/TASKS.md`: section 3.0 first, then 3.1, 3.2 …, top to bottom, skipping tasks marked ✓. If the next task depends on an open decision or an unfinished task, say so and stop.
2. Branch: if the current branch is a feature branch for the same topic, stay on it. Otherwise update `main` (`git checkout main && git pull`) and create `feature/<topic-slug>`. Ask the DM if it is unclear whether the task belongs to the running topic.
3. Read: the task, the decisions it cites (E-… in `docs/TASKS.md` §1), the relevant parts of `docs/PLAN.md`, the Dungeon-Manager tasks/ADRs it refers to (T-…, ADR-…; https://github.com/Ga-Re/Dungeon-Manager), and the existing code in `app/`. For UI, layout, styling or UX, also read and apply `.claude/skills/ui-design/SKILL.md`.
4. Write the plan: approach, files to touch, tests (unit, and how to check it in the running app), risks, open questions. For UI: which zone/panel/ribbon tab, which theme tokens.
5. If anything triggers "When to stop and ask the DM" in CLAUDE.md – including anything not entirely clear – ask now (2–4 options with a recommendation) and wait. If several related decisions are open, run `/topic-interviewer`.
6. Otherwise show the plan briefly (German) and start: tests first for logic.
