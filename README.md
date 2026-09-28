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

**Existing project that already ran up to `20260928030000_open_signup.sql`:** run `supabase/update-2026-09-28.sql`, then `supabase/migrations/20260928080000_handover_numbers.sql` `supabase/migrations/20260928090000_ovr_positions.sql` `supabase/migrations/20260928100000_market_value.sql`, `supabase/migrations/20260928110000_tournaments.sql`, `supabase/migrations/20260928120000_tournament_signup.sql` `supabase/migrations/20260928130000_mom.sql` `supabase/migrations/20260928140000_rename_delete_user.sql` `supabase/migrations/20260928150000_team_applications.sql` `supabase/migrations/20260928160000_lineups.sql` `supabase/migrations/20260928170000_xp.sql` `supabase/migrations/20260928180000_starter_stats.sql` `supabase/migrations/20260928190000_notifications.sql` and `supabase/migrations/20260928200000_base_stats.sql`. To give everyone a fresh start at around 75 OVR, run `supabase/reset-stats-75.sql` once afterwards; it also clears all XP. All are safe to re-run.

**Existing project that ran the earlier demo setup:**
1. Run `supabase/migrations/20260928000000_production.sql`.
2. Run `supabase/cleanup-demo.sql` once. This deletes the demo players, matches and accounts but keeps F8/F9.
3. Run `supabase/migrations/20260928010000_approval.sql`, then `supabase/migrations/20260928020000_players.sql`, then `supabase/migrations/20260928030000_open_signup.sql`, then `supabase/migrations/20260928040000_self_photo.sql`, then `supabase/migrations/20260928050000_match_players.sql`, then `supabase/migrations/20260928060000_offers_v2.sql`, then `supabase/migrations/20260928070000_series_cancel.sql`. These add account approval, player profiles linked to accounts, and free agents.

### Google sign-in

1. **Google Cloud Console → APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: *Web application*
   - Authorized JavaScript origins: `https://digiex-league.vercel.app`, `http://localhost:5173`
   - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
   - Consent screen audience: **External**, so any Google account can request access. The admin approval step is the gate.
2. **Supabase → Authentication → Sign In / Providers → Google**: enable it and paste the Client ID and Client Secret.
3. **Supabase → Authentication → URL Configuration**
   - Site URL: `https://digiex-league.vercel.app`
   - Redirect URLs: `https://digiex-league.vercel.app/**`, `http://localhost:5173/**`
4. **Supabase → Authentication → Sign In / Providers → Email**: turn off "Allow new users to sign up". Only Google is used.

Any Google account can sign in, but new accounts are view-only until an admin approves them (see Roles).

### Roles

New accounts start as `pending` (**Chờ duyệt**): they can sign in and **view** everything members see, but can't vote and aren't players. An admin handles them under **Quản lý → Thành viên**:

- **Duyệt** opens one form that sets a **staff role** (none / BHL / Chủ tịch / Ban tổ chức, plus a team for BHL or Chủ tịch) and, optionally, creates a **player profile** linked to the account, either on a team or as a **free agent (Tự do)**. Staff role and player profile are independent, so one person can be, for example, chairman of F8 and a player.
- **Từ chối** deletes the account.

Emails in `public.bootstrap_admins` (`son.pham@digiex.group`) skip approval and become admin.

Everyone can change their own photo by clicking their name in the header (**Hồ sơ của tôi**). The photo is used for the avatar and for their player card, and "Dùng ảnh Google" resets it. Files go to `media/avatars/<user id>/`, which only that user can write.

**Match registration and stats.** Before kickoff, players register on the match page (*Đội hình* tab). A team player registers for their own team; a free agent picks one of the two sides, and free agents are listed on a separate line under each team. Once anyone has registered, the pitch lineup is built from the registered list. After the match, each participant fills in their own stats in the *Thống kê* tab: goals, assists, saves, cards, self-rating and a note. The BHL or chairman of the side they played for (or an admin) approves or rejects them. Only approved stats count towards the season totals shown on the player card (`match_players` table; RPCs `join_match`, `leave_match`, `submit_match_stats`, `review_match_stats`).

