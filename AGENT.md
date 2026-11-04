# Agent Rules

## Build order
Follow the order in docs/DESIGN.md. One item at a time.

## Discuss then build
For each item, discuss look and behave first. Complete only as agreed.

## Document every completion
After each work or feature, add an entry to docs/system.md with:
what it is, how it was done, why it was done that way, its importance, and any metadata.
No item counts as done without this entry.

## Tooling
Default to `bun` for JS/TS work (`bun install`, `bun run <script>`,
`bunx <bin>`). No `npm`/`npx` unless bun cannot do the job.

## Format before push
Run `bun run format` in `workers/api` before every push; pushes are
blocked by a local pre-push hook (`format:check`) when unformatted.
Never push with `--no-verify`.

## Git hygiene
`node_modules/`, `.wrangler/`, `dist/`, `.dev.vars`, `*.db`,
`__pycache__/` are gitignored — never force-add them. Commit lockfiles
(`bun.lock`); never commit two lockfiles for one package.

## Think Before Coding.
No silent assumptions. State what you're assuming. Surface tradeoffs. Ask before guessing. Push back when a simpler approach exists.

## Simplicity First.
Minimum code that solves the problem. No speculative features. No abstractions for single-use code. If a senior engineer would call it overcomplicated — simplify.

## Surgical Changes.
Touch only what you must. Don't "improve" adjacent code, comments, or formatting. Don't refactor what isn't broken. Match existing style.

## Goal-Driven Execution.
Define success criteria. Loop until verified. Don't tell Claude what steps to follow, tell it what success looks like and let it iterate.

## Destructive filesystem ops (mv, rm, overwrite)

Post-incident rule, 2026-10-31: an `mv` overwrote the master seed.

1. Commit a safe point first, then request approval — no exceptions.
2. List the target directory before the op; never assume names are free.
3. One op per command. Verify between steps (`ls` after each move).
4. Prefer non-destructive forms: `cp` + verify + `rm`, or `mv -n` (no-clobber).
5. Never chain two dependent moves in a single command.
