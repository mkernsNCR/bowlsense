# BowlSense 2.0 integration QA

Date: 2026-07-21
Last updated: 2026-08-01
Branch: `agent/integration-qa`
Issue: #8

## Result

In progress. The final browser matrix completed 106 route/viewport checks with no horizontal page overflow, undersized visible controls, duplicate/missing main landmarks, duplicate/missing page headings, or private navigation on public pages. The primary browser flows produced no console errors. All automated and production-topology checks pass; the one remaining manual gate is actual Chrome page zoom at 200%, recorded below.

## Automated gates

| Check | Result | Evidence |
| --- | --- | --- |
| Frontend lint | Pass | `npm run lint` |
| Frontend regressions | Pass | `npm test`: 49 Node tests and 95 Vitest checks, including detailed physical-pin, rendered Today, public-layout, and service-worker cache-isolation scenarios |
| Production build | Pass | `npm run build`; only Vite's non-blocking 500 kB chunk advisory remains |
| Backend type-check and auth | Pass | `npx tsc --noEmit --allowImportingTsExtensions --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop --skipLibCheck src/server.ts`; 19 backend tests run under CI's Node 24 and verify trusted-proxy authorization, legacy schema convergence, retry idempotency, archives, restore, and public metadata. |
| Service-worker syntax and cache isolation | Pass | `node --check public/sw.js`; Node tests prove every public share route, including `/score/:id` and `/perfect-games/:id`, cannot replace the generic cached app shell while private navigations can refresh it. |
| Patch integrity | Pass | `git diff --check` |
| Backend runtime | Pass | `npm start` launches `tsx src/server.ts` on port 3003; `/health` returns `{ status: "ok", service: "bowlsense-api" }` |
| Dependency audit | Pass with one scoped exception | Root and backend audits contain no high/critical findings. The only remaining frontend npm finding is `GHSA-qwww-vcr4-c8h2`, which the upstream advisory limits to unstable React Server Components APIs; BowlSense is a client-only `BrowserRouter` SPA and uses none of those APIs. The advisory and npm were rechecked on 2026-07-31: `8.3.0` is now published as the patched major release, while BowlSense remains on the 7.x line. `npm run audit:ci` accepts only that exact advisory and its `react-router-dom` propagation, rejects RSC usage, and fails on any other high/critical finding. GitHub Actions reruns the policy after `npm ci`. |
| Sites build and D1 integration | Pass | Root `npm test` builds `dist/server/index.js`, initializes an in-memory D1-compatible schema, verifies fail-closed auth/public boundaries, atomically imports all ten tables, rejects destructive partial restores and invalid CSV/CRUD data, exercises private CRUD plus public share payloads, validates real PNG signatures and crawler metadata, and confirms missing resources return 404 |
| Sites package contract | Pass | Forward D1 migrations own the production schema, are stored under root `drizzle/`, staged into `dist/.openai/drizzle/`, and asserted by CI. Fresh databases receive `tournaments.active` in `0000`; `0001` is a compatibility marker, while one guarded worker preflight adds that column only when a pre-migration database already has `tournaments` without it. The integration test proves both fresh and legacy shapes converge without duplicate-column failure. `0002_ball_indexes.sql` adds the three ball lookup indexes. `0003_league_retry_idempotency.sql` reconciles legacy retry duplicates and enforces one week number per league and one game number per week. |

The backend has no project `tsconfig.json`, so the explicit single-entry TypeScript command above remains its compile gate; its Node test script covers the native trusted-proxy authorization policy.

## Responsive matrix

Private routes were checked at every required viewport. Public routes were checked at compact phone, modern phone, and desktop widths in addition to the landmark/privacy audit.

| Viewport | Private routes | Result |
| --- | ---: | --- |
| 320×568 | 14 | Pass |
| 390×844 | 14 | Pass |
| 768×1024 | 14 | Pass |
| 1024×768 | 14 | Pass |
| 1280×800 | 14 | Pass |

Private routes: `/`, `/sessions`, `/sessions/new`, `/quick`, `/stats`, `/pin-leaves`, `/score-calculator`, `/balls`, `/arsenals`, `/leagues`, `/tournaments`, `/perfect-games`, `/settings`, `/help`.

