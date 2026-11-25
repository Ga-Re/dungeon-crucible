---
name: finish-task
description: Finish the current task - run all checks, self-review, run the reviewer subagent, update docs/TASKS.md, commit, and at the end of a topic open the pull request. Use when implementation of a task is complete.
disable-model-invocation: true
---

Finish the current task following CLAUDE.md. Do not skip steps.

1. Name the task (DC-…) and re-read what it requires; confirm each point is met and covered by a test or a check in the running app. If not, finish it first.
2. In `app/`: run `npm test`, `npx tsc --noEmit -p .` and `npm run build`. For visible changes, check them in the real app (`npm run build`, then Electron with a test script or `npm start`; screenshots of the window, and of other displays with `screencapture -x -D <n>` when windows move between monitors). Use a temporary user-data and documents folder in test scripts so the DM's own data is never touched. Fix failures – never weaken tests.
3. Self-review `git diff main...HEAD` for this task: scope, naming, dead code, i18n (en + de), hidden data on the TV, file rules (`keepUnknown`, versions, lowercase ids), path confinement. If UI or CSS changed, check `.claude/skills/ui-design/SKILL.md`.
4. Run the `reviewer` subagent on the task's changes. Fix blocking findings; note the reason for any you do not fix.
5. Update `docs/TASKS.md` (✓, or ◐ with what is left; new tasks for follow-ups) and `docs/PLAN.md` if behaviour or structure changed.
6. Commit (English message: summary line, then what and why; the attribution lines the session asks for).
7. Report to the DM in German: what works, how it was checked, what is left, the next task.
8. **Only at the end of a topic** (when the DM says so, or the topic's tasks are done): push the branch, open one PR with `gh pr create` (what changed per task, tests, checks, open points), wait for CI, and ask the DM to approve the merge. Never merge without the DM's go.
