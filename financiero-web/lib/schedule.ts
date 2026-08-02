export function isWeekdayInTimezone(date: Date, timezone: string) {
  let resolvedTimezone = timezone || 'America/Mexico_City';
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: resolvedTimezone }).format(date);
  } catch {
    resolvedTimezone = 'America/Mexico_City';
  }
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: resolvedTimezone, weekday: 'short' }).format(date);
  return weekday !== 'Sat' && weekday !== 'Sun';
}

export function isMondayInTimezone(date: Date, timezone: string) {
  let resolvedTimezone = timezone || 'America/Mexico_City';
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: resolvedTimezone }).format(date);
  } catch {
    resolvedTimezone = 'America/Mexico_City';
  }
  return new Intl.DateTimeFormat('en-US', { timeZone: resolvedTimezone, weekday: 'short' }).format(date) === 'Mon';
}
