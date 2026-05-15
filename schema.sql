-- ============================================================
-- Agendixx — Schema Supabase (PostgreSQL)
-- Execute no SQL Editor do seu projeto Supabase
-- ============================================================

-- ── Habilitar extensão UUID ──
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ── BUSINESSES ──────────────────────────────────────────────
create table if not exists public.businesses (
  id          uuid primary key default uuid_generate_v4(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  owner_email text,
  name        text not null,
  slug        text not null unique,
  category    text not null default 'Barbearia',
  description text,
  whatsapp    text,
  instagram   text,
  address     text,
  logo_emoji  text default '✂️',
  logo_image_url text,
  cover_image_url text,
  plan_name   text default 'Plano Mensal 49,90',
  billing_status text default 'active',
  support_notes text,
  blocked_reason text,
  active      boolean default true,
  created_at  timestamptz default now()
);

alter table public.businesses add column if not exists owner_email text;
alter table public.businesses add column if not exists logo_image_url text;
alter table public.businesses add column if not exists cover_image_url text;
alter table public.businesses add column if not exists plan_name text default 'Plano Mensal 49,90';
alter table public.businesses add column if not exists billing_status text default 'active';
alter table public.businesses add column if not exists support_notes text;
alter table public.businesses add column if not exists blocked_reason text;
alter table public.businesses add column if not exists active boolean default true;

alter table public.businesses drop constraint if exists businesses_billing_status_check;
alter table public.businesses
  add constraint businesses_billing_status_check
  check (billing_status in ('active','past_due','blocked','canceled','pendente'));

alter table public.businesses add column if not exists plan_tier text;
alter table public.businesses add column if not exists promotional_ends_at timestamptz;

alter table public.businesses drop constraint if exists businesses_plan_tier_check;
alter table public.businesses
  add constraint businesses_plan_tier_check
  check (plan_tier is null or plan_tier in ('starter','pro'));

comment on column public.businesses.plan_tier is 'starter | pro. NULL = legado (app trata como Pro).';
comment on column public.businesses.promotional_ends_at is 'Fim do 1o mes promocional.';

alter table public.businesses add column if not exists next_billing_at timestamptz;
comment on column public.businesses.next_billing_at is 'Proxima renovacao mensal (PIX); em contas novas coincide com o fim do 1o mes promocional.';

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  active boolean default true,
  created_at timestamptz default now()
);

alter table public.platform_admins add column if not exists active boolean default true;

