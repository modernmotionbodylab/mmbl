-- One trainer: each published block has 45 minutes of training and 15 minutes
-- reserved afterward. The database, not the browser, enforces three seats.
create extension if not exists pgcrypto;

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  training_format text not null check (training_format in ('online', 'in_person')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  trainer_reserved_until timestamptz not null,
  location text not null default 'Details sent after booking',
  published boolean not null default false,
  created_at timestamptz not null default now(),
  constraint session_is_45_minutes check (ends_at = starts_at + interval '45 minutes'),
  constraint trainer_gap_is_15_minutes check (trainer_reserved_until = ends_at + interval '15 minutes'),
  constraint one_trainer_no_overlap exclude using gist
    (tstzrange(starts_at, trainer_reserved_until, '[)') with &&) where (published)
);
create index workout_sessions_upcoming on public.workout_sessions(starts_at) where published;

create table public.booking_settings (
  id integer primary key default 1 check (id = 1),
  require_payment boolean not null default true
);
insert into public.booking_settings(id, require_payment) values (1, true);

create table public.booking_entitlements (
  id uuid primary key default gen_random_uuid(),
  member_email text not null check (member_email = lower(member_email)),
  training_format text not null check (training_format in ('online', 'in_person')),
  credits_remaining integer not null check (credits_remaining >= 0),
  active_until timestamptz not null,
  stripe_source text not null unique,
  stripe_subscription_id text,
  created_at timestamptz not null default now()
);
create index booking_entitlements_member on public.booking_entitlements(member_email, training_format, active_until);
create index booking_entitlements_subscription on public.booking_entitlements(stripe_subscription_id);

create table public.workout_bookings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete restrict,
  member_id uuid not null references auth.users(id) on delete cascade,
  entitlement_id uuid references public.booking_entitlements(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(session_id, member_id)
);
create index workout_bookings_entitlement on public.workout_bookings(entitlement_id);

alter table public.workout_sessions enable row level security;
alter table public.workout_bookings enable row level security;
alter table public.booking_entitlements enable row level security;
alter table public.booking_settings enable row level security;
revoke all on public.workout_sessions, public.workout_bookings,
  public.booking_entitlements, public.booking_settings from anon, authenticated;

create or replace function public.available_workouts()
returns table(id uuid, training_format text, starts_at timestamptz, ends_at timestamptz,
              location text, spots_left integer, booked_by_me boolean)
language sql security definer set search_path = '' as $$
  select s.id, s.training_format, s.starts_at, s.ends_at,
    case when coalesce(bool_or(b.member_id = auth.uid()), false)
      then s.location else 'Details sent after booking' end as location,
    (3 - count(b.id)::integer) as spots_left,
    coalesce(bool_or(b.member_id = auth.uid()), false) as booked_by_me
  from public.workout_sessions s
  left join public.workout_bookings b on b.session_id = s.id
  where s.published and s.starts_at > now() and s.starts_at < now() + interval '90 days'
  group by s.id order by s.starts_at;
$$;

create or replace function public.member_credits()
returns table(training_format text, credits_remaining integer, active_until timestamptz)
language plpgsql security definer set search_path = '' as $$
declare verified_email text;
begin
  verified_email := lower(auth.jwt() ->> 'email');
  if auth.uid() is null or verified_email is null then raise exception 'Sign in required'; end if;
  return query
    select e.training_format, e.credits_remaining, e.active_until
    from public.booking_entitlements e
    where e.member_email = verified_email and e.active_until > now()
    order by e.active_until;
end; $$;

create or replace function public.book_workout(workout_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare selected_session public.workout_sessions%rowtype;
declare credit public.booking_entitlements%rowtype;
declare verified_email text;
declare payment_required boolean;
begin
  verified_email := lower(auth.jwt() ->> 'email');
  if auth.uid() is null or verified_email is null then raise exception 'Sign in required'; end if;
  select * into selected_session from public.workout_sessions where id = workout_id for update;
  if not found or not selected_session.published or selected_session.starts_at <= now() then
    raise exception 'This workout is unavailable';
  end if;
  if exists (select 1 from public.workout_bookings where session_id = workout_id and member_id = auth.uid()) then
    raise exception 'You already booked this workout';
  end if;
  if (select count(*) from public.workout_bookings where session_id = workout_id) >= 3 then
    raise exception 'This workout is full';
  end if;
  select require_payment into payment_required from public.booking_settings where id = 1;
  if payment_required then
    select * into credit from public.booking_entitlements
      where member_email = verified_email and training_format = selected_session.training_format
        and active_until >= selected_session.ends_at and credits_remaining > 0
      order by active_until limit 1 for update;
    if not found then raise exception 'No paid session credits are available for this workout'; end if;
    update public.booking_entitlements set credits_remaining = credits_remaining - 1 where id = credit.id;
    insert into public.workout_bookings(session_id, member_id, entitlement_id)
      values(workout_id, auth.uid(), credit.id);
  else
    insert into public.workout_bookings(session_id, member_id) values(workout_id, auth.uid());
  end if;
end; $$;

create or replace function public.cancel_workout(workout_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare selected_session public.workout_sessions%rowtype;
declare booking_credit uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select * into selected_session from public.workout_sessions where id = workout_id for update;
  if not found or selected_session.starts_at <= now() then
    raise exception 'This workout can no longer be cancelled online';
  end if;
  delete from public.workout_bookings where session_id = workout_id and member_id = auth.uid()
    returning entitlement_id into booking_credit;
  if not found then raise exception 'No booking found'; end if;
  if booking_credit is not null then
    update public.booking_entitlements set credits_remaining = credits_remaining + 1 where id = booking_credit;
  end if;
end; $$;

revoke all on function public.available_workouts(), public.member_credits(),
  public.book_workout(uuid), public.cancel_workout(uuid) from public, anon;
grant execute on function public.available_workouts() to anon, authenticated;
grant execute on function public.member_credits(), public.book_workout(uuid),
  public.cancel_workout(uuid) to authenticated;
