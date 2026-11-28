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
