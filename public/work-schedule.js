export const defaultPeriodIds = person => person.periodIds ?? (person.periodId ? [person.periodId] : []);
export const isFlexiblePeriod = period => period?.kind === 'flexible';

export function effectivePeriodIds(workspace, person, day) {
  const overrides = (workspace.workAssignments ?? []).filter(entry => entry.staffId === person.id && entry.date === day);
  if (overrides.length) return overrides.map(entry => entry.periodId).filter(Boolean);
  const weekday = new Date(day + 'T00:00:00Z').getUTCDay();
  return (!person.joinDate || day >= person.joinDate) && workspace.workSchedule?.days?.includes(weekday)
    ? defaultPeriodIds(person) : [];
}

export function punchTiming(windows, now, nextPunch, openShiftStart, lastPunch) {
  if (lastPunch?.flexible) {
    const delay = (lastPunch.kind === 'in' ? 15 : 5) * 60_000;
    if (now < Date.parse(lastPunch.time) + delay) {
      return { kind: lastPunch.kind, allowed: false, cooldown: true };
    }
    if (nextPunch === 'out') return { kind: 'out', allowed: true, flexible: true, shiftStart: openShiftStart };
  }
  const isArrival = shift => now >= shift.arrivalStart && now <= shift.arrivalEnd;
  const isDeparture = shift => now >= shift.departureStart && now <= shift.departureEnd;
  const shift = windows.find(item => item.start === openShiftStart) ??
    windows.find(isArrival) ?? windows.find(isDeparture) ??
    windows.find(item => now >= item.start && now <= item.end) ??
    windows.find(item => item.start > now) ?? windows.at(-1);
  if (!shift) return { kind: nextPunch, allowed: true };
  if (shift.flexible) return { kind: nextPunch, allowed: now >= shift.start && now < shift.end, flexible: true, shiftStart: shift.start };
  const midpoint = (shift.start + shift.end) / 2;
  const kind = (isArrival(shift) && nextPunch !== 'out') || now < midpoint ? 'in' : 'out';
  const allowed = kind === 'in' ? isArrival(shift) :
    isDeparture(shift) && (openShiftStart == null || openShiftStart === shift.start);
  return { kind, allowed, shiftStart: shift.start };
}
