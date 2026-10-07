import { GoogleAuth } from 'npm:google-auth-library@9.15.1';
import { createClient } from 'npm:@supabase/supabase-js@2';

type GoogleEvent = {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  etag?: string;
  status?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
};
type Workout = {
  event_id: string;
  training_format: 'online' | 'in_person';
  starts_at: string;
  ends_at: string;
  location: string;
};

const calendarId = Deno.env.get('GOOGLE_CALENDAR_ID');
const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
const jobToken = Deno.env.get('GOOGLE_SYNC_JOB_TOKEN');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const marker = /(?:\n\n)?\[MMBL bookings\][\s\S]*?\[\/MMBL bookings\]/g;

function sessionFormat(summary: string | undefined): Workout['training_format'] | null {
  if (/^\[MMBL\]\s*online(?:\s|$)/i.test(summary || '')) return 'online';
  if (/^\[MMBL\]\s*in[ -]?person(?:\s|$)/i.test(summary || '')) return 'in_person';
  return null;
}

function asWorkout(event: GoogleEvent, from: Date, until: Date): Workout | null {
  const trainingFormat = sessionFormat(event.summary);
  if (!trainingFormat || event.status === 'cancelled') return null;
  const start = new Date(event.start?.dateTime || '');
  const end = new Date(event.end?.dateTime || '');
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) ||
      end.getTime() - start.getTime() !== 45 * 60_000) {
    throw new Error(`Workout event ${event.id} must last exactly 45 minutes`);
  }
  if (start < from || start >= until) return null;
  return {
    event_id: event.id,
    training_format: trainingFormat,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    location: event.location || 'Details sent after booking',
  };
}

function descriptionWithCount(description: string | undefined, booked: number): string {
  const original = (description || '').replace(marker, '').trimEnd();
  const note = `[MMBL bookings]\n${booked} of 3 spots booked. Training lasts 45 minutes; allow 15 minutes before the next session.\n[/MMBL bookings]`;
  return original ? `${original}\n\n${note}` : note;
}

async function googleRequest(url: string, token: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init.headers },
  });
  if (!response.ok) throw new Error(`Google Calendar returned ${response.status}`);
  return response.json();
}

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!jobToken || request.headers.get('authorization') !== `Bearer ${jobToken}`)
    return new Response('Unauthorized', { status: 401 });
  if (!calendarId || !serviceAccountJson || !supabaseUrl || !serviceKey)
    return new Response('Calendar sync is not configured', { status: 503 });

  try {
    const credentials = JSON.parse(serviceAccountJson);
    const auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/calendar.events'] });
    const accessToken = await auth.getAccessToken();
    if (!accessToken) throw new Error('Google authentication failed');

    // A complete window is required. Never reconcile a partial Google response:
    // that could mistake un-fetched classes for deleted classes.
    const from = new Date();
    const until = new Date(from.getTime() + 90 * 86400_000);
    const events: GoogleEvent[] = [];
    let pageToken: string | undefined;
    do {
      const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
      url.searchParams.set('timeMin', from.toISOString());
      url.searchParams.set('timeMax', until.toISOString());
      url.searchParams.set('singleEvents', 'true');
      url.searchParams.set('showDeleted', 'false');
      url.searchParams.set('maxResults', '2500');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const page = await googleRequest(url.toString(), accessToken) as { items?: GoogleEvent[]; nextPageToken?: string };
      events.push(...(page.items || []));
      pageToken = page.nextPageToken;
    } while (pageToken);

    const workouts = events.map(event => asWorkout(event, from, until)).filter((x): x is Workout => Boolean(x));
    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data, error } = await db.rpc('sync_google_workouts', {
      calendar_id: calendarId,
      window_start: from.toISOString(),
      window_end: until.toISOString(),
      sessions: workouts,
    });
    if (error) throw error;

    // Keep the trainer's Google event useful at a glance without publishing
    // customer names or email addresses to other calendar viewers.
    const counts = new Map<string, number>((data || []).map((row: {event_id: string; booked_count: number}) =>
      [row.event_id, row.booked_count]));
    let mirrored = 0;
    for (const event of events) {
      const count = counts.get(event.id);
      if (count === undefined) continue;
      if (count === 0 && !(event.description || '').includes('[MMBL bookings]')) continue;
      const description = descriptionWithCount(event.description, count);
      if (description === (event.description || '')) continue;
      const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(event.id)}`);
      url.searchParams.set('sendUpdates', 'none');
      try {
        await googleRequest(url.toString(), accessToken, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...(event.etag ? { 'If-Match': event.etag } : {}) },
          body: JSON.stringify({ description }),
        });
        mirrored++;
      } catch (error) {
        // A concurrent trainer edit can change the ETag. The next run retries
        // with the new event, while the database seat count stays correct.
        console.error('Could not update Google booking count for event', event.id, error);
      }
    }
    return Response.json({ synced: workouts.length, mirrored });
  } catch (error) {
    console.error('Google Calendar sync failed', error);
    return new Response('Calendar sync failed; no website availability was changed', { status: 503 });
  }
});
