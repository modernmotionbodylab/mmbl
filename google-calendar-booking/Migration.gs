/**
 * Run once in the original Apps Script project when moving demo bookings to
 * Cal.com. Only deletes the recurring demo holds installed by Schedule.gs.
 * Existing future bookings stop the migration so they can be handled first.
 */
function removeLegacyDemoSchedule() {
  var properties = PropertiesService.getScriptProperties();
  var installed = JSON.parse(properties.getProperty('MMBL_DEMO_SERIES') || '{}');
  var keys = Object.keys(installed);
  if (!keys.length) throw new Error('No installed MMBL demo schedule was found.');

  var calendar = calendar_();
  var now = new Date();
  var horizon = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
  var booked = calendar.getEvents(now, horizon).filter(function(event) {
    return event.getTitle() === '[MMBL Demo] Online or in person' &&
      SEAT_KEYS.some(function(key) { return Boolean(event.getTag(key)); });
  });
  if (booked.length) {
    throw new Error(booked.length + ' future demo booking(s) exist in the old system. Preserve them before removing the schedule.');
  }

  // Validate every series before making any changes.
  var series = keys.map(function(key) { return calendar.getEventSeriesById(installed[key]); });
  series.forEach(function(item) {
    if (item && item.getTitle() !== '[MMBL Demo] Online or in person') {
      throw new Error('A stored event ID no longer points to an MMBL demo hold. No events were removed.');
    }
  });
  var removed = 0;
  series.forEach(function(item) {
    if (item) { item.deleteEventSeries(); removed++; }
  });
  properties.deleteProperty('MMBL_DEMO_SERIES');
  Logger.log('Removed ' + removed + ' old MMBL demo hold series.');
  return removed;
}
