# DigiEx League

Web app for the F8 vs F9 football derby at DigiEx. It covers teams, FO4-style player cards, fixtures and head-to-head history, lineups, match analysis, winner and score predictions, and a transfer market where chairmen send, accept and reject offers.

Built with **Vite + React + TypeScript**, with **Supabase** providing Google auth, Postgres (RLS), storage and realtime. The original Claude Design prototype and the chat transcript are in `project/` and `chats/`.

## Run locally

```bash
cp .env.example .env.local   # fill in the Supabase URL + publishable key
npm install
npm run dev                  # http://localhost:5173
```

Local dev talks to the same Supabase project (there is no offline/demo mode).

## Supabase setup

**New project:** paste `supabase/setup.sql` into the SQL Editor and click Run. It creates the schema, RLS, RPCs and storage, plus the F8/F9 teams.

**Existing project that ran the earlier demo setup:**
1. Run `supabase/migrations/20260928000000_production.sql`.
2. Run `supabase/cleanup-demo.sql` once. This deletes the demo players, matches and accounts but keeps F8/F9.
3. Run `supabase/migrations/20260928010000_approval.sql`, which adds approval of new accounts.

### Google sign-in (@digiex.group only)

1. **Google Cloud Console → APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: *Web application*
   - Authorized JavaScript origins: `https://digiex-league.vercel.app`, `http://localhost:5173`
   - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
   - If asked to configure the consent screen, choose **Internal**, so only accounts in the Workspace can sign in.
2. **Supabase → Authentication → Sign In / Providers → Google**: enable it and paste the Client ID and Client Secret.
3. **Supabase → Authentication → URL Configuration**
   - Site URL: `https://digiex-league.vercel.app`
   - Redirect URLs: `https://digiex-league.vercel.app/**`, `http://localhost:5173/**`
4. **Supabase → Authentication → Sign In / Providers → Email**: turn off "Allow new users to sign up". Only Google is used.

The database refuses to create any account whose email isn't `@digiex.group` (see `handle_new_user`). The `hd` hint on the Google screen only makes this friendlier.

### Roles

New accounts start as `pending` (**Chờ duyệt**). They can sign in but see only what guests see until an admin approves them under **Quản lý → Thành viên**. Approving makes them `member`; rejecting deletes the account. Emails listed in `public.bootstrap_admins` (`son.pham@digiex.group`) skip approval and become admin on first sign-in. Admins assign roles on the same page. Each team has one chairman, and choosing a new one demotes the previous chairman. The chairman and BHL names on the team page follow these assignments.

| Role | Can do |
|---|---|
| `admin` (Ban tổ chức) | manage members and roles, add or edit teams, schedule and delete matches, enter or correct results with scorers, transfer any player, see all offers |
| `chair` (Chủ tịch) | manage own squad, logo, motto and quote; transfer own players; send offers for other teams' players; accept or reject offers for own players |
| `coach` (BHL) | manage own squad, logo, motto and quote |
| `member` | view cards, analysis and market; vote once per match |
| `pending` / guest | home, teams, fixtures, lineups |

Every rule is enforced in the database: RLS policies plus the `SECURITY DEFINER` functions `set_member`, `reject_member`, `update_team`, `save_result`, `make_offer`, `respond_offer`, `cancel_offer`, `transfer_player`, `vote_winner`, `vote_score` and `vote_stats`. The UI only hides actions a user can't take. Uploads go to the public `media` bucket under `logos/<team>/…` and `players/<team>/…`, and only that team's staff can write there.

## Deploy (Vercel)

Framework preset *Vite*. Set these environment variables for Production and Preview, then redeploy:
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_AUTH_EMAIL_DOMAIN=digiex.group`.
Never add the service-role key.

## Scripts

`npm run dev` / `build` / `preview` (Vite) · `npm run typecheck` (`tsc -b`)

## Layout

```
src/
  data/       api.ts (interface) · supabaseApi.ts · store.tsx (context, routing, toasts)
  lib/        types.ts · league.ts (tiers, value formula, lineup, records, formatting)
  components/ Header · ErrorBoundary · bits (PlayerCard, Crest, Lock, …)
  views/      Home · Teams · Matches (list + detail) · Market · Manage
  modals/     CardModal · FormModal (Google login, team, player, transfer, offer, schedule)
supabase/     migrations/ · seed.sql (F8/F9) · setup.sql (all-in-one, new projects) · cleanup-demo.sql
```

## Differences from the prototype

- Real data shared through Supabase, with Google sign-in. There are no demo accounts and no local/demo mode.
- Votes are one per user and stored server-side; offers, transfers and roles update live over realtime.
- Results record the real scorers (optional minute) instead of random ones, and admins can correct a result or delete a match.
- Chairman and BHL are real members assigned by an admin, not free-text names.
- The lineup formation (`2-3-1`) and the card shine effect are the constants `FORMATION` and `CARD_SHINE` in `src/lib/league.ts`.
- URLs are shareable: `#/teams/f8`, `#/match/<id>`, `#/market`.
