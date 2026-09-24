// Creates the demo accounts in Supabase Auth, assigns their roles/teams and seeds two demo transfer offers.
// Run once after applying the migration and supabase/seed.sql:
//   SUPABASE_SERVICE_ROLE_KEY=... VITE_SUPABASE_URL=... npm run seed:users
// The service-role key bypasses RLS — keep it out of the browser and out of git.
import { createClient } from '@supabase/supabase-js';
import { SEED_USERS, seedData } from '../src/data/seed';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const domain = process.env.VITE_AUTH_EMAIL_DOMAIN || 'digiex.group';
const password = process.env.DEMO_PASSWORD || '123456';
if (!url || !key) throw new Error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');

const sb = createClient(url, key, { auth: { persistSession: false } });

const ids: Record<string, string> = {};
const { data: existing } = await sb.auth.admin.listUsers({ perPage: 1000 });
for (const u of SEED_USERS) {
  const email = `${u.u}@${domain}`;
  let id = existing?.users.find((x) => x.email === email)?.id;
  if (!id) {
    const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username: u.u, name: u.name } });
    if (error) throw error;
    id = data.user.id;
    console.log('created', email);
  } else console.log('exists ', email);
  ids[u.u] = id;
  const { error } = await sb.from('profiles').upsert({ id, username: u.u, name: u.name, role: u.role, team_id: u.team ?? null });
  if (error) throw error;
}

const { count } = await sb.from('offers').select('id', { count: 'exact', head: true });
if (!count) {
  const rows = seedData().offers.map((o) => ({
    player_id: o.pid, buyer_team: o.from, seller_team: o.to, price: o.price, value: o.value, note: o.note,
    created_by: ids[o.by], status: o.status, created_on: o.date,
  }));
  const { error } = await sb.from('offers').insert(rows);
  if (error) throw error;
  console.log('seeded', rows.length, 'demo offers');
}
console.log('done');
