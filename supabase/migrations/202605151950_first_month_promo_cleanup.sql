alter table public.businesses
  add column if not exists promotional_ends_at timestamptz;

update public.businesses
set promotional_ends_at = coalesce(promotional_ends_at, trial_ends_at)
where promotional_ends_at is null
  and trial_ends_at is not null;

update public.businesses
set billing_status = 'active'
where billing_status = 'trial';

alter table public.businesses drop constraint if exists businesses_billing_status_check;
alter table public.businesses
  add constraint businesses_billing_status_check
  check (billing_status in ('active','past_due','blocked','canceled','pendente'));

comment on column public.businesses.promotional_ends_at is 'Fim do 1o mes promocional.';

alter table public.businesses drop column if exists trial_ends_at;
