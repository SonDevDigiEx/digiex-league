-- Any Google account may sign up; admin approval (pending → member) is the gate now.

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base text := lower(split_part(coalesce(new.email, 'user'), '@', 1));
  uname text := base;
  n int := 1;
begin
  while exists (select 1 from public.profiles where username = uname) loop
    n := n + 1;
    uname := base || n;
  end loop;
  insert into public.profiles (id, username, name, email, avatar_url, role)
  values (
    new.id,
    uname,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'name', ''), base),
    lower(new.email),
    new.raw_user_meta_data ->> 'avatar_url',
    case when exists (select 1 from public.bootstrap_admins b where b.email = lower(new.email)) then 'admin' else 'pending' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop function if exists public.allowed_email(text);
