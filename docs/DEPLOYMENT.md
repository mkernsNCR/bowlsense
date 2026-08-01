# BowlSense Sites deployment

Deploy only from a reviewed commit on `main` to the Sites project declared in `.openai/hosting.json`.

## Required project environment

The worker fails closed unless the Sites project supplies an authenticated user email that appears in `BOWLSENSE_ALLOWED_EMAILS`. Before every production deployment, verify these project variables:

- `BOWLSENSE_ALLOWED_EMAILS=<comma-separated owner email allowlist>`
- `BOWLSENSE_TIME_ZONE=America/New_York`
- `BOWLSENSE_PUBLIC_PROFILE_NAME=Matt Kerns`

The current BowlSense project was checked for these values during release preparation. They are project configuration and are intentionally not stored in `.openai/hosting.json`.

## Release gates

1. Run `npm ci`, `npm --prefix frontend ci`, and `npm --prefix backend ci`.
2. Run the frontend, backend, and root test/build/audit commands used by `.github/workflows/frontend-ci.yml`.
3. Confirm every open pull request has an exact-head CodeRabbit approval and no unresolved review threads before merging.
4. Deploy the saved artifact built from the exact merged `main` commit.
5. Verify an anonymous request to `/api/leagues` returns `401`, an authenticated owner request to `/api/data-health` returns `200`, and `/api/stats` remains public.
6. Verify Google and email sign-in in the production browser session before retiring any previous deployment.

Sites manages the sign-in flow and supplies `oai-authenticated-user-email`; BowlSense does not accept a client-provided login token. A shell that loads while private API calls return `401` usually means the project allowlist or Sites-authenticated identity is missing or mismatched.