Public routes checked at 320×568, 390×844, and 1280×800: `/bowl`, `/score/1`, `/sessions/1/share`, `/leagues/1/public`, `/leagues/1/leaderboard`, `/leagues/1/share`, `/leagues/1/recap/share`, `/leagues/1/week/1/share`, `/tournaments/1/share`, `/tournaments/1/standings`, `/tournaments/1/standings/share`, `/perfect-games/1`.

Every matrix check asserted:

- `documentElement.scrollWidth` and `body.scrollWidth` do not exceed the client width.
- Every visible button, form control, and navigation/action link is at least 44×44 CSS pixels. Inline prose links use the WCAG inline-target exception.
- Exactly one `main` landmark and one `h1` are present on every valid route.
- Public routes do not render the private shell, sidebar, or tab bar.

The 320 CSS-pixel pass exercises the same narrow reflow pressure as a doubled text/layout scale and confirms text remains readable and controls wrap without page-level horizontal scrolling. It is not recorded as a substitute for a browser's actual 200% page-zoom setting; that manual check remains pending because the Chrome control extension was unavailable in this environment.

## Accessibility

| Check | Result | Evidence |
| --- | --- | --- |
| Keyboard-only navigation | Pass | The More sheet starts on Leagues, advances through every link, wraps from Close back to Leagues, wraps backward with Shift+Tab, closes with Escape, and restores focus to More. |
| Visible focus | Pass | Keyboard focus on the Tournaments link computes to a 3px solid violet outline. |
| Logical headings and landmarks | Pass | 26 private/public routes each have exactly one `main` and one `h1`; nested page-level `main` elements were removed. |
| Accessible names | Pass | Semantic browser snapshots expose names for navigation, scoring pins, frame editing, sheets, share actions, forms, and CRUD actions. |
| 44px targets | Pass | Computed target audit across the 106 checks found no failures. |
| Light/dark contrast | Pass | Semantic token pairs meet normal-text contrast: light ink/canvas 16.05:1, secondary/surface 5.66:1, violet/canvas 5.15:1; dark ink/canvas 17.74:1, secondary/surface 7.41:1, violet/canvas 6.51:1, gold/canvas 10.69:1. |
| Narrow reflow | Pass | 320px passed all private routes without horizontal page scrolling or clipped controls. |
| Actual browser zoom at 200% | Pending | Requires the Chrome control extension; no proxy is represented as an actual-zoom result. |
| Reduced motion | Pass | Global `prefers-reduced-motion: reduce` disables smooth scrolling and reduces all animation/transition durations; feature-specific loaders and scoring motion are also covered. |
| Chart text equivalents | Pass | Trend and histogram figures expose textual score ranges, rolling-average context, bucket names, and counts alongside their SVG presentation. |
| No color-only state | Pass | Current/complete frames, pressed tabs, win/loss/placement, pin state, errors, and achievements all include text, marks, or accessible state in addition to color. |

The legacy purple-glow treatment is gone. Remaining emoji are limited to social copy, bowling content, and achievement/placement decoration; navigation and controls use the shared icon system.

## Regression flows

| Flow | Result | Evidence |
| --- | --- | --- |
| Start and complete a session | Pass | Started a Home Lanes game from Quick Start, completed a gutter game, saved it, and received the Game saved confirmation with a public score link. |
| Edit a prior frame and undo | Pass | Recorded a roll, undid it back to Frame 1 · Ball 1, completed two frames, rewound through the Frame 1 edit control, and completed the game. |
| Add/edit ball | Pass | Added `QA Benchmark`, then edited its color from Navy to Cobalt. |
| Add/edit arsenal | Pass | Created `QA Travel Bag`, set three slots, and assigned `QA Benchmark` to slot 1 as Benchmark. |
| View stats and pin leaves | Pass | Both routes rendered; the repaired `/stats/trend` compatibility endpoint returned JSON and the Scoring trend chart replaced its loading state. |
| Create/view league | Pass | Created and opened `QA Mixed League` at Test Center for Fall 2026. |
| Create/view tournament | Pass | Created and opened `QA Open` at Test Center in Singles format. |
| Edit persisted league/tournament games | Pass | Saved gutter games reopen with all ten frames, can be rewound from a selected frame, restored without data loss, and closed without saving. |
| New-session setup sheet | Pass | `/sessions/new` renders as a bottom sheet at 390x844 and a centered 520px sheet at 1280x900, with no page overflow. |
| Open every public/share route | Pass | All 12 routes above rendered at every public test width; the league-week share now resolves its JSON payload and displays its `h1`. |
| Offline/service-worker fallback | Pass | Built production, loaded the service worker, stopped the preview server, then cold-opened `/settings`; the cached shell rendered Settings at 390px without crashing. |
| Console errors | Pass | Final primary-flow and matrix console queries returned `[]`. |