**Fixed weekly fixtures and cancellations.**
- *Lên lịch thi đấu* has a **Lặp lại hằng tuần** option (`match_series`). When the latest match of a series is over (result entered, cancelled, or 2 hours past kickoff), the next one is created 7 days later with the same day, time and venue. This runs from a trigger and from `roll_series()`, which the app calls on load; it is idempotent. Admins can stop a series from the match page.
- Admins and either team's chairman can **cancel** an upcoming match with a reason (Thiếu người / Trời mưa / …). Cancelled matches show as **ĐÃ HỦY** with the reason, don't count in the standings, and close registration and voting.

**Market value.** `value = base(OVR) × age × position × form × attendance × hotness`, and never below 80% of a fee paid in the last 30 days (`value_factors()` / `compute_player_value()`).
- **Age:** ×0.75 to ×1.15, peak 24–29.
- **Position:** GK ×0.9 up to ST/LW/RW ×1.1.
- **Form:** last 5 approved match stats; +4% per goal, +3% per assist, ±5% per rating point from 6.5, −10% per red card; clamped 0.7–1.4.
- **Attendance:** registered share of the team's last 5 matches; 0.9–1.1.
- **Hotness:** +5% per pending offer, max +20%.

Triggers recompute the value on every relevant change, and `daily_value_refresh()` (called on load) does a full pass once a day. Each value is logged in `player_value_history`, which drives the ▲/▼ weekly trend, the card sparkline, "Tăng giá mạnh nhất tuần" on the home page, and the "Vì sao giá này?" breakdown on the player card.

**OVR, positions, card tiers.**
- OVR is computed by the database (`compute_ovr`, trigger on `players`) from the primary position and the six stats, using per-position weights. For example ST weighs shooting 35% and pace 25%; CB weighs defending 45% and physical 28%. The formula is mirrored in `ovrOf()` / `POS_WEIGHTS` in `src/lib/league.ts`. Nobody sets OVR by hand.
- Players have 1–3 preferred positions (`players.positions`; the first is primary and equals `pos`). They set their own in *Hồ sơ của tôi*; staff can also set them in the player form.
- Card tiers: BRONZE < 70 ≤ SILVER < 78 ≤ GOLD < 85 ≤ ELITE (blue glow) < 90 ≤ ICON (animated gold rim + sparkle) < 95 ≤ LEGEND (holographic rim).

**Chairman handover and jersey numbers.**
- A chairman can hand the role to a player (with an account) or the BHL of their team, from *Quản lý* or *Hồ sơ của tôi*. They then become a regular member and stay a player.
- Players change their own jersey number in *Hồ sơ của tôi*. Numbers are 0–999 and unique across the league; this is checked by a trigger whenever a number is set.

**Transfers.**
- Only chairmen and BHL (for their own team) and admins see transfer actions.
- **Chairmen and BHL are not transferable.** They carry a role tag such as "Chủ tịch F8" in the market. When someone becomes chair or BHL of a team, their player profile moves to that team automatically.
- **Free agents** get a **Mời** (invitation). The **player** accepts or declines it from the bell icon (*Thông báo*) and joins immediately at no fee.
- **Contracted players** get a **Mua** offer. The **selling chairman** decides; the player is notified but can't respond.
- Chairmen can release players to free agency.
- Direct moves without consent (**Chuyển**) are admin-only.
- Chairmen and BHL can change the team logo from *Hồ sơ của tôi*, the team page, or *Quản lý*.

| Role | Can do |
|---|---|
| `admin` (Ban tổ chức) | manage members and roles, add or edit teams, schedule and delete matches, enter or correct results with scorers, transfer any player, see all offers |
| `chair` (Chủ tịch) | manage own squad, logo, motto and quote; sign free agents and release players; transfer own players; send offers for other teams' players; accept or reject offers for own players |
| `coach` (BHL) | manage own squad, logo, motto and quote |
| `member` | view cards, analysis and market; vote once per match |
| `pending` | view everything members see; no voting |
| guest | home, teams, fixtures, lineups |

