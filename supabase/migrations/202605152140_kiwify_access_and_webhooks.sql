create table if not exists public.billing_access (
  id uuid primary key default uuid_generate_v4(),
  email text not null,
  provider text not null default 'kiwify',
  plan_tier text,
  billing_status text not null default 'invited',
  current_period_end timestamptz,
  auth_user_id uuid references auth.users(id) on delete set null,
  business_id uuid references public.businesses(id) on delete set null,
  provider_product_id text,
  provider_product_name text,
  provider_order_id text,
  provider_subscription_id text,
  provider_customer_id text,
  invite_sent_at timestamptz,
  last_event text,
  last_event_at timestamptz,
  raw_payload jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (email, provider)
);

alter table public.billing_access add column if not exists plan_tier text;
alter table public.billing_access add column if not exists billing_status text not null default 'invited';
alter table public.billing_access add column if not exists current_period_end timestamptz;
alter table public.billing_access add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
alter table public.billing_access add column if not exists business_id uuid references public.businesses(id) on delete set null;
alter table public.billing_access add column if not exists provider_product_id text;
alter table public.billing_access add column if not exists provider_product_name text;
alter table public.billing_access add column if not exists provider_order_id text;
alter table public.billing_access add column if not exists provider_subscription_id text;
alter table public.billing_access add column if not exists provider_customer_id text;
alter table public.billing_access add column if not exists invite_sent_at timestamptz;
alter table public.billing_access add column if not exists last_event text;
alter table public.billing_access add column if not exists last_event_at timestamptz;
alter table public.billing_access add column if not exists raw_payload jsonb;
alter table public.billing_access add column if not exists created_at timestamptz default now();
alter table public.billing_access add column if not exists updated_at timestamptz default now();

alter table public.billing_access drop constraint if exists billing_access_plan_tier_check;
alter table public.billing_access
  add constraint billing_access_plan_tier_check
  check (plan_tier is null or plan_tier in ('starter','pro'));

alter table public.billing_access drop constraint if exists billing_access_status_check;
alter table public.billing_access
  add constraint billing_access_status_check
  check (billing_status in ('invited','active','pendente','past_due','canceled','refunded','chargeback'));

create unique index if not exists idx_billing_access_email_provider
  on public.billing_access (lower(email), provider);
create index if not exists idx_billing_access_auth_user on public.billing_access (auth_user_id);
create index if not exists idx_billing_access_business on public.billing_access (business_id);
create unique index if not exists idx_billing_access_provider_order
  on public.billing_access (provider, provider_order_id)
  where provider_order_id is not null;
create unique index if not exists idx_billing_access_provider_subscription
  on public.billing_access (provider, provider_subscription_id)
  where provider_subscription_id is not null;

create table if not exists public.billing_webhook_events (
  id uuid primary key default uuid_generate_v4(),
  provider text not null,
  event_name text not null,
  event_key text not null unique,
  received_at timestamptz default now(),
  payload jsonb not null
);

create unique index if not exists idx_billing_webhook_events_key on public.billing_webhook_events (event_key);

alter table public.billing_access enable row level security;
alter table public.billing_webhook_events enable row level security;

create or replace function public.handle_billing_access_business_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.billing_access
     set business_id = new.id,
         auth_user_id = new.owner_id,
         updated_at = now()
   where lower(email) = lower(coalesce(new.owner_email, ''))
     and provider = 'kiwify';

  return new;
end;
$$;

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

  return new;
end;
$$;

drop trigger if exists trg_handle_billing_access_business_link on public.businesses;
create trigger trg_handle_billing_access_business_link
after insert or update of owner_id, owner_email on public.businesses
for each row
execute function public.handle_billing_access_business_link();

update public.billing_access ba
   set auth_user_id = u.user_id,
       updated_at = now()
  from public.user_directory u
 where lower(ba.email) = lower(coalesce(u.email, ''))
   and ba.provider = 'kiwify'
   and coalesce(ba.auth_user_id, '00000000-0000-0000-0000-000000000000'::uuid) <> u.user_id;

update public.billing_access ba
   set business_id = b.id,
       auth_user_id = b.owner_id,
       updated_at = now()
  from public.businesses b
 where lower(ba.email) = lower(coalesce(b.owner_email, ''))
   and ba.provider = 'kiwify';

drop policy if exists "billing_access_self_or_platform_admin" on public.billing_access;
create policy "billing_access_self_or_platform_admin" on public.billing_access
  for select using (
    lower(email) = lower(coalesce(auth.jwt()->>'email', ''))
    or public.is_platform_admin()
  );
