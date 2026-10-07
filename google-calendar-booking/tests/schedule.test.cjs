const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

test('the Central Time schedule installs 58 shared demo starts per week only once', () => {
  const properties = new Map();
  const created = [];
  const calendar = {
    createEventSeries(title, start, end, recurrence) {
      created.push({title, start, end, recurrence});
      return {getId: () => 'series-' + created.length};
    },
  };
  const context = {
    Session: {getScriptTimeZone: () => 'America/Chicago'},
    PropertiesService: {getScriptProperties: () => ({
      getProperty: key => properties.get(key) || '',
      setProperty: (key, value) => properties.set(key, value),
    })},
    LockService: {getScriptLock: () => ({waitLock() {}, releaseLock() {}})},
    CalendarApp: {
      getCalendarById: () => calendar,
      Weekday: {MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6},
      newRecurrence: () => {
        const recurrence = {setTimeZone: () => recurrence, addWeeklyRule: () => ({
          onlyOnWeekdays(days) {recurrence.weekdays = days;},
          onlyOnWeekday(day) {recurrence.weekday = day;},
        })};
        return recurrence;
      },
    },
    Logger: {log() {}},
    Date, Number, String, JSON, RegExp, Error, Boolean, Array,
  };
  vm.createContext(context);
  for (const name of ['Code.gs', 'Schedule.gs']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', name), 'utf8'), context);
  }
  assert.equal(context.installDemoSchedule().created, 26);
  assert.equal(created.length, 26);
  assert.equal(created.filter(x => x.recurrence.weekdays?.length === 5).length, 8);
  assert.equal(created.filter(x => x.recurrence.weekday === 6).length, 18);
  assert.ok(created.every(x => x.title === '[MMBL Demo] Online or in person'));
  assert.ok(created.every(x => x.end.getTime() - x.start.getTime() === 30 * 60000));
  assert.equal(context.installDemoSchedule().created, 0);
  assert.equal(created.length, 26);
});