Every rule is enforced in the database: RLS policies plus the `SECURITY DEFINER` functions `set_member`, `set_my_photo`, `approve_member`, `reject_member`, `sign_player`, `release_player`, `update_team`, `save_result`, `make_offer`, `respond_offer`, `cancel_offer`, `transfer_player`, `vote_winner`, `vote_score` and `vote_stats`. The UI only hides actions a user can't take. Uploads go to the public `media` bucket under `logos/<team>/…` and `players/<team>/…`, and only that team's staff can write there.

### Tournaments

- Only admins create tournaments, from *+ Tạo giải đấu* on the home page. They pick the S7 or S5 template (squad size, duration, team and personal points), then a format (round robin, groups then knockout, or knockout) and dates. The rules are Markdown generated from the template and can be edited.
- Teams can be chosen up front, or the list can be left empty to open registration. While a tournament is *Sắp khởi tranh*, chairmen see *Đăng ký tham gia* / *Rút* on the banner and on the tournament page (RPC `register_tournament`). Any change to the entry list clears the draw.
- `draw_tournament` (admin) shuffles the teams at random: a snake order into groups (at least 2 teams per group), or a power-of-2 bracket with byes.
- The home page shows a gold banner for the ongoing or next tournament, with the logos of registered teams. Clicking it opens `#/tournament/<id>`, which shows the info, table or bracket, points, awards, matches and rules.
- Awards (`tournament_awards`) link to a team and/or player. They appear on the team page (*Lịch sử giải thưởng*) and on the player card (*Danh hiệu*). The award form suggests winners from approved match stats.
- Team staff can upload or remove a cover photo (`covers/<team>/…`).

### Accounts

- Player photos go through a cropper (drag, zoom with the slider, mouse wheel or pinch) shaped like the card's photo frame. The result is saved at 480×520: JPEG for opaque photos, WebP/PNG when the image has transparency.
- Users rename themselves in *Hồ sơ của tôi* (RPC `set_my_name`, 2–40 characters, at most once every 24 hours). The new name is also written to their player card and to the chairman/BHL line on the team card.
- In *Quản lý → Thành viên*, admins can delete any account except their own (RPC `delete_user`). The player card is kept, unlinked from the account, unless *Xóa luôn thẻ cầu thủ* is ticked. If the deleted user was a chairman or BHL, the team card goes back to *Chưa bổ nhiệm*.

### Team applications

- Free agents with a player card see *Ứng tuyển vào đội* on a team page. They can add a note, have up to 3 pending applications at once, and withdraw them from the team page or *Hồ sơ của tôi*.
- The team's chairman (or an admin) accepts or rejects in *Chuyển nhượng → Đơn ứng tuyển* or on the team page. The market tab badge counts pending applications.
- On acceptance the player joins the team and the move is logged. Their other pending applications and invitations lapse (trigger `lapse_applications` fires on any move into a team).

### Notifications

- Triggers write rows into `notifications`; each user can read only their own. The bell in the header counts unread notifications plus pending invitations, and opening it marks them read (`mark_notifications_read`). The feed updates through realtime.
- **New match** (scheduled by hand or created by a weekly fixture): players of both teams, free agents and both teams' staff get "bấm Tham gia để điểm danh".
- **New tournament**: every approved member. Chairmen are also told to register their team.
- **XP / stats**: `grant_xp` keeps one notification per match (or per bonus) up to date with the XP total, what it was for, and any stat that went up (e.g. `SHO 79→80`).
- **Application accepted / rejected**: the applicant.

### Experience (XP) → stats

