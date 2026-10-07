const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

test('three seats fill, deletion removes the slot, and cancellation releases a seat', () => {
  const start = new Date(Date.now() + 86400000);
  const tags = new Map();
  const event = {
    getTitle: () => '[MMBL] In person',
    getStartTime: () => start,
    getEndTime: () => new Date(start.getTime() + 45 * 60000),
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
  assert.throws(() => context.bookSession(tokens[0], slot.id), /Paid booking verification is not configured/);
  context.paidPeriod_ = () => ({ start: Date.now(), end: Date.now() + 5 * 86400000, allowance: 10 });

  for (const token of tokens.slice(0, 3)) context.bookSession(token, slot.id);
  assert.equal(context.getSessions('')[0].spotsLeft, 0);
  assert.match(event.description, /3 of 3 spots booked/);
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

test('paid member lookup uses the matching Stripe payment link and current period', () => {
  const now = Math.floor(Date.now() / 1000);
  const settings = {
    STRIPE_SECRET_KEY: 'sk_test_example',
    ONLINE_PAYMENT_LINK_ID: 'plink_online',
    ONLINE_SESSIONS_PER_PERIOD: '5',
  };
  const requested = [];
  const context = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => settings[key] || '' }) },
    UrlFetchApp: { fetch: url => {
      requested.push(url);
      const value = url.includes('/checkout/sessions')
        ? {data:[{id:'cs_1',mode:'subscription',payment_status:'paid',customer_details:{email:'jake@example.com'},subscription:'sub_1'}],has_more:false}
        : {status:'active',items:{data:[{current_period_start:now-3600,current_period_end:now+86400}]}};
      return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(value)};
    } },
    Date, Number, String, JSON, RegExp, Error, Boolean, Array,
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8'), context);
  const period = context.paidPeriod_('jake@example.com','online',Date.now()+3600000);
  assert.equal(period.allowance,5);
  assert.ok(period.end > Date.now());
  assert.ok(requested[0].includes('payment_link=plink_online'));
  assert.equal(context.paidPeriod_('other@example.com','online',Date.now()),null);
});

test('a second workout inside the 15-minute trainer gap cannot be booked', () => {
  const start = Date.now() + 86400000;
  const makeEvent = (time, id) => ({
    getTitle: () => '[MMBL] In person',
    getStartTime: () => new Date(time),
    getEndTime: () => new Date(time + 45 * 60000),
    getId: () => id,
    getTag: () => null,
  });
  const first = makeEvent(start, 'first@example.com');
  const second = makeEvent(start + 45 * 60000, 'second@example.com');
  const events = [first, second];
  const context = {
    CalendarApp: { getCalendarById: () => ({ getEvents: (from, until) => events.filter(e => e.getStartTime() < until && e.getEndTime() > from) }) },
    CacheService: { getScriptCache: () => ({ get: () => null }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) },
    Date, Number, String, JSON, RegExp, Error, Boolean, Array,
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8'), context);
  const slots = context.getSessions('');
  assert.equal(slots.length, 1);
  assert.equal(slots[0].id, context.slotKey_(first));
  assert.throws(() => context.findSession_(context.slotKey_(second)), /overlaps another workout/);
});
