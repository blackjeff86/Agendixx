alter table public.professionals
  add column if not exists day_off_weekdays int[];

update public.professionals
set day_off_weekdays = array[day_off_weekday]
where day_off_weekday is not null
  and (day_off_weekdays is null or array_length(day_off_weekdays, 1) is null);

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
      p.day_off_weekdays,
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
      (
        (pd.day_off_weekdays is not null and extract(dow from p_date)::int = any(pd.day_off_weekdays))
        or (pd.day_off_weekday is not null and pd.day_off_weekday = extract(dow from p_date)::int)
      )
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
