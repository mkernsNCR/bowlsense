# BowlSense Sites deployment

Deploy only from a reviewed commit on `main` to the Sites project declared in `.openai/hosting.json`.

## Required project environment

The worker fails closed unless the Sites project supplies an authenticated user email that appears in `BOWLSENSE_ALLOWED_EMAILS`. Before every production deployment, verify these project variables:

- `BOWLSENSE_ALLOWED_EMAILS=<comma-separated owner email allowlist>`
- `BOWLSENSE_AUTH_MODE=sites-private`
- `BOWLSENSE_TIME_ZONE=America/New_York`
- `BOWLSENSE_PUBLIC_PROFILE_NAME=Matt Kerns`

These values must be verified in the BowlSense project during release; they are project configuration and are intentionally not stored in `.openai/hosting.json`.

## Release gates

1. Run `npm ci`, `npm --prefix frontend ci`, and `npm --prefix backend ci`.
2. Run the frontend, backend, and root test/build/audit commands used by `.github/workflows/frontend-ci.yml`.
3. Confirm every open pull request has an exact-head CodeRabbit approval and no unresolved review threads before merging.
4. While authenticated as the owner, download `/api/export`, validate that it is JSON with the expected BowlSense tables, and store it outside Sites with the release commit and timestamp. This is a mandatory pre-migration backup, not the Sites “managed database” status.
5. Before applying `0003_league_retry_idempotency.sql`, run these read-only previews against production and save the results with the release evidence:

   ```sql
   SELECT league_id, week_number, COUNT(*) AS week_rows
   FROM league_weeks
   GROUP BY league_id, week_number
   HAVING COUNT(*) > 1;

   SELECT lw.league_id, lw.week_number, lg.game_number, COUNT(*) AS game_rows
   FROM league_games AS lg
   JOIN league_weeks AS lw ON lw.id = lg.week_id
   GROUP BY lw.league_id, lw.week_number, lg.game_number
   HAVING COUNT(*) > 1;
   ```

   Reconcile every returned group with a known retry. Abort the deployment if any deletion is unexplained; `0003` intentionally keeps the newest week payload and one game per natural identity.
6. Confirm the Sites access policy is `custom` with only the owner admitted; never deploy this private-data worker with `public` or `workspace_all` access.
7. Deploy the saved artifact built from the exact merged `main` commit.
8. Verify an anonymous request to `/api/leagues` returns `401`, an anonymous request with a forged `oai-authenticated-user-email` also returns `401` at the Sites boundary, an authenticated owner request to `/api/data-health` returns `200`, and `/api/stats` remains public.
9. Verify Google and email sign-in in the production browser session before retiring any previous deployment.

`0003` has no safe automatic down migration because it deliberately removes retry duplicates. Rollback means restoring the saved export into a clean pre-`0003` database (or removing the two unique indexes before import), then redeploying the previous reviewed commit. Never treat an application-only rollback as a data rollback.

[Sites manages the sign-in flow](https://learn.chatgpt.com/docs/sites) and forwards the authenticated visitor's email as `oai-authenticated-user-email`; BowlSense does not accept a client-provided login token. The security boundary is the owner-only Sites access policy, followed by the worker's explicit `sites-private` deployment mode and owner email allowlist. The application does not claim that an arbitrary upstream will sanitize this header, so private routes must remain disabled outside that boundary until an equivalent signed identity mechanism is in place. A shell that loads while private API calls return `401` usually means the auth mode, project allowlist, or Sites-authenticated identity is missing or mismatched.
