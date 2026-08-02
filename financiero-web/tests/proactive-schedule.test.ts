import test from 'node:test';
import assert from 'node:assert/strict';
import { isWeekdayInTimezone } from '../lib/schedule.ts';

test('allows proactive delivery Monday through Friday in the profile timezone', () => {
  assert.equal(isWeekdayInTimezone(new Date('2026-08-03T16:00:00.000Z'), 'America/Mexico_City'), true);
  assert.equal(isWeekdayInTimezone(new Date('2026-08-07T16:00:00.000Z'), 'America/Mexico_City'), true);
});

test('skips Saturday and Sunday in the profile timezone', () => {
  assert.equal(isWeekdayInTimezone(new Date('2026-08-08T16:00:00.000Z'), 'America/Mexico_City'), false);
  assert.equal(isWeekdayInTimezone(new Date('2026-08-09T16:00:00.000Z'), 'America/Mexico_City'), false);
});
