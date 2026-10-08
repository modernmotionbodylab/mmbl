/**
 * Modern Motion Body Lab booking web app.
 * Google Calendar events are the only persistent booking store.
 * Deploy as a web app: execute as the owner, access by anyone.
 */
var SEAT_KEYS = ['mmbl-seat-1', 'mmbl-seat-2', 'mmbl-seat-3'];
var FORMAT_KEYS = ['mmbl-format-1', 'mmbl-format-2', 'mmbl-format-3'];
var BOOKING_NOTE = /(?:\n\n)?\[MMBL bookings\][\s\S]*?\[\/MMBL bookings\]/g;

function doGet(request) {
  if (request && request.parameter && request.parameter.mode === 'availability') {
    var callback = String(request.parameter.callback || '');
    if (!/^mmblAvailability_[A-Za-z0-9_]{1,40}$/.test(callback))
      throw new Error('Invalid availability callback.');
    var result;
    try {
      result = { slots: getSessions('', request.parameter.from, request.parameter.until)
        .map(function(slot) { return {
          format: slot.format, start: slot.start, end: slot.end,
          spotsLeft: slot.spotsLeft
        }; }) };
    } catch (error) {
      result = { error: 'Live availability is temporarily unavailable.' };
    }
    return ContentService.createTextOutput(callback + '(' + JSON.stringify(result) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Modern Motion Body Lab — Book a free demo')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function setting_(name) {
  return PropertiesService.getScriptProperties().getProperty(name) || '';
}

function calendar_() {
  var id = setting_('CALENDAR_ID') || 'modernmotionbodylab@gmail.com';
  var calendar = CalendarApp.getCalendarById(id);
  if (!calendar) throw new Error('The workout calendar is not connected yet.');
  return calendar;
}

function format_(event) {
  var title = event.getTitle();
  if (/^\[MMBL demo\]\s*online or in person(?:\s|$)/i.test(title)) return 'hybrid';
  if (/^\[MMBL demo\]\s*online(?:\s|$)/i.test(title)) return 'online';
  if (/^\[MMBL demo\]\s*in[ -]?person(?:\s|$)/i.test(title)) return 'in_person';
  return null;
}

function isWorkout_(event) {
  return format_(event) &&
    event.getEndTime().getTime() - event.getStartTime().getTime() === 30 * 60000;
}

function seats_(event) {
  return SEAT_KEYS.map(function(key) { return event.getTag(key); });
}

function busyConflict_(event, others) {
  var start = event.getStartTime().getTime();
  var end = event.getEndTime().getTime();
  return others.some(function(other) {
    if (slotKey_(other) === slotKey_(event)) return false;
    if (isWorkout_(other)) return false;
    if (other.getTransparency && other.getTransparency() === CalendarApp.EventTransparency.TRANSPARENT) return false;
    return other.getStartTime().getTime() < end && other.getEndTime().getTime() > start;
  });
}

function slotKey_(event) {
  // Recurring instances can share an iCal UID. Their start time distinguishes them.
  return event.getStartTime().getTime() + '|' + event.getId();
}

function emailFromToken_(token) {
  if (typeof token !== 'string' || !/^[a-f0-9-]{36}$/.test(token)) return '';
  return CacheService.getScriptCache().get('session:' + token) || '';
}

function requireEmail_(token) {
  var email = emailFromToken_(token);
  if (!email) throw new Error('Your sign-in expired. Request a new email code.');
  return email;
}

function getSessions(token, fromIso, untilIso) {
  var email = emailFromToken_(token);
  var now = new Date();
  var from = fromIso ? new Date(fromIso) : now;
  var until = untilIso ? new Date(untilIso) : new Date(now.getTime() + 90 * 86400000);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(until.getTime()) ||
      from < new Date(now.getTime() - 86400000) ||
      until > new Date(now.getTime() + 91 * 86400000) ||
      from >= until || (fromIso && until - from > 8 * 86400000)) {
    throw new Error('Invalid calendar week. Refresh and try again.');
  }
  var allEvents = calendar_().getEvents(from, until);
  var ordered = allEvents
    .filter(function(event) {
      return isWorkout_(event) && event.getStartTime() > now &&
        event.getStartTime().getTime() <= now.getTime() + 90 * 86400000 &&
        !busyConflict_(event, allEvents);
    })
    .sort(function(a, b) { return a.getStartTime() - b.getStartTime() || slotKey_(a).localeCompare(slotKey_(b)); });
  var previousStart = -Infinity;
  return ordered.filter(function(event) {
      var start = event.getStartTime().getTime();
      if (start < previousStart + 30 * 60000) return false;
      previousStart = start;
      return true;
    })
    .reduce(function(slots, event) {
      var booked = seats_(event).filter(Boolean);
      var mine = Boolean(email && booked.indexOf(email) !== -1);
      var mineIndex = mine ? seats_(event).indexOf(email) : -1;
      var savedFormat = mineIndex >= 0 ? event.getTag(FORMAT_KEYS[mineIndex]) : '';
      var formats = format_(event) === 'hybrid' ? ['in_person', 'online'] : [format_(event)];
      formats.forEach(function(format) { slots.push({
        id: slotKey_(event),
        format: format,
        start: event.getStartTime().toISOString(),
        end: event.getEndTime().toISOString(),
        spotsLeft: 3 - booked.length,
        bookedByMe: mine,
        bookingFormat: mine ? (savedFormat || format) : '',
        location: mine && (savedFormat || format) === 'in_person' ? event.getLocation() : ''
      }); });
      return slots;
    }, [])
    .sort(function(a, b) { return a.start.localeCompare(b.start); });
}

function findSession_(key) {
  var match = /^(\d{13})\|(.+)$/.exec(String(key || ''));
  if (!match) throw new Error('Invalid workout selection.');
  var startsAt = Number(match[1]);
  if (!Number.isFinite(startsAt) || startsAt <= Date.now() ||
      startsAt > Date.now() + 90 * 86400000) {
    throw new Error('This workout is no longer available.');
  }
  var candidates = calendar_().getEvents(new Date(startsAt - 1000), new Date(startsAt + 30 * 60000));
  var event = candidates.find(function(item) { return slotKey_(item) === key && isWorkout_(item); });
  if (!event) throw new Error('This workout was removed from Google Calendar. Refresh to see current times.');
  if (busyConflict_(event, candidates)) throw new Error('This time is no longer available on the trainer’s calendar.');
  var overlappingEarlier = calendar_().getEvents(new Date(startsAt - 30 * 60000), new Date(startsAt + 1000))
    .some(function(item) {
      var otherStart = item.getStartTime().getTime();
      return isWorkout_(item) && slotKey_(item) !== key &&
        (otherStart > startsAt - 30 * 60000 && otherStart < startsAt ||
         otherStart === startsAt && slotKey_(item) < key);
    });
  if (overlappingEarlier) throw new Error('This time overlaps another workout. Choose a different session.');
  return event;
}

function emailKey_(email) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, email);
  return Utilities.base64EncodeWebSafe(digest).replace(/=+$/, '');
}

