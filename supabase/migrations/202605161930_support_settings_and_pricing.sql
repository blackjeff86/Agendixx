create table if not exists public.platform_settings (
  id smallint primary key default 1 check (id = 1),
  support_whatsapp text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

insert into public.platform_settings (id)
values (1)
on conflict (id) do nothing;

grant select, insert, update on public.platform_settings to authenticated;

alter table public.platform_settings enable row level security;

drop policy if exists "platform_settings_authenticated_read" on public.platform_settings;
create policy "platform_settings_authenticated_read" on public.platform_settings
  for select using (auth.role() = 'authenticated');

drop policy if exists "platform_settings_platform_admin_write" on public.platform_settings;
create policy "platform_settings_platform_admin_write" on public.platform_settings
  for all using (public.is_platform_admin())
  with check (public.is_platform_admin());