The CRUD data above was created only in the ignored temporary QA database and is not part of the commit.

## Public-data privacy and status behavior

Temporary fixture notes contained an explicit private marker. Direct API verification confirmed that marker was absent from:

- `/api/sessions/1/public`
- `/api/tournaments/1/share`
- `/api/leagues/1/share`

The session payload now contains only `session`, `summary`, and `games`; session notes are not serialized or rendered. Tournament and league/week notes are also excluded. `/api/tournaments/999/share` correctly propagates a 404 rather than returning a successful wrapper response.

In production mode, `/api/leagues` and `/api/restore` return 401 without credentials, a configured bearer token authorizes private data, a wrong token remains 401, and the share-safe tournament standings/image routes remain public. Startup also refuses `0.0.0.0` binding when no authentication configuration is present. Same-origin `/api` aliases were exercised against the backend rather than a rewrite-only Vite topology, and all verified OG/share aliases returned PNG payloads rather than serialized buffers.

The public tournament standings route renders exactly one `main` and one `h1`, with no private sidebar, tab bar, settings/owner navigation, or horizontal overflow.

Hard-refresh verification against the production Fastify topology confirmed every private and public client route returns the React shell for `Accept: text/html`, while programmatic JSON calls continue to resolve through `/api`. Anonymous production requests to private APIs, recent-game history, dashboard data, and the ball image proxy return 401; a forged `oai-authenticated-user-email` header also returns 401. Trusted proxy identity now requires a separate shared proxy secret, and local-development bypass requires both a loopback source and a loopback Host header.

The Sites build uses the existing BowlSense project binding, a Cloudflare Workers-compatible server artifact, and platform-managed D1 persistence. Private worker APIs require both the Sites-authenticated user header and an explicit owner allowlist; a missing allowlist fails closed. Explicitly share-safe read endpoints remain anonymous-compatible and omit private notes. D1 restore and CSV import validate fully before executing as one atomic batch, and the UI no longer receives false backup assurance. Public share routes receive route-specific server HTML metadata and genuine PNG cards. The native Fastify/SQLite server remains the local Pi runtime and is not packaged into Sites.

## Before/after screenshots

| Area | Before | After |
| --- | --- | --- |
| Today | [before](screenshots/bowlsense-2/before/today-390x844.png) | [after](screenshots/bowlsense-2/after/today-390x844.png) |
| Scoring | [before](screenshots/bowlsense-2/before/scoring-390x844.png) | [after](screenshots/bowlsense-2/after/scoring-390x844.png) |
| Insights | [before](screenshots/bowlsense-2/before/insights-390x844.png) | [after](screenshots/bowlsense-2/after/insights-390x844.png) |
| Gear | [before](screenshots/bowlsense-2/before/gear-390x844.png) | [after](screenshots/bowlsense-2/after/gear-390x844.png) |
| Competition | [before](screenshots/bowlsense-2/before/competition-390x844.png) | [after](screenshots/bowlsense-2/after/competition-390x844.png) |

## Integration defects found and closed during browser QA

- Direct `/sessions/:id/share` navigation was being forwarded to the API by the Vite development proxy. HTML navigations now bypass that proxy and load the SPA.
- `/api/stats/trend` was stripped to `/stats/trend` in development and returned the HTML shell. Both backend paths now share the same JSON handler.
- `/api/leagues/:id/weeks/:weekId` had the same development-proxy mismatch. Both paths now share the same JSON handler.
- The production service worker could surface its offline JSON sentinel as query data on Settings. Settings now rejects non-2xx API responses and renders safely offline.
- The sheet trap relied on browser default Tab movement after stopping propagation. It now explicitly advances and wraps focus, making forward/backward traversal deterministic.
- Several redesigned pages nested a second `main` inside the app shell. Page wrappers are now neutral containers, leaving one main landmark per route.
