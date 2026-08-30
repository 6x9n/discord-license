# Project State — Discord Manager Tool

## Phase 1: Web License Activation & Trial System

Status: **Phase 1 complete — UI + client logic shipped. Phase 2 backend + admin shipped in-repo (env config required).**

### UI-UX PRO MAX Design System — ADOPTED (css/styles.css + index.html)
- **Palette**: `#0e1015` bg, `#181b22` surface, `#222733` card overlays, `#5865F2` Discord accent, `#23a55a` success, `#f23f43` error. All tokens centralized in `:root` CSS variables.
- **Design language**: Premium glassmorphism — `backdrop-filter: blur(16px)` on cards, header, modal, and toasts; layered `1px solid rgba(255,255,255,0.08)` borders; inset top-highlights; multi-layer drop shadows; fixed radial-gradient + noise background aura.
- **Typography**: Inter (`gg sans` fallback) via Google Fonts; fluid scale via `clamp()`; `letter-spacing: -0.02em` on headers.
- **License screen refinements**: glowing purple top border (`.license-card .card-glow`), focus ring `0 0 0 3px rgba(88, 101, 242, 0.4)` on input, labeled key field, SVG icons on all buttons.
- **Buttons**: gradient primary fill, hover elevation (`translateY(-2px)`), glowing borders, ambient `pulse-glow` aura on active actions, `loading` shimmer overlay state.
- **Toasts**: floating glass stack top-right (`#toastContainer`), slide-in/slide-out, auto-dismiss with animated progress bar. Kinds: `success` / `error` / `info`.

#### Animation integration (js/license.js wires; css/styles.css defines)
| Keyframe | Purpose | Wired at |
|----------|---------|----------|
| `pulse-glow` | Ambient aura on active buttons, header `sessionPlan` badge, panel icon | CSS auto + JS `renderSession` |
| `card-entrance` | Spring-bounce (`cubic-bezier(0.16, 1, 0.3, 1)`) on card/glass-panel render | `showScreen()` |
| `shake-error` | Horizontal shake on key/activation failure | `setMsg(..., 'error')` |
| `ripple-click` | Press feedback (`scale(0.97)`) on buttons | `ripple()` on click handlers |
| `shimmer-loading` | Metallic sweep on busy buttons/wait states | `setBusy()` |

Extra keyframes added to support the toast system: `screen-in`, `toast-in`, `toast-out`, `toast-progress`, `aura-drift`. `prefers-reduced-motion` fully honored.

**Compatibility guarantees**: all Phase 1 element IDs preserved (`licenseScreen`, `appScreen`, `licenseActivateBtn`, `licenseTrialBtn`, `licenseBuyBtn`, `licenseKeyInput`, `licenseMsg`, `sessionPlan`, `trialCountdown`, `lockBtn`, `renewalModal`, `renewalMsg`, `renewalGrace`, `renewalCheckBtn`, `toastContainer`). No JS bindings changed, only visuals + additive UI helpers.

**Responsiveness**: fluid `clamp()` type/spacing, media queries at 320px, 600px, 2000px (4K) breakpoints; toast stack reflows to full-width on mobile.

### licenseScreen PRO MAX pass — ADOPTED (css/styles.css, index.html, js/license.js)
All `licenseScreen` element IDs unchanged; existing JS bindings untouched (paste control is additive).

- **Container**: `.license-card` now `width: min(90%, 420px)`, centered via flexbox on `#licenseScreen { min-height: 100vh }`, fluid padding `clamp(1.25rem, 5vw, 2.25rem)`.
- **Glass card**: `background: rgba(22, 24, 29, 0.85); backdrop-filter: blur(20px) saturate(180%)`.
- **Top glow**: animated sweeping accent highlight `.card-glow` (linear-gradient transparent→rgba(88,101,242,.6)→transparent, `@keyframes top-glow-sweep`).
- **Status dot**: `.brand-dot` now breathes via `@keyframes neon-pulse` (2s infinite ease-in-out).
- **Key input**: `rgba(0,0,0,0.3)` bg, monospace stack (JetBrains Mono/Cascadia/Consolas), circular paste button (`#licensePasteBtn` — new ID, wired additively in license.js via `navigator.clipboard.readText()` with manual-paste fallback toast), blue focus ring `0 0 0 2px #5865F2, 0 0 15px rgba(88,101,242,0.35)`.
- **Buttons**: primary holds `transform: scale(0.97)` on active press + new `@keyframes spin` spincircle loading state (`.btn.loading::before`); secondary/outline hovers gain contrast + subtle accent glow.
- **Touch targets**: `@media (max-width: 768px)` forces 100% width, `min-height: 48px` on all license-screen buttons and the key input.
- Keyframes added: `neon-pulse`, `card-reveal` (spring entry — now drives license card entrance), `top-glow-sweep`, `spin`. `shake-error` retained for validation failures.