create table if not exists public.user_directory (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  phone text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.customers (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  email text,
  phone text not null,
  portal_token text,
  notes text,
  last_booking_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (business_id, name, phone)
);

alter table public.user_directory add column if not exists email text;
alter table public.user_directory add column if not exists phone text;
alter table public.user_directory add column if not exists updated_at timestamptz default now();

alter table public.customers drop constraint if exists customers_business_id_phone_key;
alter table public.customers drop constraint if exists customers_business_id_name_phone_key;
alter table public.customers
  add constraint customers_business_id_name_phone_key
  unique (business_id, name, phone);

alter table public.customers add column if not exists email text;
alter table public.customers add column if not exists portal_token text;
alter table public.customers add column if not exists notes text;
alter table public.customers add column if not exists last_booking_at timestamptz;
alter table public.customers add column if not exists updated_at timestamptz default now();
update public.customers
   set portal_token = replace(gen_random_uuid()::text, '-', '')
 where coalesce(portal_token, '') = '';
alter table public.customers alter column portal_token set default replace(gen_random_uuid()::text, '-', '');
create unique index if not exists idx_customers_portal_token on public.customers(portal_token);

create table if not exists public.support_events (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  event_type text not null,
  title text not null,
  details text,
  created_at timestamptz default now()
);

-- ── SERVICES ────────────────────────────────────────────────
create table if not exists public.services (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  description text,
  price       numeric(10,2) not null default 0,
  duration    int not null default 60,  -- minutos
  category    text,
  icon        text default '✂️',
  active      boolean default true,
  created_at  timestamptz default now()
);

alter table public.services add column if not exists description text;
alter table public.services add column if not exists category text;
alter table public.services add column if not exists icon text default '✂️';
alter table public.services add column if not exists active boolean default true;

-- ── PROFESSIONALS ───────────────────────────────────────────
create table if not exists public.professionals (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  role        text,
  emoji       text default '👤',
  active      boolean default true,
  day_off_weekday int check (day_off_weekday between 0 and 6),
  vacation_start date,
  vacation_end   date,
  lunch_start    time,
  lunch_end      time,
  created_at  timestamptz default now()
);

alter table public.professionals add column if not exists role text;
alter table public.professionals add column if not exists emoji text default '👤';
alter table public.professionals add column if not exists active boolean default true;
alter table public.professionals add column if not exists day_off_weekday int;
alter table public.professionals add column if not exists vacation_start date;
alter table public.professionals add column if not exists vacation_end date;
alter table public.professionals add column if not exists lunch_start time;
alter table public.professionals add column if not exists lunch_end time;

-- ── PROFESSIONAL_SERVICES (pivot) ───────────────────────────
create table if not exists public.professional_services (
  professional_id uuid references public.professionals(id) on delete cascade,
  service_id      uuid references public.services(id) on delete cascade,
  primary key (professional_id, service_id)
);

-- ── BUSINESS_HOURS ──────────────────────────────────────────
create table if not exists public.business_hours (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  day_of_week int not null,  -- 0=Dom … 6=Sáb
  day_name    text not null,
  open_time   time,
  close_time  time,
  active      boolean default true,
  unique (business_id, day_of_week)
);

alter table public.business_hours add column if not exists open_time time;
alter table public.business_hours add column if not exists close_time time;
alter table public.business_hours add column if not exists active boolean default true;

create table if not exists public.appointment_series (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  service_id uuid not null references public.services(id) on delete cascade,
  professional_id uuid references public.professionals(id) on delete set null,
  start_date date not null,
  appointment_time time not null,
  recurrence_type text not null
    check (recurrence_type in ('weekly','twice_weekly','monthly')),
  occurrences int not null default 4 check (occurrences >= 2 and occurrences <= 52),
  notes text,
  active boolean default true,
  created_at timestamptz default now()
);

alter table public.support_events add column if not exists actor_user_id uuid references auth.users(id) on delete set null;
alter table public.support_events add column if not exists actor_email text;
alter table public.support_events add column if not exists details text;

alter table public.appointment_series add column if not exists customer_id uuid references public.customers(id) on delete set null;
alter table public.appointment_series add column if not exists professional_id uuid references public.professionals(id) on delete set null;
alter table public.appointment_series add column if not exists notes text;
alter table public.appointment_series add column if not exists active boolean default true;

-- ── APPOINTMENTS ────────────────────────────────────────────
create table if not exists public.appointments (
  id               uuid primary key default uuid_generate_v4(),
  business_id      uuid not null references public.businesses(id) on delete cascade,
  customer_id      uuid references public.customers(id) on delete set null,
  series_id        uuid references public.appointment_series(id) on delete set null,
  service_id       uuid references public.services(id),
  professional_id  uuid references public.professionals(id),
  client_name      text not null,
  client_email     text,
  client_phone     text not null,
  client_notes     text,
  appointment_date date not null,
  appointment_time time not null,
  occurrence_index int not null default 1,
  status           text not null default 'pendente'
    check (status in ('pendente','confirmado','concluido','cancelado')),
  client_reapproval_required boolean default false,
  created_at       timestamptz default now()
);

alter table public.appointments add column if not exists customer_id uuid references public.customers(id) on delete set null;
alter table public.appointments add column if not exists series_id uuid references public.appointment_series(id) on delete set null;
alter table public.appointments add column if not exists client_email text;
alter table public.appointments add column if not exists client_notes text;
alter table public.appointments add column if not exists occurrence_index int not null default 1;
alter table public.appointments add column if not exists client_reapproval_required boolean default false;

alter table public.appointments add column if not exists reminder_sent_at timestamptz;
comment on column public.appointments.reminder_sent_at is 'Preenchido pelo job diário ao enviar lembrete D-1 ao cliente (WhatsApp).';

create index if not exists idx_appointments_reminder_day
  on public.appointments (appointment_date)
  where reminder_sent_at is null and status = 'confirmado';

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

alter table public.businesses       enable row level security;
alter table public.platform_admins  enable row level security;
alter table public.user_directory   enable row level security;
alter table public.customers        enable row level security;
alter table public.appointment_series enable row level security;
alter table public.support_events   enable row level security;
alter table public.services         enable row level security;
alter table public.professionals    enable row level security;
alter table public.professional_services enable row level security;
alter table public.business_hours   enable row level security;
alter table public.appointments     enable row level security;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins
    where user_id = auth.uid()
      and active = true
  );
$$;

grant execute on function public.is_platform_admin() to authenticated;

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

  return new;
end;
$$;

