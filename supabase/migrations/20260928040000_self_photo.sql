-- Users set their own photo: profile avatar + their linked player card.
-- Files live at media/avatars/<user id>/…; only that user can write there.

create policy "media: own avatar upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = 'avatars' and (storage.foldername(name))[2] = auth.uid()::text);
create policy "media: own avatar update" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = 'avatars' and (storage.foldername(name))[2] = auth.uid()::text);
create policy "media: own avatar delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = 'avatars' and (storage.foldername(name))[2] = auth.uid()::text);

-- p_url must be a file in the caller's own avatars/ folder; null resets to the Google photo.
create or replace function public.set_my_photo(p_url text) returns void
language plpgsql security definer set search_path = public as $$
declare
  google text;
begin
  if auth.uid() is null then raise exception 'Bạn cần đăng nhập.'; end if;
  if p_url is not null and p_url not like '%/storage/v1/object/public/media/avatars/' || auth.uid()::text || '/%' then
    raise exception 'Ảnh không hợp lệ.';
  end if;
  select raw_user_meta_data ->> 'avatar_url' into google from auth.users where id = auth.uid();
  update public.profiles set avatar_url = coalesce(p_url, google) where id = auth.uid();
  update public.players set photo_url = p_url where user_id = auth.uid();
end $$;

revoke execute on function public.set_my_photo(text) from public, anon;
grant execute on function public.set_my_photo(text) to authenticated;

-- Google profile sync must not overwrite a photo the user chose: only follow Google while the avatar is still Google's.
create or replace function public.handle_user_updated() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set
    email = lower(new.email),
    avatar_url = case
      when avatar_url is null or avatar_url is not distinct from (old.raw_user_meta_data ->> 'avatar_url')
        then coalesce(new.raw_user_meta_data ->> 'avatar_url', avatar_url)
      else avatar_url
    end
  where id = new.id;
  return new;
end $$;
