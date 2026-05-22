alter table public.manual_access_allowlist enable row level security;

grant select, insert, update on public.manual_access_allowlist to authenticated;

drop policy if exists "manual_access_allowlist_platform_admin_manage" on public.manual_access_allowlist;
create policy "manual_access_allowlist_platform_admin_manage" on public.manual_access_allowlist
  for all using (public.is_platform_admin())
  with check (public.is_platform_admin());
