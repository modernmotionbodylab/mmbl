const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

test('three seats fill, deletion removes the slot, and cancellation releases a seat', () => {
  const start = new Date(Date.now() + 86400000);
  const tags = new Map();
  const event = {
    getTitle: () => '[MMBL Demo] In person',
    getStartTime: () => start,
    getEndTime: () => new Date(start.getTime() + 30 * 60000),
    getId: () => 'training@example.com',
    getLocation: () => 'Studio',
    getTag: key => tags.get(key) || null,
    setTag: (key, value) => { tags.set(key, value); },
    deleteTag: key => { tags.delete(key); },
    getDescription: () => event.description || '',
    setDescription: text => { event.description = text; },
  };
  let events = [event];
  const cache = new Map();
  const tokens = ['a', 'b', 'c', 'd'].map(letter => letter.repeat(8) + '-aaaa-4aaa-8aaa-' + letter.repeat(12));
  tokens.forEach((token, i) => cache.set('session:' + token, ['jake','ryan','bakem','fourth'][i] + '@example.com'));
  const context = {
    CalendarApp: { getCalendarById: () => ({ getEvents: (from, until) => events.filter(e => e.getStartTime() < until && e.getEndTime() > from) }) },
    CacheService: { getScriptCache: () => ({ get: key => cache.get(key) || null }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    Date, Number, String, JSON, RegExp, Error, Boolean, Array,
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8'), context);
  const slot = context.getSessions('')[0];
  assert.equal(slot.spotsLeft, 3);
  for (const token of tokens.slice(0, 3)) context.bookSession(token, slot.id);
  assert.equal(context.getSessions('')[0].spotsLeft, 0);
  assert.match(event.description, /3 of 3 free demo spots booked/);
  assert.throws(() => context.bookSession(tokens[3], slot.id), /full/);
  assert.equal(context.getSessions(tokens[0])[0].bookedByMe, true);

  context.cancelSession(tokens[0], slot.id);
  assert.equal(context.getSessions('')[0].spotsLeft, 1);
  context.bookSession(tokens[3], slot.id);
  assert.equal(context.getSessions('')[0].spotsLeft, 0);

  events = [];
  assert.equal(context.getSessions('').length, 0);
  assert.throws(() => context.bookSession(tokens[0], slot.id), /removed from Google Calendar/);
});

test('overlapping demo times are not offered, while back-to-back times are allowed', () => {
  const start = Date.now() + 86400000;
  const makeEvent = (time, id) => ({
    getTitle: () => '[MMBL Demo] In person',
    getStartTime: () => new Date(time),
    getEndTime: () => new Date(time + 30 * 60000),
    getId: () => id,
    getTag: () => null,
  });
  const first = makeEvent(start, 'first@example.com');
  const second = makeEvent(start + 15 * 60000, 'second@example.com');
  const third = makeEvent(start + 30 * 60000, 'third@example.com');
  const events = [first, second, third];
  const context = {
    CalendarApp: { getCalendarById: () => ({ getEvents: (from, until) => events.filter(e => e.getStartTime() < until && e.getEndTime() > from) }) },
    CacheService: { getScriptCache: () => ({ get: () => null }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) },
    Date, Number, String, JSON, RegExp, Error, Boolean, Array,
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8'), context);
  const slots = context.getSessions('');
  assert.equal(slots.length, 2);
  assert.equal(slots[0].id, context.slotKey_(first));
  assert.equal(slots[1].id, context.slotKey_(third));
  assert.throws(() => context.findSession_(context.slotKey_(second)), /overlaps another workout/);
});

test('availability reads only the requested calendar week', () => {
  const tomorrow = Date.now() + 86400000;
  const makeEvent = (start, id) => ({
    getTitle: () => '[MMBL Demo] In person',
    getStartTime: () => new Date(start),
    getEndTime: () => new Date(start + 30 * 60000),
    getId: () => id,
    getTag: () => null,
  });
  const first = makeEvent(tomorrow, 'first@example.com');
  const later = makeEvent(tomorrow + 14 * 86400000, 'later@example.com');
  let requested;
  const context = {
    CalendarApp: { getCalendarById: () => ({ getEvents: (from, until) => {
      requested = { from, until };
      return [first, later].filter(e => e.getStartTime() < until && e.getEndTime() > from);
    } }) },
    CacheService: { getScriptCache: () => ({ get: () => null }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) },
    Date, Number, String, JSON, RegExp, Error, Boolean, Array,
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8'), context);
  const from = new Date(tomorrow - 3600000);
  const until = new Date(tomorrow + 7 * 86400000 - 3600000);
  assert.deepEqual(Array.from(context.getSessions('', from.toISOString(), until.toISOString()), x => x.id), [context.slotKey_(first)]);
  assert.equal(requested.until.getTime() - requested.from.getTime(), 7 * 86400000);
  assert.throws(() => context.getSessions('', from.toISOString(), new Date(tomorrow + 9 * 86400000).toISOString()), /Invalid calendar week/);
});

test('online and in-person bookings share the same three seats and other busy events block times', () => {
  const start = new Date(Date.now() + 86400000);
  const tags = new Map();
  const hybrid = {
    getTitle: () => '[MMBL Demo] Online or in person',
    getStartTime: () => start,
    getEndTime: () => new Date(start.getTime() + 30 * 60000),
    getId: () => 'shared@example.com',
    getLocation: () => 'Studio',
    getTag: key => tags.get(key) || null,
    setTag: (key, value) => tags.set(key, value),
    deleteTag: key => tags.delete(key),
    getDescription: () => '',
    setDescription: () => {},
  };
  const busy = {
    getTitle: () => 'Trainer unavailable',
    getStartTime: () => new Date(start.getTime() + 5 * 60000),
    getEndTime: () => new Date(start.getTime() + 15 * 60000),
    getId: () => 'busy@example.com',
    getTransparency: () => 'OPAQUE',
  };
  let events = [hybrid];
  const cache = new Map();
  const tokens = ['a', 'b', 'c', 'd'].map(letter => letter.repeat(8) + '-aaaa-4aaa-8aaa-' + letter.repeat(12));
  tokens.forEach((token, i) => cache.set('session:' + token, ['jake','ryan','bakem','fourth'][i] + '@example.com'));
  const context = {
    CalendarApp: { EventTransparency: {TRANSPARENT:'TRANSPARENT'}, getCalendarById: () => ({getEvents: (from, until) => events.filter(e => e.getStartTime() < until && e.getEndTime() > from)}) },
    CacheService: { getScriptCache: () => ({ get: key => cache.get(key) || null }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    Date, Number, String, JSON, RegExp, Error, Boolean, Array,
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8'), context);
  const slots = context.getSessions('');
  assert.equal(slots.length, 2);
  assert.equal(slots[0].spotsLeft, 3);
  context.bookSession(tokens[0], slots[0].id, 'online');
  context.bookSession(tokens[1], slots[0].id, 'in_person');
  context.bookSession(tokens[2], slots[0].id, 'online');
  assert.equal(context.getSessions('')[0].spotsLeft, 0);
  assert.equal(context.getSessions('')[1].spotsLeft, 0);
  assert.throws(() => context.bookSession(tokens[3], slots[0].id, 'in_person'), /full/);
  assert.equal(context.getSessions(tokens[0])[0].bookingFormat, 'online');
  events = [hybrid, busy];
  assert.equal(context.getSessions('').length, 0);
  assert.throws(() => context.bookSession(tokens[3], slots[0].id, 'online'), /no longer available/);
});
