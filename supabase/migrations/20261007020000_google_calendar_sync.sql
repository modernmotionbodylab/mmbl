-- Google Calendar owns the training schedule. This migration is applied after
-- 20261007010000_shared_booking_calendar.sql.
alter table public.workout_sessions
  add column google_calendar_id text,
  add column google_event_id text,
  add constraint google_event_pair check
    ((google_calendar_id is null) = (google_event_id is null)),
  add constraint google_event_unique unique (google_calendar_id, google_event_id);

create table public.google_calendar_sync_state (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default false,
  last_success_at timestamptz
);
insert into public.google_calendar_sync_state (id) values (1);
alter table public.google_calendar_sync_state enable row level security;
revoke all on public.google_calendar_sync_state from anon, authenticated;

-- The server sends a complete 90-day window from Google. The transaction
-- unpublishes missing events and refunds seats when the trainer deletes a
-- future session. A failed Google fetch never calls this function, so no
-- bookings are removed on a transient API failure.
create or replace function public.sync_google_workouts(
  calendar_id text,
  window_start timestamptz,
  window_end timestamptz,
  sessions jsonb
)
returns table(event_id text, booked_count integer)
language plpgsql security definer set search_path = '' as $$
declare session_row record;
declare prior_session record;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Server access required';
  end if;
  if calendar_id is null or length(calendar_id) = 0 or
     window_start < now() - interval '1 day' or
     window_end > now() + interval '100 days' or
     window_end <= window_start or
     jsonb_typeof(sessions) <> 'array' then
    raise exception 'Invalid calendar sync input';
  end if;

  -- Updating every row first avoids a temporary overlap when the trainer
  -- moves an event to another hour in Google Calendar.
  update public.workout_sessions
    set published = false
    where google_event_id is not null
      and starts_at >= window_start and starts_at < window_end;

  for session_row in
    select * from jsonb_to_recordset(sessions) as x(
      event_id text, training_format text, starts_at timestamptz,
      ends_at timestamptz, location text
    ) order by starts_at, event_id
  loop
    if session_row.event_id is null or length(session_row.event_id) = 0 or
       session_row.training_format not in ('online', 'in_person') or
       session_row.starts_at < window_start or session_row.starts_at >= window_end or
       session_row.ends_at <> session_row.starts_at + interval '45 minutes' then
      raise exception 'Invalid Google workout event';
    end if;
    select id, starts_at, training_format into prior_session
      from public.workout_sessions
      where google_calendar_id = calendar_id
        and google_event_id = session_row.event_id;
    if found and (prior_session.starts_at <> session_row.starts_at or
                  prior_session.training_format <> session_row.training_format) then
      -- Moving a booked class must not silently move a customer's reservation.
      with removed as (
        delete from public.workout_bookings
          where session_id = prior_session.id returning entitlement_id
      ), refunds as (
        select entitlement_id, count(*)::integer as credit_count
        from removed where entitlement_id is not null group by entitlement_id
      )
      update public.booking_entitlements e
        set credits_remaining = e.credits_remaining + refunds.credit_count
        from refunds where e.id = refunds.entitlement_id;
    end if;
    insert into public.workout_sessions (
      google_calendar_id, google_event_id, training_format, starts_at,
      ends_at, trainer_reserved_until, location, published
    ) values (
      calendar_id, session_row.event_id, session_row.training_format,
      session_row.starts_at, session_row.ends_at,
      session_row.ends_at + interval '15 minutes',
      coalesce(nullif(session_row.location, ''), 'Details sent after booking'), true
    ) on conflict (google_calendar_id, google_event_id) do update
      set training_format = excluded.training_format,
          starts_at = excluded.starts_at,
          ends_at = excluded.ends_at,
          trainer_reserved_until = excluded.trainer_reserved_until,
          location = excluded.location,
          published = true;
  end loop;

  -- Missing Google events are no longer bookable. Return paid credits before
  -- removing their reservations. The event's row remains for audit history.
  with removed as (
    delete from public.workout_bookings b
    using public.workout_sessions s
    where b.session_id = s.id
      and s.google_event_id is not null
      and not s.published
      and s.starts_at > now()
      and s.starts_at >= window_start and s.starts_at < window_end
    returning b.entitlement_id
  ), refunds as (
    select entitlement_id, count(*)::integer as credit_count
    from removed where entitlement_id is not null group by entitlement_id
  )
  update public.booking_entitlements e
    set credits_remaining = e.credits_remaining + refunds.credit_count
    from refunds where e.id = refunds.entitlement_id;

  update public.google_calendar_sync_state
    set enabled = true, last_success_at = now() where id = 1;

  return query
    select s.google_event_id, count(b.id)::integer
    from public.workout_sessions s
    left join public.workout_bookings b on b.session_id = s.id
    where s.google_calendar_id = calendar_id and s.published
      and s.starts_at >= window_start and s.starts_at < window_end
    group by s.id;
end; $$;

-- If Google stops syncing, fail closed rather than accepting reservations for
-- a session that may have been deleted from the trainer's calendar.
create or replace function public.ensure_google_calendar_current()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.workout_sessions s
    where s.id = new.session_id and s.google_event_id is not null
  ) and not exists (
    select 1 from public.google_calendar_sync_state
    where id = 1 and enabled and last_success_at > now() - interval '3 minutes'
  ) then
    raise exception 'The calendar is updating. Please try again shortly';
  end if;
  return new;
end; $$;
create trigger ensure_google_calendar_current_before_booking
  before insert on public.workout_bookings
  for each row execute function public.ensure_google_calendar_current();

create or replace function public.google_calendar_health()
returns table(connected boolean, is_current boolean, last_success_at timestamptz)
language sql security definer set search_path = '' as $$
  select enabled, enabled and last_success_at > now() - interval '3 minutes',
         last_success_at
  from public.google_calendar_sync_state where id = 1;
$$;

revoke all on function public.sync_google_workouts(text,timestamptz,timestamptz,jsonb),
  public.google_calendar_health() from public, anon, authenticated;
grant execute on function public.sync_google_workouts(text,timestamptz,timestamptz,jsonb)
  to service_role;
grant execute on function public.google_calendar_health() to anon, authenticated;
