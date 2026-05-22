create table if not exists public.manual_access_allowlist (
  email text primary key,
  role text not null default 'platform_admin',
  active boolean not null default true,
  created_at timestamptz default now(),
  check (role in ('platform_admin'))
);

insert into public.manual_access_allowlist (email, role, active)
values
  ('agendafacil26@gmail.com', 'platform_admin', true),
  ('leofialhooficial@gmail.com', 'platform_admin', true)
on conflict (email) do update
  set role = excluded.role,
      active = excluded.active;

create or replace function public.handle_user_directory_sync()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.user_directory (user_id, email, phone, created_at, updated_at)
  values (new.id, new.email, new.phone, coalesce(new.created_at, now()), now())
  on conflict (user_id) do update
    set email = excluded.email,
        phone = excluded.phone,
        updated_at = now();

  update public.businesses
     set owner_email = new.email
   where owner_id = new.id
     and coalesce(owner_email, '') = '';

  update public.billing_access
     set auth_user_id = new.id,
         updated_at = now()
   where lower(email) = lower(coalesce(new.email, ''))
     and provider = 'kiwify'
     and coalesce(auth_user_id, '00000000-0000-0000-0000-000000000000'::uuid) <> new.id;

  if exists (
    select 1
    from public.manual_access_allowlist
    where lower(email) = lower(coalesce(new.email, ''))
      and active = true
  ) then
    update public.platform_admins
       set email = lower(coalesce(new.email, email)),
           active = true
     where user_id = new.id;

    insert into public.platform_admins (user_id, email, active, created_at)
    select new.id, lower(new.email), true, coalesce(new.created_at, now())
    where not exists (
      select 1
      from public.platform_admins
      where user_id = new.id
         or lower(email) = lower(coalesce(new.email, ''))
    );
  end if;

  return new;
end;
$$;

update public.platform_admins
   set email = lower(u.email),
       active = true
  from public.user_directory u
  join public.manual_access_allowlist allowlist
    on lower(allowlist.email) = lower(coalesce(u.email, ''))
 where public.platform_admins.user_id = u.user_id
   and allowlist.active = true;

insert into public.platform_admins (user_id, email, active, created_at)
select u.user_id, lower(u.email), true, coalesce(u.created_at, now())
from public.user_directory u
join public.manual_access_allowlist allowlist
  on lower(allowlist.email) = lower(coalesce(u.email, ''))
where allowlist.active = true
  and not exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = u.user_id
       or lower(pa.email) = lower(coalesce(u.email, ''))
  );
