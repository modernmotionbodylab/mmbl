/**
 * Run installDemoSchedule once in the Apps Script editor after setting the
 * project time zone to America/Chicago. The created recurring events are the
 * source of truth for availability; delete an occurrence in Google Calendar
 * to remove that particular time from the website.
 */
function installDemoSchedule() {
  if (Session.getScriptTimeZone() !== 'America/Chicago') {
    throw new Error('Set the Apps Script project time zone to America/Chicago before installing demo times.');
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var properties = PropertiesService.getScriptProperties();
    var installed = JSON.parse(properties.getProperty('MMBL_DEMO_SERIES') || '{}');
    var today = new Date();
    var monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
    var saturday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 5);
    var schedule = [];
    [5, 6, 7, 8, 17, 18, 19, 20].forEach(function(hour) {
      schedule.push({key: 'weekday-' + hour, date: monday, hour: hour, minute: 0, weekdays: true});
    });
    [[5, 10], [17, 21]].forEach(function(window) {
      for (var hour = window[0]; hour < window[1]; hour++) {
        [0, 30].forEach(function(minute) {
          schedule.push({key: 'saturday-' + hour + '-' + minute, date: saturday, hour: hour, minute: minute, weekdays: false});
        });
      }
    });
    var created = 0;
    schedule.forEach(function(slot) {
      if (installed[slot.key]) return;
      var start = new Date(slot.date.getFullYear(), slot.date.getMonth(), slot.date.getDate(), slot.hour, slot.minute);
      var end = new Date(start.getTime() + 30 * 60000);
      var recurrence = CalendarApp.newRecurrence().setTimeZone('America/Chicago');
      var rule = recurrence.addWeeklyRule();
      if (slot.weekdays) {
        rule.onlyOnWeekdays([
          CalendarApp.Weekday.MONDAY, CalendarApp.Weekday.TUESDAY,
          CalendarApp.Weekday.WEDNESDAY, CalendarApp.Weekday.THURSDAY,
          CalendarApp.Weekday.FRIDAY
        ]);
      } else {
        rule.onlyOnWeekday(CalendarApp.Weekday.SATURDAY);
      }
      var series = calendar_().createEventSeries(
        '[MMBL Demo] Online or in person', start, end, recurrence,
        {description: 'Free 30-minute demo. Online and in-person visitors share three spots. Managed by Modern Motion Body Lab booking.'}
      );
      installed[slot.key] = series.getId();
      properties.setProperty('MMBL_DEMO_SERIES', JSON.stringify(installed));
      created++;
    });
    Logger.log('Demo schedule ready: ' + schedule.length + ' recurring time patterns; ' + created + ' created now.');
    return {patterns: schedule.length, created: created};
  } finally {
    lock.releaseLock();
  }
}