### Architecture
- Pure web app, no build step: `index.html` + `js/manager.js` (manager layer) + `js/license.js` (UI/boot wiring) + `css/styles.css`.
- License state persisted in `window.localStorage`. Remote validation via the Vercel server.
- Runs in any modern browser. Designed to be embedded in an Electron/webview wrapper later.

### File map
| File | Purpose |
|------|---------|
| `index.html` | App shell: `licenseScreen`, `appScreen`, renewal modal, all target elements |
| `js/manager.js` | `window.manager` API + `window.CONFIG` constants |
| `js/license.js` | Screen/button wiring, trial countdown, renewal watchdog |
| `css/styles.css` | Responsive dark UI, modal overlay |
| `Project-state.md` | This document |

---

### `window.manager` methods — COMPLETE (js/manager.js)
| Method | Status | Description |
|--------|--------|-------------|
| `ensureLicenseActive()` | Done | Returns `true` if cached license `expiresAt` is still in the future, or a trial is currently within its 10-min window. |
| `getLicenseCache()` | Done | Reads `dmt.license.cache` from localStorage, returns parsed object or `null`. |
| `setLicenseCache(data)` | Done | Persists {key, plan, activatedAt, lastVerified, expiresAt} to `dmt.license.cache`. |
| `clearLicenseCache()` | Done | Removes `dmt.license.cache` from localStorage. |
| `offlineGraceRemaining()` | Done | Returns ms remaining of 24h offline grace window after `expiresAt` (0 if no cache). |

Supporting helpers (not in the target list, used by the UI layer): `trialStarted()`, `trialRemaining()`, `trialUsed()`.

### Config (js/manager.js)
- `apiBase`: `https://discord-license-server.vercel.app`
- `trialDuration`: 10 minutes (600000 ms)
- `offlineGraceMs`: 24 hours (86400000 ms)

---

### Web views — COMPLETE
| Element ID | Status | Description |
|------------|--------|-------------|
| `licenseScreen` | Done | Responsive centered card: key input + Activate + Start 10-Minute Trial + Buy a Code (Telegram) + status message. |
| `licenseActivateBtn` | Done | POSTs key to `/api/validate`; on `valid` sets license cache and unlocks app. |
| `licenseTrialBtn` | Done | Starts trial: stamps `dmt.trial.started` (epoch ms), marks trial consumed, clears license cache, unlocks 10-min session. Disabled once used. |
| `licenseBuyBtn` | Done | Anchor styled as button → `https://t.me/` (placeholder — replace with real Telegram handle). |
| `renewalModal` / `renewalCheckBtn` | Done | Mid-session renewal modal. Re-POSTs cached key to `/api/validate`; valid → resume, invalid → cache cleared + lock to `licenseScreen`. |

### Trial system — COMPLETE (js/license.js)
- Start timestamp: `dmt.trial.started` (epoch ms). Countdown rendered live (`mm:ss`), refreshed at 500 ms.
- On expiry: app locks to `licenseScreen`, `clearLicenseCache()` is called, and trial is permanently disabled via `dmt.trial.used = "1"`.
- Design note: `dmt.trial.used` is written at trial **start** as well as expiry, so refresh/restart cannot re-roll a second trial on the same browser. Documented here as an intentional strengthening of the "disable at expiry" requirement.
- Reload during an active trial resumes the remaining countdown from storage.
- Trial storage keys: `dmt.trial.started`, `dmt.trial.used` (guard), plus `dmt.license.cache` shared with licensed sessions.

### Vercel backend — IMPLEMENTED IN-REPO (api/ directory)
Previously the client pointed at an external pre-hosted URL. The license server is now built from scratch in this repository and the frontend calls the relative endpoint directly (no hardcoded external domain for APIs).