drop trigger if exists trg_handle_user_directory_sync on auth.users;
create trigger trg_handle_user_directory_sync
after insert or update of email, phone on auth.users
for each row
execute function public.handle_user_directory_sync();

insert into public.user_directory (user_id, email, phone, created_at, updated_at)
select id, email, phone, coalesce(created_at, now()), now()
from auth.users
on conflict (user_id) do update
  set email = excluded.email,
      phone = excluded.phone,
      updated_at = now();

update public.businesses b
   set owner_email = u.email
  from public.user_directory u
 where b.owner_id = u.user_id
   and coalesce(b.owner_email, '') = '';

drop policy if exists "platform_admin_self_select" on public.platform_admins;
drop policy if exists "user_directory_self_or_platform_admin" on public.user_directory;
drop policy if exists "owner_manage_customers" on public.customers;
drop policy if exists "owner_manage_series" on public.appointment_series;
drop policy if exists "platform_admin_manage_support_events" on public.support_events;
drop policy if exists "owner_select_business" on public.businesses;
drop policy if exists "owner_insert_business" on public.businesses;
drop policy if exists "owner_update_business" on public.businesses;
drop policy if exists "owner_delete_business" on public.businesses;
drop policy if exists "public_read_business_by_slug" on public.businesses;
drop policy if exists "owner_manage_services" on public.services;
drop policy if exists "public_read_services" on public.services;
drop policy if exists "owner_manage_professionals" on public.professionals;
drop policy if exists "public_read_professionals" on public.professionals;
drop policy if exists "owner_manage_prof_services" on public.professional_services;
drop policy if exists "public_read_prof_services" on public.professional_services;
drop policy if exists "owner_manage_hours" on public.business_hours;
drop policy if exists "public_read_hours" on public.business_hours;
drop policy if exists "owner_manage_appointments" on public.appointments;
drop policy if exists "public_insert_appointment" on public.appointments;

-- ── BUSINESSES policies ──────────────────────────────────────
create policy "platform_admin_self_select" on public.platform_admins
  for select using (user_id = auth.uid());

create policy "user_directory_self_or_platform_admin" on public.user_directory
  for select using (user_id = auth.uid() or public.is_platform_admin());

create policy "owner_manage_customers" on public.customers
  for all using (
    business_id in (select id from public.businesses where owner_id = auth.uid() or public.is_platform_admin())
  )
  with check (
    business_id in (select id from public.businesses where owner_id = auth.uid() or public.is_platform_admin())
  );

create policy "owner_manage_series" on public.appointment_series
  for all using (
    business_id in (select id from public.businesses where owner_id = auth.uid() or public.is_platform_admin())
  )
  with check (
    business_id in (select id from public.businesses where owner_id = auth.uid() or public.is_platform_admin())
  );

create policy "platform_admin_manage_support_events" on public.support_events
  for all using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "owner_select_business" on public.businesses
  for select using (owner_id = auth.uid() or public.is_platform_admin());

create policy "owner_insert_business" on public.businesses
  for insert with check (owner_id = auth.uid() or public.is_platform_admin());

create policy "owner_update_business" on public.businesses
  for update using (owner_id = auth.uid() or public.is_platform_admin());

create policy "owner_delete_business" on public.businesses
  for delete using (owner_id = auth.uid() or public.is_platform_admin());

-- ── PUBLIC read for booking page (by slug) ───────────────────
create policy "public_read_business_by_slug" on public.businesses
  for select using (active = true);

-- ── SERVICES policies ────────────────────────────────────────
create policy "owner_manage_services" on public.services
  for all using (
    business_id in (select id from public.businesses where owner_id = auth.uid() or public.is_platform_admin())
  )
  with check (
    business_id in (select id from public.businesses where owner_id = auth.uid() or public.is_platform_admin())
  );
create policy "public_read_services" on public.services
  for select using (active = true);

-- ── PROFESSIONALS policies ───────────────────────────────────
create policy "owner_manage_professionals" on public.professionals
  for all using (
    business_id in (select id from public.businesses where owner_id = auth.uid() or public.is_platform_admin())
  )
  with check (
    business_id in (select id from public.businesses where owner_id = auth.uid() or public.is_platform_admin())
  );
create policy "public_read_professionals" on public.professionals
  for select using (active = true);