function sendCode(email) {
  email = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    throw new Error('Enter a valid email address.');
  var cache = CacheService.getScriptCache();
  var key = emailKey_(email);
  if (cache.get('rate:' + key))
    throw new Error('A code was sent recently. Please wait one minute before trying again.');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sentThisHour = Number(cache.get('codes:hour') || 0);
    if (sentThisHour >= 40) throw new Error('Sign-in is busy. Please try again later.');
    cache.put('codes:hour', String(sentThisHour + 1), 3600);
  } finally {
    lock.releaseLock();
  }
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid());
  var number = (((bytes[0] & 255) << 16) | ((bytes[1] & 255) << 8) | (bytes[2] & 255)) % 1000000;
  var code = ('000000' + number).slice(-6);
  cache.put('otp:' + key, JSON.stringify({ code: code, attempts: 0 }), 600);
  cache.put('rate:' + key, '1', 60);
  MailApp.sendEmail({
    to: email,
    subject: 'Your Modern Motion Body Lab booking code',
    body: 'Your sign-in code is ' + code + '. It expires in 10 minutes.\n\nIf you did not request it, you can ignore this email.'
  });
  return true;
}

function verifyCode(email, code) {
  email = String(email || '').trim().toLowerCase();
  var cache = CacheService.getScriptCache();
  var key = emailKey_(email);
  var saved = cache.get('otp:' + key);
  if (!saved) throw new Error('That code expired. Request a new one.');
  var state = JSON.parse(saved);
  state.attempts++;
  if (state.attempts > 5) {
    cache.remove('otp:' + key);
    throw new Error('Too many attempts. Request a new code.');
  }
  if (String(code || '').trim() !== state.code) {
    cache.put('otp:' + key, JSON.stringify(state), 600);
    throw new Error('Incorrect code. Please try again.');
  }
  cache.remove('otp:' + key);
  var token = Utilities.getUuid();
  cache.put('session:' + token, email, 21600);
  return { token: token, email: email };
}

