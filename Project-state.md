## Operation Confirmation Popup Style

Use this pattern for Friends, Leave Servers, Close DMs, and future destructive operations:

- Use the existing `.modal` and `.modal-card.leave-confirm-card` structure.
- Keep the modal dark glass with a centered title, short plain-language description, and two equal-width actions.
- Render counts and estimated time as plain centered text, not pills or boxed containers.
- Use green for ready/success counts, amber for skipped/protected/whitelisted counts, and muted gray for estimated time.
- Show whitelist counts in the confirmation summary before the user confirms.
- Calculate ETA from the number of actionable items and `currentDelay()`; do not include skipped whitelist items.
- Keep confirmation, cancellation, Escape, and backdrop-close behavior consistent.
- Store whitelist values through `CONFIG.dsc.whitelists` and `loadWhitelists()`/`setWhitelist()`; never introduce a second storage format.
- For Private DMs, allow whitelist matching by channel ID and recipient name, and skip protected rows in single, batch, and all-item operations.

## Project Overview

- Vanilla browser dashboard for managing one Discord account.
- No bundler or framework; the app runs from static HTML, CSS, and JavaScript.
- Main files: `index.html`, `css/styles.css`, and `js/manager.js`.
- Account, UI, operation history, and whitelist state are stored in `localStorage`/`sessionStorage`.
- The app uses Discord API v9 requests through the shared `apiCall()`/`makeRequest()` path.

## Request And Operation Flow

- `makeRequest()` handles JSON responses, `Retry-After`, bounded retries, and rate-limit warnings.
- Rate-limit retries are capped at `MAX_RATE_RETRIES` and use a bounded fallback delay when Discord does not send a retry value.
- Operation stop aborts the active controller and cancels retry waits and nested deletion delays.
- `prepareOperation()` loads current account data before building operation items.
- `runOperation()` is the canonical sequential operation runner for generic destructive actions.
- Operation buttons are locked while work is running and restored after completion or cancellation.
- Concurrent `loadAccountData()` calls share one in-flight promise to avoid duplicate dashboard refresh bursts.
- Non-success API responses are surfaced as operation failures instead of being treated as successful resolved promises.

## Dashboard And Profile State

- Dashboard startup refreshes the active account and account metrics.
- Profile badge rendering uses `getUserBadges()` and the current profile response.
- Dashboard profile badges filter Legacy Username when it is explicitly hidden, preventing stale profile history from appearing as an active badge.
- Account refreshes update the badge-selection view through `window.refreshBadgeView()` when available.

## Badge Management

- Manage Badges supports HypeSquad Bravery, Brilliance, Balance, and Legacy Username.
- `getEquippedBadgeInfo()` detects Legacy Username from protobuf visibility settings, normalized profile badges, and direct profile fields.
- `legacyUsernameOverride` gives immediate UI feedback after successful equip/remove actions and resets when accounts are changed or cleared.
- Removing Legacy Username clears stale local profile badge data before the refresh completes.
- Equipping/removing badges updates card selection, Equipped labels, action buttons, and profile/dashboard rendering.
- The live flow was tested: Legacy Username correctly changed between Equipped, Remove, and Equip states across navigation.

## Close DMs

- The Dashboard Close DMs action closes/hides active DM channels through `DELETE /channels/{channelId}`.
- It no longer toggles account-wide DM privacy settings.
- Both 1:1 DMs (`type === 1`) and group DMs (`type === 3`) are supported.
- Channels are processed sequentially through the guarded operation lifecycle.
- Successful channel closes are removed from `state.channels` and update the Dashboard DM metric.
- The confirmation popup reports actionable DMs, skipped whitelist entries, direct/group counts, and ETA.
- ETA uses the current configured operation delay and excludes skipped items.

## Whitelist System

- Whitelists are stored per account under `CONFIG.dsc.whitelistsByAccount`, keyed by validated Discord account ID, with each value shaped as `{ servers: [], friends: [], dms: [] }`.
- Settings saves and reloads the active account's whitelist through `loadWhitelists()` and `setWhitelist()`.
- The former global `CONFIG.dsc.whitelists` record is migrated once to the active account and then removed.
- Private DM inspector rows now include `Whitelist`/`Un whitelist` actions.
- DM whitelist matching supports channel IDs and recipient names.
- Single Close DM and Ignore actions refuse whitelisted DMs.
- Batch Close and Ignore actions filter whitelisted IDs and show a skipped-items warning.
- Main Close DMs skips whitelisted channels.
- Friends and Leave Servers confirmation windows show their whitelist/protected counts.
- Server and friend whitelist behavior remains compatible with the existing settings UI.

## Confirmation Popup UI

- Friends, Leave Servers, and Close DMs use the shared `.modal-card.leave-confirm-card` visual style.
- Dialogs use a centered title, concise description, plain centered count text, plain ETA text, and two equal-width actions.
- Count pills and boxed ETA containers were removed from these confirmation dialogs.
- Ready counts use green, protected/whitelisted counts use amber, actionable categories use distinct accent colors, and ETA uses muted gray.
- Confirmation, Cancel, Escape, and backdrop-close behavior are supported.
- Leave Servers calculates its ETA from the selected actionable server count.
- Remove Friends calculates its ETA from the current removable relationship count.

## Verification Completed

- Live browser checks confirmed the Close DMs popup opens with counts and ETA.
- Live whitelist toggle test saved a DM ID, changed the label to `Un whitelist`, then restored it to `Whitelist`.
- Live badge tests confirmed Legacy Username removal and re-equip update the card and action controls immediately.
- `node --check js/manager.js` passes after the implementation changes.
- Editor diagnostics report no errors in `index.html`, `css/styles.css`, `js/manager.js`, or this document.

## Future Implementation Rules

- Read this file before adding another destructive operation.
- Reuse existing IDs, whitelist storage, modal classes, and operation lifecycle helpers.
- Do not create a second whitelist format or a second request/retry system.
- Add actionable counts, skipped protected counts, and ETA to new confirmation dialogs.
- Keep UI state updates immediate after successful mutations, then reconcile with a server refresh.

## Saved Account Cache

- `CONFIG.dsc.accounts` stores `{ username, token, user }` for each saved account, including the cached Discord profile and avatar hash.
- `loadAccounts()` migrates older records and keeps valid nested `user` profile data so saved-account avatars render before validation.
- Empty records without a token are discarded during migration.
- Saved account rows use array indexes for Use/Delete actions; switching validates the token and rebuilds the full active user state in memory.
- The active session state remains in memory for app features; saved accounts persist the validated profile cache for display.

## Active Operation Dashboard Template

- Every destructive operation uses the Operation terminal as its live log surface.
- Confirming an operation opens the terminal immediately with a `preparing` state when data still needs to load.
- Back to Menu returns to Dashboard without cancelling the operation.
- While running, all destructive operation buttons remain disabled; the active operation retains its loading state.
- `currentOperationBar` appears in the Dashboard Operations panel with the operation name and `current / total • percentage` progress summary.
- `View Log` reopens the current operation terminal while work is running.
- The status bar clears on completion, stop, preparation failure, or when there is no actionable work.
- Use the shared `setCurrentOperation()` and `updateProgress()` hooks for new operations instead of creating separate progress UI.
- Close DMs additionally keeps its per-DM result modal, showing each conversation name, channel ID, and closed/failed status.