- Stats grow from quests. When a match is finished (score entered, stats approved or MOM picked), the triggers call `refresh_match_xp`. It awards XP once per player, match and kind; see the table below or *📜 Bảng nhiệm vụ* in the app.
- "Chia theo vị trí" XP is split over the six stats by the primary position's OVR weights. Goals, assists, clean sheets and saves go to specific stats.
- Every stat has its own progress. +1 costs `xp_cost(v) = 12·1.1^(v−60)` (75 → 50 XP, 85 → 130 XP, 95 → 337 XP), so high stats are hard to raise. Penalties only reduce progress; stats never drop. OVR and market value update on their own.
- New players start at the same floor: the `players_0_starter` trigger generates random starter stats (`starter_stats`, OVR 72–78, shaped by the primary position) and ignores any stats typed into the add or approve forms.
- Chairmen get one *thưởng nóng* envelope per week (`hot_bonus`, +30 XP) for a player in their team, not themselves.
- Always visible: the header shows your OVR and level bar. The top of the home page has *Hành trình của bạn* (OVR, level, stat progress, the stat closest to +1, next quests linking to the match). A celebration popup shows XP and stat gains since your last visit (per browser, localStorage).
- The player card and *Hồ sơ của tôi* show the level bar, per-stat progress, personal tips and the XP history.

| Quest | XP |
|---|---|
| Attend (registered with *Tham gia*) | +20 |
| Stats filled in and approved by BHL | +10 |
| Win / draw | +8 / +4 |
| Each goal / assist | +16 (SHO or PAS +12, DRI +4) |
| Clean sheet (GK, DEF / MID) | +20 / +6 |
| Conceded only 1 (GK, DEF) | +6 |
| Each save, GK (max 10) | +3 |
| Match rating ≥ 8 / ≥ 9 | +10 / +20 |
| MOM | +25 |
| Played the team's last 3 matches | +15 |
| Missed own team's match (team had ≥ 3 registrations) | −6 |

### Lineups (đội hình)

- Chairmen, BHL and admins open *⚙ Xếp đội hình* from the home page, the team page or the match page. The builder handles S7 and S5 separately, with templates for each: S7 `2-3-1 / 3-2-1 / 2-1-2-1 / 3-1-2 / 2-2-2`, S5 `2-1-1 / 1-2-1 / 2-2 / 1-1-2 / 3-1`.
- Players can be dragged anywhere on the pitch. Picking a template re-arranges the players already on the pitch into that shape by position fit. Tapping a slot shows the squad sorted by fit, and choosing a player there swaps them in. Slots can stay empty; they show an empty-player icon. *Tự xếp theo chỉ số* fills the lineup from positions and OVR.
- `save_lineup` (RPC) stores one lineup per team and format in `team_lineups`. It checks permissions and slot count, only allows the team's own players, and rejects duplicates.
- The home page shows every team's starting lineup. On the match page each team stands in its own half using its saved lineup; the format is the tournament's, or S7 by default. Teams without a saved lineup fall back to the automatic one.
- Team logos also go through the cropper, with a shield-shaped frame.

### Player ranking (home page)

- Only players who are on a team are ranked. The metrics come from finished matches: goals (the larger of the admin's scorer list and the approved self-report, per match), assists and saves (approved self-reports), and consistency (average rating minus its standard deviation, shown once a player has 3 rated matches).
- *Tiến bộ* ranks progress: stat points gained over `players.base_stats` (starter stats, or the stats at the last reset), with XP as the tie-breaker. The spotlight also shows the OVR gained.
- The table has a fixed height and scrolls inside itself.
- Players can be sorted by any metric (chips or column headers) and filtered by team. The top 3 for the chosen metric rotate in an auto-playing spotlight with their card.

### Hall of fame (Vinh danh)

- `#/vinh-danh` ranks the top scorers and the players with the most Man of the Match awards, by month, quarter, year or all time. It shows a podium with large avatars and a ranked list for places 4–10. The home page shows the current month's leaders.
- Goals in each finished match count once per player: the larger of the admin's scorer list and the player's BHL-approved self-report.
- MOM (`matches.mom_player`) is picked on the match page after the final whistle. Only the admin and the chairmen of the two teams can pick it (RPC `set_mom`). BHL cannot.

## Deploy (Vercel)

Framework preset *Vite*. Set these environment variables for Production and Preview, then redeploy:
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
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