function hasUpcomingDemo_(email) {
  var now = new Date();
  return calendar_().getEvents(now, new Date(now.getTime() + 90 * 86400000))
    .filter(function(event) {
      return isWorkout_(event) && event.getStartTime() > now &&
        seats_(event).indexOf(email) !== -1;
    }).length > 0;
}

function updateCount_(event) {
  var booked = seats_(event).filter(Boolean).length;
  var description = (event.getDescription() || '').replace(BOOKING_NOTE, '').trimEnd();
  var note = '[MMBL bookings]\n' + booked + ' of 3 free demo spots booked. 30-minute session.\n[/MMBL bookings]';
  event.setDescription((description ? description + '\n\n' : '') + note);
}

function bookSession(token, key, requestedFormat) {
  var email = requireEmail_(token);
  var event = findSession_(key);
  var format = requestedFormat || format_(event);
  if (format !== 'online' && format !== 'in_person') throw new Error('Choose online or in-person training.');
  if (format_(event) !== 'hybrid' && format_(event) !== format)
    throw new Error('That training format is not offered at this time.');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    // Re-read after acquiring the lock. This prevents a fourth simultaneous
    // request from seeing the same last open seat.
    event = findSession_(key);
    if (format_(event) !== 'hybrid' && format_(event) !== format)
      throw new Error('That training format is not offered at this time.');
    var seats = seats_(event);
    if (seats.indexOf(email) !== -1) throw new Error('You already booked this workout.');
    var empty = seats.indexOf(null);
    if (empty < 0) empty = seats.indexOf('');
    if (empty < 0) throw new Error('This workout is full. Refresh to see other times.');
    if (hasUpcomingDemo_(email))
      throw new Error('You already have a free demo booked. Cancel it before choosing another time.');
    event.setTag(SEAT_KEYS[empty], email);
    event.setTag(FORMAT_KEYS[empty], format);
    try { updateCount_(event); } catch (ignored) { /* Seat is still saved. */ }
    return { ok: true, start: event.getStartTime().toISOString(), format: format };
  } finally {
    lock.releaseLock();
  }
}

function cancelSession(token, key) {
  var email = requireEmail_(token);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var event = findSession_(key);
    var seat = seats_(event).indexOf(email);
    if (seat < 0) throw new Error('You do not have a booking for this workout.');
    event.deleteTag(SEAT_KEYS[seat]);
    event.deleteTag(FORMAT_KEYS[seat]);
    try { updateCount_(event); } catch (ignored) { /* Cancellation is saved. */ }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}
