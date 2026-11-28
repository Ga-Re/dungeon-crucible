# CLAUDE.md – Working rules for this repository

Dungeon Crucible is a desktop app (Electron + React + PixiJS, in `app/`) for a Dungeon Master (DM) to build maps,
manage campaigns and run sessions with a table-top TV as the players' view.

Work like a careful senior engineer: understand before changing, keep changes small and reviewable, test what you
build, explain trade-offs honestly, and push back when something is a bad idea. The DM (the human) decides
everything listed under "When to stop and ask".

**Talk to the DM in German** (questions, reports, summaries). Code, comments, commit messages and PR descriptions
are in English; `docs/` is German.

## Read first

- `docs/PLAN.md` – product plan: decisions, workspaces, data layout, roadmap, status
- `docs/TASKS.md` – decisions from the comparison with Dungeon-Manager (E-1 …) and the task list (DC-…); the single
  source of truth for what to do next
- `app/README.md` – how to run, build and package the app

Dungeon Crucible follows the design of [Ga-Re/Dungeon-Manager](https://github.com/Ga-Re/Dungeon-Manager) (its
`docs/SPEC.md`, `docs/ARCHITECTURE.md`, ADRs) **except where `docs/TASKS.md` §1 records a different decision**.
When a task refers to a Dungeon-Manager task (T-…) or ADR, read it there.

## Workflow

Use `/next-task` to start a task and `/finish-task` to finish it.

- **One feature branch per topic** (e.g. `feature/start-screen-map-forge`): several related tasks are committed on
  it, one commit or more per task. Never commit to `main` directly (docs-only changes only when the DM says so).
- At the end of a topic: open **one PR**; the **DM approves the merge** ("merge"). Do not merge without it.
- Per task: understand (task, PLAN/TASKS, Dungeon-Manager references, existing code) → short plan → tests first for
  logic → implement → verify (tests, typecheck, build, the real app for anything visible) → update `docs/TASKS.md`
  (✓ / ◐ with what is left) → commit.
- Report to the DM after each task (German, short): what works, how it was checked, what is left, the next step.

## When to stop and ask the DM

Ask **before** acting when:

- adding, removing or upgrading a **dependency** (name, purpose, size, license, maintenance, alternatives incl.
  "write it ourselves")
- changing a **file format or the folder layout** that campaigns or the library use (needs a migration plan)
- **deviating** from `docs/PLAN.md`, `docs/TASKS.md` or a recorded decision (E-…)
- anything touching **security** (file access, the asset protocol, IPC, network, permissions)
- **anything is not entirely clear** – acceptance, behaviour, wording, scope

If several related decisions are open, work them out with `/topic-interviewer`. For a single question, ask with
2–4 concrete options and a recommendation.

## Engineering principles

- **The TV never sees hidden data.** The table window only receives the whitelisted projection
  (`app/src/core/projection.ts`); it fails closed (black on anything invalid). The table bundle must not contain DM
  code (`scripts/check-table-bundle.mjs`).
- **File rules** (`app/src/core/documents.ts`): every document is read with version check and migration, written with
  `keepUnknown` (unknown fields survive), never written back when it comes from a newer version; ids are lowercase;
  new ids are random and never reused.
- **Root folder** (`app/electron/rootFolder.ts`): all file access is confined to it; the asset protocol serves the
  library only, never campaign data. Device settings stay in the app's data folder, never in the root folder.
- **Pure core:** `app/src/core/` has no I/O, no React, no PixiJS; time and randomness are injected where it matters.
- **Validate at the edges:** files and IPC messages go through zod schemas / type checks in the main process.
- **Errors are handled, not swallowed;** messages for the DM are actionable and translated.
- **i18n:** no hard-coded UI strings (`app/src/i18n/en.ts`, `de.ts`; the UI follows the system language).
- **UI:** follow `.claude/skills/ui-design/SKILL.md` for any UI, layout or CSS change.
- **Performance:** the TV must keep 60 FPS with a 4K video map and living fog (`npm run bench`); renderer changes
  must not regress it.
- Small, readable code over clever code; comments explain why; no dead or commented-out code.

## Checks

Run in `app/`:

- `npm test` – unit tests (Vitest)
- `npx tsc --noEmit -p .` – typecheck
- `npm run build` – typecheck, Vite build, table-bundle check, Electron bundles
- `npm run visual` – image comparisons of the terrain against `app/visual/` (local only; `-- --update` after an
  intended change)
- `npm start` – the app with hot reload; check visible changes in the real app (screenshots of the window, and of
  other displays with `screencapture -x -D <n>` when windows move between monitors)

CI (`.github/workflows/build.yml`) runs `npm test`, `npm run build` and the desktop builds for macOS and Windows.

## Public repository

This repository is **public**: everything committed is visible to anyone, forever.

- No licensed third-party content (purchased maps, tokens, sounds), not even as test fixtures.
- No personal or device data: no campaigns, player names, paths from the DM's machine, keys or tokens.

## Git

- Commit messages in English: a short summary line, then what and why. End with the attribution lines the session
  asks for.
- Never force-push shared branches or rewrite merged history; never weaken a test to make it pass.

## Never

- Merge without the DM's go, or change `main` directly (except docs when the DM says so)
- Send hidden data to the table window
- Add a dependency, change a file format or deviate from a recorded decision without asking
- Commit licensed assets, personal data or secrets
