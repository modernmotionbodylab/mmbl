/**
 * Modern Motion Body Lab booking web app.
 * Google Calendar events are the only persistent booking store.
 * Deploy as a web app: execute as the owner, access by anyone.
 */
var SEAT_KEYS = ['mmbl-seat-1', 'mmbl-seat-2', 'mmbl-seat-3'];
var BOOKING_NOTE = /(?:\n\n)?\[MMBL bookings\][\s\S]*?\[\/MMBL bookings\]/g;

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Modern Motion Body Lab — Book a workout')
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
  if (/^\[MMBL\]\s*online(?:\s|$)/i.test(title)) return 'online';
  if (/^\[MMBL\]\s*in[ -]?person(?:\s|$)/i.test(title)) return 'in_person';
  return null;
}

function isWorkout_(event) {
  return format_(event) &&
    event.getEndTime().getTime() - event.getStartTime().getTime() === 45 * 60000;
}

function seats_(event) {
  return SEAT_KEYS.map(function(key) { return event.getTag(key); });
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

function getSessions(token) {
  var email = emailFromToken_(token);
  var now = new Date();
  var until = new Date(now.getTime() + 90 * 86400000);
  var ordered = calendar_().getEvents(now, until)
    .filter(function(event) { return isWorkout_(event) && event.getStartTime() > now; })
    .sort(function(a, b) { return a.getStartTime() - b.getStartTime() || slotKey_(a).localeCompare(slotKey_(b)); });
  var previousStart = -Infinity;
  return ordered.filter(function(event) {
      var start = event.getStartTime().getTime();
      if (start < previousStart + 60 * 60000) return false;
      previousStart = start;
      return true;
    })
    .map(function(event) {
      var booked = seats_(event).filter(Boolean);
      var mine = Boolean(email && booked.indexOf(email) !== -1);
      return {
        id: slotKey_(event),
        format: format_(event),
        start: event.getStartTime().toISOString(),
        end: event.getEndTime().toISOString(),
        spotsLeft: 3 - booked.length,
        bookedByMe: mine,
        location: mine ? event.getLocation() : ''
      };
    })
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
  var candidates = calendar_().getEvents(new Date(startsAt - 1000), new Date(startsAt + 45 * 60000));
  var event = candidates.find(function(item) { return slotKey_(item) === key && isWorkout_(item); });
  if (!event) throw new Error('This workout was removed from Google Calendar. Refresh to see current times.');
  var overlappingEarlier = calendar_().getEvents(new Date(startsAt - 60 * 60000), new Date(startsAt + 1000))
    .some(function(item) {
      var otherStart = item.getStartTime().getTime();
      return isWorkout_(item) && slotKey_(item) !== key &&
        (otherStart > startsAt - 60 * 60000 && otherStart < startsAt ||
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

function stripeGet_(path, params) {
  var secret = setting_('STRIPE_SECRET_KEY');
  if (!secret) throw new Error('Paid booking verification is not configured yet.');
  var query = Object.keys(params || {}).map(function(key) {
    return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
  }).join('&');
  var url = 'https://api.stripe.com/v1' + path + (query ? '?' + query : '');
  var response = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + secret },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200)
    throw new Error('We could not verify your subscription right now. Please try later.');
  return JSON.parse(response.getContentText());
}

function paidPeriod_(email, format, workoutStart) {
  var linkId = setting_(format === 'online' ? 'ONLINE_PAYMENT_LINK_ID' : 'IN_PERSON_PAYMENT_LINK_ID');
  var allowance = Number(setting_(format === 'online' ? 'ONLINE_SESSIONS_PER_PERIOD' : 'IN_PERSON_SESSIONS_PER_PERIOD'));
  var validDays = Number(setting_('ONE_TIME_VALID_DAYS'));
  if (!linkId || !/^plink_/.test(linkId) || !Number.isInteger(allowance) || allowance < 1)
    throw new Error('Paid booking verification is not configured yet.');
  var after = '';
  var best = null;
  for (var page = 0; page < 20; page++) {
    var query = { payment_link: linkId, limit: 100 };
    if (after) query.starting_after = after;
    var result = stripeGet_('/checkout/sessions', query);
    var sessions = result.data || [];
    for (var i = 0; i < sessions.length; i++) {
      var checkout = sessions[i];
      var checkoutEmail = ((checkout.customer_details && checkout.customer_details.email) || checkout.customer_email || '').toLowerCase();
      if (checkoutEmail !== email || checkout.payment_status !== 'paid') continue;
      var period = null;
      if (checkout.mode === 'subscription' && checkout.subscription) {
        var id = typeof checkout.subscription === 'string' ? checkout.subscription : checkout.subscription.id;
        var subscription = stripeGet_('/subscriptions/' + encodeURIComponent(id));
        if (subscription.status !== 'active') continue;
        var item = subscription.items && subscription.items.data && subscription.items.data[0];
        var start = Number(item && item.current_period_start || subscription.current_period_start);
        var end = Number(item && item.current_period_end || subscription.current_period_end);
        if (start && end) period = { start: start * 1000, end: end * 1000 };
      } else if (checkout.mode === 'payment' && Number.isInteger(validDays) && validDays > 0) {
        period = { start: checkout.created * 1000, end: checkout.created * 1000 + validDays * 86400000 };
      }
      if (period && period.start <= workoutStart && workoutStart < period.end &&
          (!best || period.end > best.end)) best = period;
    }
    if (!result.has_more || !sessions.length) return best && { start: best.start, end: best.end, allowance: allowance };
    after = sessions[sessions.length - 1].id;
  }
  throw new Error('Membership lookup is taking too long. Please contact the studio.');
}

function usedSessions_(email, format, period) {
  return calendar_().getEvents(new Date(period.start), new Date(period.end))
    .filter(function(event) {
      return isWorkout_(event) && format_(event) === format &&
        event.getStartTime().getTime() >= period.start &&
        event.getStartTime().getTime() < period.end &&
        seats_(event).indexOf(email) !== -1;
    }).length;
}

function updateCount_(event) {
  var booked = seats_(event).filter(Boolean).length;
  var description = (event.getDescription() || '').replace(BOOKING_NOTE, '').trimEnd();
  var note = '[MMBL bookings]\n' + booked + ' of 3 spots booked. 45 minutes training + 15 minutes trainer gap.\n[/MMBL bookings]';
  event.setDescription((description ? description + '\n\n' : '') + note);
}

function bookSession(token, key) {
  var email = requireEmail_(token);
  var event = findSession_(key);
  var format = format_(event);
  var period = paidPeriod_(email, format, event.getStartTime().getTime());
  if (!period) throw new Error('No paid subscription was found for this training type and email.');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    // Re-read after acquiring the lock. This prevents a fourth simultaneous
    // request from seeing the same last open seat.
    event = findSession_(key);
    var seats = seats_(event);
    if (seats.indexOf(email) !== -1) throw new Error('You already booked this workout.');
    var empty = seats.indexOf(null);
    if (empty < 0) empty = seats.indexOf('');
    if (empty < 0) throw new Error('This workout is full. Refresh to see other times.');
    if (usedSessions_(email, format, period) >= period.allowance)
      throw new Error('You have used the sessions included in this subscription period.');
    event.setTag(SEAT_KEYS[empty], email);
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
    try { updateCount_(event); } catch (ignored) { /* Cancellation is saved. */ }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}