| File | Endpoint | Purpose |
|------|----------|---------|
| `api/validate.js` | `POST /api/validate` | Verifies `{ key }` against storage; checks revoked status + expiration; returns `{ valid, plan, expiresAt }` or `{ valid:false, message }`. |
| `api/admin/login.js` | `POST /api/admin/login` | Validates `{ password }` against `process.env.ADMIN_SECRET`; returns stateless HMAC session token (12h). |
| `api/admin/keys.js` | `GET/POST/DELETE/PATCH /api/admin/keys` | Auth-gated (Bearer token). GET lists all keys, POST generates (duration select), DELETE removes, PATCH revoke/extend(+30d). |
| `api/lib/store.js` | shared | Reads/writes keys. Uses Upstash Redis REST (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`) when configured, otherwise local JSON file `data/keys.json`. |
| `api/lib/utils.js` | shared | HMAC token sign/verify, CORS, key generator (`XXXX-XXXX-XXXX-XXXX`, unambiguous alphabet), plan mapping, expiration math. |

Request/response contract (kept as designed in Phase 1):
```json
POST /api/validate
{ "key": "XXXX-XXXX-XXXX-XXXX" }
→ 200 { "valid": true, "plan": "Monthly", "expiresAt": 1760000000000 }
→ 200 { "valid": false, "message": "..." }
```
Plan mapping: 1d→`Trial`, 30d→`Monthly`, 90d→`Quarterly`, 365d→`Yearly`, 0/lifetime→`Lifetime` (`expiresAt` `4102444800000`). Admin sessions: 12h stateless HMAC token.

Deployment: `vercel.json` rewrites `/admin`, `/admin/`, `/admin/:path*` → `index.html`. Required env: `ADMIN_SECRET`; add `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` for persisted key storage on serverless (local `vercel dev` uses `data/keys.json`).

## Phase 2: Vercel Backend + Admin Dashboard

Status: **Implemented (deployment env config required)**

### `/admin` dashboard — js/admin.js + `adminView` + css/styles.css
- **Routing**: hash handler binds `#admin` to `adminView`; `vercel.json` makes `/admin` and subpaths serve `index.html`. Admin link on the license screen footer (`#adminLink`) and app header. Hash `#admin`/`#license` routes handled dynamically via `hashchange`.
- **Auth screen**: password modal (`#adminLoginModal` + `adminLoginBtn`) shown before panels. Session in `sessionStorage['dmt.admin.token']` (12h HMAC token, cleared on tab exit). 401 → auto-logout to the login modal.
- **Key generation**: duration dropdown `#adminDuration` (1d Trial / 30 / 90 / 365 / Lifetime), label field `#adminNoteInput`, `adminGenBtn` → POST `/api/admin/keys`; generated key appears in `#adminCopyBox` (1-click copy: `navigator.clipboard.writeText` with execCommand fallback).
- **Keys table** (`#adminKeysTable`): columns Key / Plan / Created / Expiration / Status / Actions; rows rendered client-side with row action buttons `.adminRevokeBtn`, `.adminExtendBtn` (+30d), `.adminDeleteBtn` (event delegation). Status badges pulse (`Active`/`Revoked`), search bar `#adminSearchInput` filters instantly by key or note label.
- **Responsive**: toolbar collapses to 1 column ≤768px; table scrolls horizontally (`overflow-x`) on mobile; PRO MAX glass cards, glowing accent indicators.

### Frontend/backend wiring
- `js/license.js` now POSTs to relative `/api/validate` (external URL removed). `js/manager.js` `CONFIG.apiBase` removed. Shared UI helpers exposed as `window.appToast` / `window.appSetBusy` for reuse by admin.js.

### File map (new)
| File | Purpose |
|------|---------|
| `api/validate.js` | License validation function |
| `api/admin/login.js` | Admin auth function |
| `api/admin/keys.js` | Key CRUD function |
| `api/lib/store.js` | Upstash Redis + local JSON storage |
| `api/lib/utils.js` | Tokens, CORS, keygen, plan/expiry logic |
| `js/admin.js` | Admin dashboard logic + routing |
| `vercel.json` | `/admin` rewrites to `index.html` |
| `data/keys.json` | Local key persistence (dev) |

### Pending / blockers
- Set `ADMIN_SECRET` (required) and, for production persistence, `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` as Vercel env vars.
- Replace `licenseBuyBtn` Telegram placeholder with the real purchase link.
- Phase 3 candidates: periodic online re-validation of active licenses (true mid-session revocation without waiting for expiry), configurable per-row extend days, Electron wrapper.