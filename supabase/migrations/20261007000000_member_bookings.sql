-- Members sign in with a verified email. Only Stripe's signed webhook grants credits.
create extension if not exists pgcrypto;

create table public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 2 and 120),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text not null default 'Location to be confirmed',
  capacity integer not null check (capacity between 1 and 30),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  constraint valid_session_time check (ends_at > starts_at)
);
create index training_sessions_upcoming on public.training_sessions (starts_at) where published;

create table public.training_credits (
  id uuid primary key default gen_random_uuid(),
  member_email text not null check (member_email = lower(member_email)),
  plan text not null check (plan in ('semi_private')),
  credits_total integer not null check (credits_total > 0),
  expires_at timestamptz not null,
  stripe_source text not null unique,
  stripe_subscription_id text,
  created_at timestamptz not null default now()
);
create index training_credits_member on public.training_credits (member_email, expires_at);
create index training_credits_subscription on public.training_credits (stripe_subscription_id);

create table public.training_bookings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_sessions(id) on delete restrict,
  credit_id uuid not null references public.training_credits(id) on delete restrict,
  member_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (session_id, member_id)
);
create index training_bookings_credit on public.training_bookings (credit_id);

alter table public.training_sessions enable row level security;
alter table public.training_credits enable row level security;
alter table public.training_bookings enable row level security;
-- Direct writes are reserved for the service role. Members use checked database functions.
revoke all on public.training_sessions, public.training_credits, public.training_bookings from anon, authenticated;

create or replace function public.member_schedule()
returns table (id uuid, title text, starts_at timestamptz, ends_at timestamptz,
               location text, capacity integer, spots_left integer, booked boolean)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  return query
    select s.id, s.title, s.starts_at, s.ends_at, s.location, s.capacity,
      (s.capacity - count(b.id)::integer) as spots_left,
      coalesce(bool_or(b.member_id = auth.uid()), false) as booked
    from public.training_sessions s
    left join public.training_bookings b on b.session_id = s.id
    where s.published and s.starts_at > now() and s.starts_at < now() + interval '90 days'
    group by s.id order by s.starts_at;
end; $$;

create or replace function public.member_balance()
returns table (credits_remaining integer, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare verified_email text;
begin
  verified_email := lower(auth.jwt() ->> 'email');
  if auth.uid() is null or verified_email is null then raise exception 'Sign in required'; end if;
  return query
    select greatest(0, c.credits_total - count(b.id)::integer), c.expires_at
    from public.training_credits c
    left join public.training_bookings b on b.credit_id = c.id
    where c.member_email = verified_email and c.expires_at > now()
    group by c.id order by c.expires_at;
end; $$;

create or replace function public.book_workout(workout_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare chosen public.training_sessions%rowtype;
declare credit public.training_credits%rowtype;
declare used integer;
declare verified_email text;
begin
  verified_email := lower(auth.jwt() ->> 'email');
  if auth.uid() is null or verified_email is null then raise exception 'Sign in required'; end if;
  select * into chosen from public.training_sessions where id = workout_id for update;
  if not found or not chosen.published or chosen.starts_at <= now() then
    raise exception 'This workout is unavailable';
  end if;
  if exists(select 1 from public.training_bookings where session_id = workout_id and member_id = auth.uid()) then
    raise exception 'You already booked this workout';
  end if;
  if (select count(*) from public.training_bookings where session_id = workout_id) >= chosen.capacity then
    raise exception 'This workout is full';
  end if;
  -- Lock every eligible credit row so concurrent requests cannot overspend credits.
  for credit in select * from public.training_credits
    where member_email = verified_email and plan = 'semi_private' and expires_at >= chosen.ends_at
    order by expires_at for update loop
    select count(*) into used from public.training_bookings where credit_id = credit.id;
    if used < credit.credits_total then
      insert into public.training_bookings(session_id, credit_id, member_id)
        values (workout_id, credit.id, auth.uid());
      return;
    end if;
  end loop;
  raise exception 'No session credits are available for this workout';
end; $$;

create or replace function public.cancel_workout(workout_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if not exists(select 1 from public.training_sessions where id = workout_id and starts_at > now()) then
    raise exception 'This workout can no longer be cancelled online';
  end if;
  delete from public.training_bookings where session_id = workout_id and member_id = auth.uid();
  if not found then raise exception 'No booking found'; end if;
end; $$;

revoke all on function public.member_schedule(), public.member_balance(),
  public.book_workout(uuid), public.cancel_workout(uuid) from public, anon;
grant execute on function public.member_schedule(), public.member_balance(),
  public.book_workout(uuid), public.cancel_workout(uuid) to authenticated;
