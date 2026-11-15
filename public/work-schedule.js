export const defaultPeriodIds = person => person.periodIds ?? (person.periodId ? [person.periodId] : []);

export function effectivePeriodIds(workspace, person, day) {
  const overrides = (workspace.workAssignments ?? []).filter(entry => entry.staffId === person.id && entry.date === day);
  if (overrides.length) return overrides.map(entry => entry.periodId).filter(Boolean);
  const weekday = new Date(day + 'T00:00:00Z').getUTCDay();
  return (!person.joinDate || day >= person.joinDate) && workspace.workSchedule?.days?.includes(weekday)
    ? defaultPeriodIds(person) : [];
}

export function punchTiming(windows, now, nextPunch, openShiftStart) {
  const isArrival = shift => now >= shift.arrivalStart && now <= shift.arrivalEnd;
  const isDeparture = shift => now >= shift.departureStart && now <= shift.departureEnd;
  const shift = windows.find(item => item.start === openShiftStart) ??
    windows.find(isArrival) ?? windows.find(isDeparture) ??
    windows.find(item => now >= item.start && now <= item.end) ??
    windows.find(item => item.start > now) ?? windows.at(-1);
  if (!shift) return { kind: nextPunch, allowed: true };
  const midpoint = (shift.start + shift.end) / 2;
  const kind = (isArrival(shift) && nextPunch !== 'out') || now < midpoint ? 'in' : 'out';
  const allowed = kind === 'in' ? isArrival(shift) :
    isDeparture(shift) && (openShiftStart == null || openShiftStart === shift.start);
  return { kind, allowed, shiftStart: shift.start };
}