-- ── PROFESSIONAL_SERVICES policies ──────────────────────────
create policy "owner_manage_prof_services" on public.professional_services
  for all using (
    professional_id in (
      select p.id from public.professionals p
      join public.businesses b on b.id = p.business_id
      where b.owner_id = auth.uid() or public.is_platform_admin()
    )
  )
  with check (
    professional_id in (
      select p.id from public.professionals p
      join public.businesses b on b.id = p.business_id
      where b.owner_id = auth.uid() or public.is_platform_admin()
    )
  );
create policy "public_read_prof_services" on public.professional_services
  for select using (true);

-- ── BUSINESS_HOURS policies ──────────────────────────────────
create policy "owner_manage_hours" on public.business_hours
  for all using (
    business_id in (select id from public.businesses where owner_id = auth.uid() or public.is_platform_admin())
  )
  with check (
    business_id in (select id from public.businesses where owner_id = auth.uid() or public.is_platform_admin())
  );
create policy "public_read_hours" on public.business_hours
  for select using (true);

-- ── APPOINTMENTS policies ────────────────────────────────────
create policy "owner_manage_appointments" on public.appointments
  for all using (
    business_id in (select id from public.businesses where owner_id = auth.uid() or public.is_platform_admin())
  )
  with check (
    business_id in (select id from public.businesses where owner_id = auth.uid() or public.is_platform_admin())
  );
create policy "public_insert_appointment" on public.appointments
  for insert with check (
    business_id in (select id from public.businesses where active = true)
  );   -- clientes podem inserir apenas em negocios ativos

-- ============================================================
-- FUNÇÕES AUXILIARES
-- ============================================================

create or replace function public.compute_recurrence_date(
  p_start_date date,
  p_recurrence_type text,
  p_index int
) returns date
language plpgsql
immutable
as $$
begin
  if p_recurrence_type = 'weekly' then
    return p_start_date + ((p_index - 1) * 7);
  elsif p_recurrence_type = 'twice_weekly' then
    return case
      when mod(p_index - 1, 2) = 0 then p_start_date + ((p_index - 1) / 2) * 7
      else p_start_date + (((p_index - 2) / 2) * 7) + 3
    end;
  elsif p_recurrence_type = 'monthly' then
    return (p_start_date + make_interval(months => p_index - 1))::date;
  end if;
  return p_start_date;
end;
$$;

