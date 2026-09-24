# DigiEx League

Web app for the F8 vs F9 football derby at DigiEx. It covers teams, FO4-style player cards, fixtures and head-to-head history, lineups, match analysis, winner and score predictions, and a transfer market where chairmen send, accept and reject offers.

Built with **Vite + React + TypeScript**, with **Supabase** providing auth, Postgres (RLS), storage and realtime. The original Claude Design prototype and the chat transcript are in `project/` and `chats/`.

## Run locally

```bash
npm install
npm run dev
```

If `VITE_SUPABASE_URL` is not set, the app runs in **local demo mode**. Data lives in the browser's localStorage, and the login dialog lists the demo accounts (password `123456`). The footer has a "Khôi phục dữ liệu mẫu" link that resets the data.

## Connect Supabase

1. Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
2. Apply the schema. Either:
   - paste `supabase/migrations/20260924000000_init.sql` and then `supabase/seed.sql` into the Supabase **SQL Editor**, or
   - with the Supabase CLI, run `supabase link --project-ref <ref>`, then `supabase db push`, then `psql "$DB_URL" -f supabase/seed.sql`.
3. Create the demo accounts and demo offers. This needs the **service-role** key; never put it in a `VITE_` variable:
   ```bash
   VITE_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed:users
   ```
4. In **Authentication → Providers → Email**, turn off "Allow new users to sign up" so only accounts you create can log in.

Users sign in with a username. A username without `@` is converted to `<username>@VITE_AUTH_EMAIL_DOMAIN`, for example `son.f8@digiex.group`.

### Roles

Roles live in `public.profiles.role` / `team_id`. New auth users always start as `member`, and only SQL or the service role can change a role:

```sql
update public.profiles set role = 'chair', team_id = 'f8' where username = 'son.f8';
```

| Role | Can do |
|---|---|
| `admin` (Ban tổ chức) | add teams, schedule matches, enter results, transfer any player, see all offers |
| `chair` (Chủ tịch) | manage own squad and logo, transfer own players, send offers for other teams' players, accept or reject offers for own players |
| `coach` (BHL) | manage own squad and logo |
| `member` | view cards, analysis and market; vote once per match |
| guest | home, teams, fixtures, lineups |

Every rule is enforced in the database: RLS policies plus the `SECURITY DEFINER` functions `make_offer`, `respond_offer`, `cancel_offer`, `transfer_player`, `vote_winner`, `vote_score` and `vote_stats`. The UI only hides actions a user can't take. Player value is a generated column (`player_value(ovr)`). Uploads go to the public `media` bucket under `logos/<team>/…` and `players/<team>/…`, and only that team's staff can write there.

## Scripts

| | |
|---|---|
| `npm run dev` / `build` / `preview` | Vite |
| `npm run typecheck` | `tsc -b` |
| `npm run gen:seed` | regenerate `supabase/seed.sql` from `src/data/seed.ts` |
| `npm run seed:users` | create demo auth users, roles and offers in Supabase |

## Layout

```
src/
  data/       api.ts (interface) · supabaseApi.ts · localApi.ts · seed.ts · store.tsx (context, routing, toasts)
  lib/        types.ts · league.ts (tiers, value formula, lineup, records, formatting)
  components/ Header · bits (PlayerCard, Crest, Lock, …)
  views/      Home · Teams · Matches (list + detail) · Market · Manage
  modals/     CardModal · FormModal (login, team, player, transfer, offer, schedule)
supabase/     migrations/ (schema, RLS, RPCs, storage, realtime) · seed.sql
```

## Differences from the prototype

- Data is shared across the company through Supabase. Votes are one per user and stored server-side; offers and transfers update live over realtime.
- "Kết thúc trận" records only the score. The prototype invented goal scorers at random; real scorers can be stored in `matches.scorers`.
- Creating a team no longer creates a chairman account automatically. Assign one via `profiles` as shown above.
- The lineup formation (`2-3-1`) and the card shine effect were design-tool tweaks. They are now the constants `FORMATION` and `CARD_SHINE` in `src/lib/league.ts`.
- URLs are shareable: `#/teams/f8`, `#/match/<id>`, `#/market`.
