export const defaultPeriodIds = person => person.periodIds ?? (person.periodId ? [person.periodId] : []);
export const isFlexiblePeriod = period => period?.kind === 'flexible';
export function periodBounds(period, day) {
  const midnight = Date.parse(day + 'T00:00:00+03:00');
  if (isFlexiblePeriod(period) && (!period.start || !period.end)) return { start: midnight, end: midnight + 86400000 };
  const start = Date.parse(day + 'T' + period.start + ':00+03:00');
  const end = Date.parse(day + 'T' + period.end + ':00+03:00') + (period.end < period.start ? 86400000 : 0);
  return { start, end };
}
export const allowsAnywhere = (workspace, person) =>
  person?.attendanceMethods?.anywhere ?? Boolean(workspace.punchFromAnywhere);
export const allowsCompanyLocation = person => person?.attendanceMethods?.company ?? true;
export const scheduleWeekday = day => new Date(day + 'T00:00:00Z').getUTCDay();
export const periodColors = [
  '#8754ac', '#ad681c', '#16805b', '#316dcc', '#b14165', '#698822', '#b3482b', '#5350a4',
  '#ce9a18', '#008a91', '#e4699d', '#993849', '#4a687a', '#784b33', '#77a9df', '#a7bd43',
];
export const validPeriodColor = color => typeof color === 'string' && /^#[\da-f]{6}$/i.test(color);
export const periodDefaultColor = index => periodColors[index % periodColors.length];
export const periodDisplayColor = (period, index) => validPeriodColor(period?.color) ? period.color : periodDefaultColor(index);
export function nextPeriodColor(periods) {
  const used = new Set(periods.map((period, index) => periodDisplayColor(period, index).toLowerCase()));
  return periodColors.find(color => !used.has(color)) ?? periodDefaultColor(periods.length);
}

export function isDefaultRestDay(workspace, person, weekday) {
  return Boolean(person.restWeekdays?.includes(weekday) ||
    workspace.workSchedule?.recurringRestDays?.includes(weekday) ||
    !workspace.workSchedule?.days?.includes(weekday));
}

export function periodOverrides(workspace, person, day) {
  return (workspace.workAssignments ?? []).filter(entry => entry.staffId === person.id && entry.date === day);
}

export function effectivePeriodIds(workspace, person, day) {
  const overrides = periodOverrides(workspace, person, day);
  if (overrides.length) return overrides.map(entry => entry.periodId).filter(Boolean);
  return (!person.joinDate || day >= person.joinDate) && !isDefaultRestDay(workspace, person, scheduleWeekday(day))
    ? defaultPeriodIds(person) : [];
}

export function isScheduleRestDay(workspace, person, day) {
  const overrides = periodOverrides(workspace, person, day);
  return overrides.length ? overrides.every(entry => !entry.periodId && entry.restDay !== false) :
    isDefaultRestDay(workspace, person, scheduleWeekday(day));
}

export function punchTiming(windows, now, nextPunch, openShiftStart, lastPunch) {
  if (lastPunch?.flexible) {
    if (nextPunch === 'out') return { kind: 'out', allowed: true, flexible: true, shiftStart: openShiftStart,
      shiftEnd: lastPunch.shiftEnd ?? windows.find(item => item.start === openShiftStart)?.end };
  }
  const isArrival = shift => now >= shift.arrivalStart && now <= shift.arrivalEnd;
  const isDeparture = shift => now >= shift.departureStart && now <= shift.departureEnd;
  const shift = windows.find(item => item.start === openShiftStart) ??
    windows.find(isArrival) ?? windows.find(isDeparture) ??
    windows.find(item => now >= item.start && now <= item.end) ??
    windows.find(item => item.start > now) ?? windows.at(-1);
  if (!shift) return { kind: nextPunch, allowed: true };
  if (shift.flexible) return { kind: nextPunch, allowed: now >= shift.start && now < shift.end, flexible: true, shiftStart: shift.start, shiftEnd: shift.end };
  const midpoint = (shift.start + shift.end) / 2;
  const kind = (isArrival(shift) && nextPunch !== 'out') || now < midpoint ? 'in' : 'out';
  const allowed = kind === 'in' ? isArrival(shift) :
    isDeparture(shift) && (openShiftStart == null || openShiftStart === shift.start);
  return { kind, allowed, shiftStart: shift.start };
}

export function flexibleDayTotals(punches, day, now, bounds) {
  const start = bounds?.start ?? Date.parse(day + 'T00:00:00+03:00');
  const windowEnd = bounds?.end ?? start + 86400000;
  const end = Math.min(windowEnd, now);
  let open;
  let completedMilliseconds = 0;
  for (const punch of [...punches].sort((a, b) => Date.parse(a.time) - Date.parse(b.time))) {
    if (punch.kind === 'in') open ??= punch;
    else if (punch.kind === 'out' && open) {
      if (open.flexible) completedMilliseconds += Math.max(0,
        Math.min(Date.parse(punch.time), open.shiftEnd ?? Infinity, end) - Math.max(Date.parse(open.time), start));
      open = undefined;
    }
  }
  return {
    completedMilliseconds,
    activeSince: open?.flexible && Date.parse(open.time) < end ? Math.max(Date.parse(open.time), start) : null,
    activeUntil: open?.flexible ? Math.min(open.shiftEnd ?? Infinity, windowEnd) : null,
  };
}
