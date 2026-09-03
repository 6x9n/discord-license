# Discord Tool V1 Agent Instructions

## Project scope
This repository is a vanilla browser dashboard for a Discord account manager. The app is built from static HTML, CSS, and JavaScript with no bundler or framework.

## Core priorities
- Preserve the existing HTML structure and DOM IDs used by the dashboard.
- Prefer small, deterministic fixes over broad rewrites.
- Keep state synchronization centralized so UI metrics, operation history, and button states remain aligned.
- Ensure all user-triggered actions flow through a single guarded operation lifecycle.

## Operation pipeline rules
- Never allow multiple operation jobs to start at the same time.
- Reserve the running state before triggering asynchronous account reloads.
- Protect the operation queue with a consistent `state.running`/`state.stopped` guard.
- Use `prepareOperation()` and `runOperation()` as the canonical execution path for destructive actions.
- When rate limits occur, keep retries bounded and user-visible.

## UI conventions
- Keep styling and structure responsive and mobile-friendly.
- Reuse existing classes and IDs before introducing new ones.
- Preserve accessible button labels, focus states, and SVG icon patterns.

## Validation
- Run a JavaScript syntax check after changes using `node --check` on the edited script.
- Prefer targeted verification over broad rebuild steps because the app is static.

## Notes
- The app stores account and UI state in `localStorage` and `sessionStorage`.
- Any destructive operation must be treated as a user-initiated action with clear stop and history behavior.