drop function if exists public.is_professional_slot_blocked(uuid, date, time, int);
create or replace function public.is_professional_slot_blocked(
  p_professional_id uuid,
  p_date date,
  p_time time,
  p_duration int
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with professional_data as (
    select
      p.day_off_weekday,
      p.vacation_start,
      p.vacation_end,
      p.lunch_start,
      p.lunch_end
    from public.professionals p
    where p.id = p_professional_id
  )
  select exists (
    select 1
    from professional_data pd
    where
      (pd.day_off_weekday is not null and pd.day_off_weekday = extract(dow from p_date)::int)
      or (
        pd.vacation_start is not null
        and pd.vacation_end is not null
        and p_date between pd.vacation_start and pd.vacation_end
      )
      or (
        pd.lunch_start is not null
        and pd.lunch_end is not null
        and (
          (pd.lunch_start, pd.lunch_end) overlaps
          (p_time, (p_time + (greatest(p_duration, 1) || ' minutes')::interval)::time)
        )
      )
  );
$$;

grant execute on function public.is_professional_slot_blocked(uuid, date, time, int) to anon, authenticated;

create or replace function public.create_public_booking(
  p_business_id uuid,
  p_service_id uuid,
  p_professional_id uuid,
  p_client_name text,
  p_client_phone text,
  p_client_email text,
  p_client_notes text,
  p_appointment_date date,
  p_appointment_time time,
  p_recurrence_type text default null,
  p_occurrences int default 1
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_series_id uuid;
  v_appointment_id uuid;
  v_count int := greatest(coalesce(p_occurrences, 1), 1);
  v_occurrence_date date;
  v_ids uuid[] := '{}';
  v_business_active boolean;
begin
  select active into v_business_active
  from public.businesses
  where id = p_business_id;

  if coalesce(v_business_active, false) = false then
    raise exception 'Negocio indisponivel para agendamento.';
  end if;

  insert into public.customers (business_id, name, email, phone, notes, last_booking_at, updated_at)
  values (p_business_id, p_client_name, nullif(trim(p_client_email), ''), p_client_phone, nullif(trim(p_client_notes), ''), now(), now())
  on conflict (business_id, name, phone) do update
    set email = coalesce(excluded.email, public.customers.email),
        notes = coalesce(excluded.notes, public.customers.notes),
        last_booking_at = now(),
        updated_at = now()
  returning id into v_customer_id;

  if coalesce(nullif(trim(p_recurrence_type), ''), 'none') not in ('none', 'weekly', 'twice_weekly', 'monthly') then
    raise exception 'Tipo de recorrencia invalido.';
  end if;

  if coalesce(nullif(trim(p_recurrence_type), ''), 'none') <> 'none' then
    if v_count < 2 then
      raise exception 'Agendamento recorrente precisa de pelo menos 2 ocorrencias.';
    end if;

    insert into public.appointment_series (
      business_id,
      customer_id,
      service_id,
      professional_id,
      start_date,
      appointment_time,
      recurrence_type,
      occurrences,
      notes,
      active
    ) values (
      p_business_id,
      v_customer_id,
      p_service_id,
      p_professional_id,
      p_appointment_date,
      p_appointment_time,
      p_recurrence_type,
      v_count,
      nullif(trim(p_client_notes), ''),
      true
    )
    returning id into v_series_id;
  end if;

  for i in 1..v_count loop
    v_occurrence_date := case
      when v_series_id is null then p_appointment_date
      else public.compute_recurrence_date(p_appointment_date, p_recurrence_type, i)
    end;

    insert into public.appointments (
      business_id,
      customer_id,
      series_id,
      service_id,
      professional_id,
      client_name,
      client_email,
      client_phone,
      client_notes,
      appointment_date,
      appointment_time,
      occurrence_index,
      status
    ) values (
      p_business_id,
      v_customer_id,
      v_series_id,
      p_service_id,
      p_professional_id,
      p_client_name,
      nullif(trim(p_client_email), ''),
      p_client_phone,
      nullif(trim(p_client_notes), ''),
      v_occurrence_date,
      p_appointment_time,
      i,
      'pendente'
    )
    returning id into v_appointment_id;

    v_ids := array_append(v_ids, v_appointment_id);
  end loop;

  return jsonb_build_object(
    'series_id', v_series_id,
    'customer_id', v_customer_id,
    'appointment_ids', v_ids,
    'occurrences', v_count
  );
end;
$$;

grant execute on function public.create_public_booking(uuid, uuid, uuid, text, text, text, text, date, time, text, int) to anon, authenticated;

create or replace function public.get_customer_portal(
  p_portal_token text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer public.customers%rowtype;
  v_business public.businesses%rowtype;
begin
  select *
    into v_customer
  from public.customers
  where portal_token = p_portal_token;

  if v_customer.id is null then
    raise exception 'Área do cliente não encontrada.';
  end if;

  select *
    into v_business
  from public.businesses
  where id = v_customer.business_id
    and active = true;

  if v_business.id is null then
    raise exception 'Negócio indisponível.';
  end if;

  return jsonb_build_object(
    'business', to_jsonb(v_business),
    'customer', to_jsonb(v_customer),
    'appointments', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.appointment_date asc, a.appointment_time asc)
      from public.appointments a
      where a.business_id = v_customer.business_id
        and regexp_replace(lower(coalesce(a.client_name, '')), '[^a-z0-9]', '', 'g')
            = regexp_replace(lower(coalesce(v_customer.name, '')), '[^a-z0-9]', '', 'g')
        and regexp_replace(coalesce(a.client_phone, ''), '\D', '', 'g')
            = regexp_replace(coalesce(v_customer.phone, ''), '\D', '', 'g')
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.created_at asc)
      from public.services s
      where s.business_id = v_customer.business_id
    ), '[]'::jsonb),
    'professionals', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.created_at asc)
      from public.professionals p
      where p.business_id = v_customer.business_id
    ), '[]'::jsonb),
    'hours', coalesce((
      select jsonb_agg(to_jsonb(h) order by h.day_of_week asc)
      from public.business_hours h
      where h.business_id = v_customer.business_id
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_customer_portal(text) to anon, authenticated;

create or replace function public.reschedule_customer_portal_appointment(
  p_portal_token text,
  p_appointment_id uuid,
  p_appointment_date date,
  p_appointment_time time
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer public.customers%rowtype;
  v_business public.businesses%rowtype;
  v_appointment public.appointments%rowtype;
begin
  select *
    into v_customer
  from public.customers
  where portal_token = p_portal_token;

  if v_customer.id is null then
    raise exception 'Área do cliente não encontrada.';
  end if;

  select *
    into v_business
  from public.businesses
  where id = v_customer.business_id
    and active = true;

  if v_business.id is null then
    raise exception 'Negócio indisponível.';
  end if;

  select *
    into v_appointment
  from public.appointments
  where id = p_appointment_id
    and business_id = v_customer.business_id
    and regexp_replace(lower(coalesce(client_name, '')), '[^a-z0-9]', '', 'g')
        = regexp_replace(lower(coalesce(v_customer.name, '')), '[^a-z0-9]', '', 'g')
    and regexp_replace(coalesce(client_phone, ''), '\D', '', 'g')
        = regexp_replace(coalesce(v_customer.phone, ''), '\D', '', 'g');

  if v_appointment.id is null then
    raise exception 'Agendamento não encontrado.';
  end if;

  if v_appointment.status in ('cancelado', 'concluido') then
    raise exception 'Esse agendamento não pode mais ser reagendado.';
  end if;

  update public.appointments
     set appointment_date = p_appointment_date,
         appointment_time = p_appointment_time,
         status = 'pendente',
         client_reapproval_required = false,
         reminder_sent_at = null
   where id = v_appointment.id
   returning * into v_appointment;

  return jsonb_build_object(
    'appointment', to_jsonb(v_appointment)
  );
end;
$$;

grant execute on function public.reschedule_customer_portal_appointment(text, uuid, date, time) to anon, authenticated;

create or replace function public.approve_customer_portal_appointment(
  p_portal_token text,
  p_appointment_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer public.customers%rowtype;
  v_business public.businesses%rowtype;
  v_appointment public.appointments%rowtype;
begin
  select *
    into v_customer
  from public.customers
  where portal_token = p_portal_token;

  if v_customer.id is null then
    raise exception 'Área do cliente não encontrada.';
  end if;

  select *
    into v_business
  from public.businesses
  where id = v_customer.business_id
    and active = true;

  if v_business.id is null then
    raise exception 'Negócio indisponível.';
  end if;

  select *
    into v_appointment
  from public.appointments
  where id = p_appointment_id
    and business_id = v_customer.business_id
    and regexp_replace(lower(coalesce(client_name, '')), '[^a-z0-9]', '', 'g')
        = regexp_replace(lower(coalesce(v_customer.name, '')), '[^a-z0-9]', '', 'g')
    and regexp_replace(coalesce(client_phone, ''), '\D', '', 'g')
        = regexp_replace(coalesce(v_customer.phone, ''), '\D', '', 'g');

  if v_appointment.id is null then
    raise exception 'Agendamento não encontrado.';
  end if;

  if v_appointment.status in ('cancelado', 'concluido') then
    raise exception 'Esse agendamento não pode ser aprovado.';
  end if;

  update public.appointments
     set status = 'confirmado',
         client_reapproval_required = false,
         reminder_sent_at = null
   where id = v_appointment.id
   returning * into v_appointment;

  return jsonb_build_object(
    'appointment', to_jsonb(v_appointment)
  );
end;
$$;

grant execute on function public.approve_customer_portal_appointment(text, uuid) to anon, authenticated;

create or replace function public.delete_appointment_series(
  p_series_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
begin
  select business_id into v_business_id
  from public.appointment_series
  where id = p_series_id;

  if v_business_id is null then
    raise exception 'Serie nao encontrada.';
  end if;

  if not exists (
    select 1
    from public.businesses
    where id = v_business_id
      and (owner_id = auth.uid() or public.is_platform_admin())
  ) then
    raise exception 'Sem permissao para excluir esta serie.';
  end if;

  delete from public.appointments where series_id = p_series_id;
  delete from public.appointment_series where id = p_series_id;
end;
$$;

grant execute on function public.delete_appointment_series(uuid) to authenticated;

create or replace function public.update_appointment_series(
  p_series_id uuid,
  p_service_id uuid,
  p_professional_id uuid,
  p_start_date date,
  p_appointment_time time,
  p_recurrence_type text,
  p_occurrences int,
  p_notes text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_series public.appointment_series%rowtype;
  v_customer public.customers%rowtype;
  v_occurrence_date date;
begin
  select * into v_series
  from public.appointment_series
  where id = p_series_id;

  if v_series.id is null then
    raise exception 'Serie nao encontrada.';
  end if;

  if not exists (
    select 1
    from public.businesses
    where id = v_series.business_id
      and (owner_id = auth.uid() or public.is_platform_admin())
  ) then
    raise exception 'Sem permissao para editar esta serie.';
  end if;

  if p_recurrence_type not in ('weekly', 'twice_weekly', 'monthly') then
    raise exception 'Tipo de recorrencia invalido.';
  end if;

  if p_occurrences < 2 then
    raise exception 'Serie precisa de pelo menos 2 ocorrencias.';
  end if;

  select * into v_customer
  from public.customers
  where id = v_series.customer_id;

  delete from public.appointments where series_id = p_series_id;

  update public.appointment_series
     set service_id = p_service_id,
         professional_id = p_professional_id,
         start_date = p_start_date,
         appointment_time = p_appointment_time,
         recurrence_type = p_recurrence_type,
         occurrences = p_occurrences,
         notes = nullif(trim(p_notes), ''),
         active = true
   where id = p_series_id;

  for i in 1..p_occurrences loop
    v_occurrence_date := public.compute_recurrence_date(p_start_date, p_recurrence_type, i);

    insert into public.appointments (
      business_id,
      customer_id,
      series_id,
      service_id,
      professional_id,
      client_name,
      client_email,
      client_phone,
      client_notes,
      appointment_date,
      appointment_time,
      occurrence_index,
      status
    ) values (
      v_series.business_id,
      v_series.customer_id,
      p_series_id,
      p_service_id,
      p_professional_id,
      coalesce(v_customer.name, 'Cliente'),
      v_customer.email,
      coalesce(v_customer.phone, ''),
      coalesce(nullif(trim(p_notes), ''), v_customer.notes),
      v_occurrence_date,
      p_appointment_time,
      i,
      'pendente'
    );
  end loop;
end;
$$;

grant execute on function public.update_appointment_series(uuid, uuid, uuid, date, time, text, int, text) to authenticated;

-- Verifica disponibilidade de um horário
drop function if exists public.is_slot_available(uuid, uuid, uuid, date, time);
create or replace function public.is_slot_available(
  p_business_id uuid,
  p_service_id uuid,
  p_professional_id uuid,
  p_date date,
  p_time time
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with target_service as (
    select id, duration
    from public.services
    where id = p_service_id
      and business_id = p_business_id
      and active = true
  ),
  eligible_professionals as (
    select p.id
    from public.professionals p
    join public.professional_services ps on ps.professional_id = p.id
    join target_service ts on ts.id = ps.service_id
    where p.business_id = p_business_id
      and p.active = true
      and (p_professional_id is null or p.id = p_professional_id)
  )
  select exists (
    select 1
    from eligible_professionals ep
    join target_service ts on true
    where public.is_professional_slot_blocked(ep.id, p_date, p_time, ts.duration) is not true
      and not exists (
        select 1
        from public.appointments a
        join public.services s on s.id = a.service_id
        where a.business_id = p_business_id
          and a.professional_id = ep.id
          and a.appointment_date = p_date
          and a.status not in ('cancelado')
          and (
            (a.appointment_time, (a.appointment_time + (s.duration || ' minutes')::interval)::time)
            overlaps
            (p_time, (p_time + (ts.duration || ' minutes')::interval)::time)
          )
      )
  );
$$;

grant execute on function public.is_slot_available(uuid, uuid, uuid, date, time) to anon, authenticated;

drop function if exists public.assign_available_professional(uuid, uuid, date, time);
create or replace function public.assign_available_professional(
  p_business_id uuid,
  p_service_id uuid,
  p_date date,
  p_time time
) returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with target_service as (
    select id, duration
    from public.services
    where id = p_service_id
      and business_id = p_business_id
      and active = true
  )
  select p.id
  from public.professionals p
  join public.professional_services ps on ps.professional_id = p.id
  join target_service ts on ts.id = ps.service_id
  where p.business_id = p_business_id
    and p.active = true
    and public.is_professional_slot_blocked(p.id, p_date, p_time, ts.duration) is not true
    and not exists (
      select 1
      from public.appointments a
      join public.services s on s.id = a.service_id
      where a.business_id = p_business_id
        and a.professional_id = p.id
        and a.appointment_date = p_date
        and a.status not in ('cancelado')
        and (
          (a.appointment_time, (a.appointment_time + (s.duration || ' minutes')::interval)::time)
          overlaps
          (p_time, (p_time + (ts.duration || ' minutes')::interval)::time)
        )
    )
  order by p.created_at, p.name
  limit 1;
$$;

grant execute on function public.assign_available_professional(uuid, uuid, date, time) to anon, authenticated;

drop trigger if exists trg_validate_appointment_integrity on public.appointments;
drop function if exists public.validate_appointment_integrity();
create or replace function public.validate_appointment_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service public.services%rowtype;
  v_professional public.professionals%rowtype;
  v_open time;
  v_close time;
  v_active boolean;
  v_day int;
  v_assigned uuid;
  v_conflict_exists boolean;
begin
  select * into v_service
  from public.services
  where id = new.service_id;

  if v_service.id is null then
    raise exception 'Servico invalido.';
  end if;

  if v_service.business_id <> new.business_id then
    raise exception 'Servico nao pertence a este negocio.';
  end if;

  if v_service.active is not true then
    raise exception 'Servico inativo.';
  end if;

  v_day := extract(dow from new.appointment_date);

  select open_time, close_time, active
  into v_open, v_close, v_active
  from public.business_hours
  where business_id = new.business_id
    and day_of_week = v_day;

  if coalesce(v_active, false) is not true then
    raise exception 'O negocio esta fechado nesta data.';
  end if;

  if new.appointment_time < v_open
     or (new.appointment_time + (v_service.duration || ' minutes')::interval)::time > v_close then
    raise exception 'Horario fora do expediente.';
  end if;

  if new.professional_id is not null then
    select * into v_professional
    from public.professionals
    where id = new.professional_id;

    if v_professional.id is null then
      raise exception 'Profissional invalido.';
    end if;

    if v_professional.business_id <> new.business_id then
      raise exception 'Profissional nao pertence a este negocio.';
    end if;

    if v_professional.active is not true then
      raise exception 'Profissional inativo.';
    end if;

    if public.is_professional_slot_blocked(new.professional_id, new.appointment_date, new.appointment_time, v_service.duration) then
      raise exception 'Profissional indisponível nesse período.';
    end if;

    if not exists (
      select 1
      from public.professional_services ps
      where ps.professional_id = new.professional_id
        and ps.service_id = new.service_id
    ) then
      raise exception 'Esse profissional nao executa o servico selecionado.';
    end if;
  else
    select p.id
      into v_assigned
    from public.professionals p
    join public.professional_services ps on ps.professional_id = p.id
    where p.business_id = new.business_id
      and p.active = true
      and ps.service_id = new.service_id
      and public.is_professional_slot_blocked(p.id, new.appointment_date, new.appointment_time, v_service.duration) is not true
      and not exists (
        select 1
        from public.appointments a
        join public.services s on s.id = a.service_id
        where a.business_id = new.business_id
          and a.professional_id = p.id
          and a.appointment_date = new.appointment_date
          and a.status not in ('cancelado')
          and (tg_op <> 'UPDATE' or a.id <> new.id)
          and (
            (a.appointment_time, (a.appointment_time + (s.duration || ' minutes')::interval)::time)
            overlaps
            (new.appointment_time, (new.appointment_time + (v_service.duration || ' minutes')::interval)::time)
          )
      )
    order by p.created_at, p.name
    limit 1;

    if v_assigned is null then
      raise exception 'Nao existe profissional disponivel para este horario.';
    end if;

    new.professional_id := v_assigned;
  end if;

  select exists (
    select 1
    from public.appointments a
    join public.services s on s.id = a.service_id
    where a.business_id = new.business_id
      and a.professional_id = new.professional_id
      and a.appointment_date = new.appointment_date
      and a.status not in ('cancelado')
      and (tg_op <> 'UPDATE' or a.id <> new.id)
      and (
        (a.appointment_time, (a.appointment_time + (s.duration || ' minutes')::interval)::time)
        overlaps
        (new.appointment_time, (new.appointment_time + (v_service.duration || ' minutes')::interval)::time)
      )
  ) into v_conflict_exists;

  if v_conflict_exists then
    raise exception 'Horario indisponivel para o profissional selecionado.';
  end if;

  return new;
end;
$$;

create trigger trg_validate_appointment_integrity
before insert or update on public.appointments
for each row
execute function public.validate_appointment_integrity();

-- ============================================================
-- DADOS DE EXEMPLO (opcional — remova se não quiser seed)
-- ============================================================
-- Os dados de exemplo são inseridos pelo app após o primeiro cadastro

-- ============================================================
-- Migração manual: promover loja existente ao Pro R$ 59,90
-- (ajuste slug ou nome conforme sua base)
-- ============================================================
-- update public.businesses
-- set plan_tier = 'pro', plan_name = 'Plano Pro'
-- where slug = 'seu-slug-aqui';
--
-- ou, por nome aproximado:
-- update public.businesses
-- set plan_tier = 'pro', plan_name = 'Plano Pro'
-- where name ilike '%deh%unhas%';
