import {officialHolidaysOn} from './official-holidays.js';
export const defaultPeriodIds = person => person.periodIds ?? (person.periodId ? [person.periodId] : []);
export const isFlexiblePeriod = period => period?.kind === 'flexible';
// Missing scope is a legacy shared period; new definitions carry explicit branches.
export const periodAvailableFor = (period, person) => (!Array.isArray(period?.branchIds) || period.branchIds.includes(person?.branchId)) && !period?.disabledBranchIds?.includes(person?.branchId);
export function periodDurationMinutes(period) {
  if (!period) return 0;
  if (isFlexiblePeriod(period)) return Number(period.duration) || 0;
  const minutes = value => { const [h,m] = (value ?? '').split(':').map(Number); return h*60+m; };
  return (minutes(period.end)-minutes(period.start)+1440)%1440 || 0;
}
export function periodsOverlap(a,b) {
  if (!a || !b) return false;
  const minutes = value => { const [h,m] = (value ?? '').split(':').map(Number); return h*60+m; };
  const startA=minutes(a.start),startB=minutes(b.start);
  const length=p=>(minutes(p.end)-minutes(p.start)+1440)%1440;
  if (![startA,startB].every(Number.isFinite)) return true;
  return [-1440,0,1440].some(offset => startA < startB+offset+length(b) && startB+offset < startA+length(a));
}
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
export const periodActiveOn = (period,day) => !Array.isArray(period?.weekdays) || period.weekdays.includes(scheduleWeekday(day));
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
  if(officialHolidaysOn(workspace,person,day).length)return [];
  const overrides = periodOverrides(workspace, person, day);
  if (overrides.length) return overrides.map(entry => entry.periodId).filter(Boolean);
  return (!person.joinDate || day >= person.joinDate) && !isDefaultRestDay(workspace, person, scheduleWeekday(day))
    ? defaultPeriodIds(person).filter(id=>{const period=workspace.workPeriods.find(p=>p.id===id);return periodAvailableFor(period,person)&&periodActiveOn(period,day);}) : [];
}

// Reclassify schedule metadata only; raw punch times, devices and locations remain intact.
export function reassignShiftPunches(workspace, person, days, period, requestId) {
  const periods = Array.isArray(period) ? period : [period];
  const starts = new Map();
  for (const day of days) for (const id of effectivePeriodIds(workspace, person, day)) {
    const previous = workspace.workPeriods.find(item => item.id === id);
    if (previous) starts.set(periodBounds(previous, day).start, day);
  }
  const selected = new Set(days);
  for (const punch of workspace.punches) {
    if (punch.staffId !== person.id) continue;
    const assignedDay = punch.shiftStart == null ? punch.date :
      starts.get(punch.shiftStart) ?? new Date(punch.shiftStart + 10800000).toISOString().slice(0, 10);
    const day = selected.has(assignedDay) ? assignedDay : null;
    if (!day) continue;
    const time=Date.parse(punch.time);
    const target=periods.length===1 ? periods[0] : [...periods].sort((a,b)=>{
      const x=periodBounds(a,day),y=periodBounds(b,day);
      return Math.abs(time-(punch.kind==='in'?x.start:x.end))-Math.abs(time-(punch.kind==='in'?y.start:y.end));
    })[0];
    const bounds = periodBounds(target, day);
    (punch.shiftChanges ??= []).push({requestId, shiftStart: punch.shiftStart ?? null,
      shiftEnd: punch.shiftEnd ?? null, flexible: Boolean(punch.flexible)});
    punch.shiftStart = bounds.start;
    punch.shiftEnd = bounds.end;
    punch.flexible = isFlexiblePeriod(target);
  }
}

export function isScheduleRestDay(workspace, person, day) {
  if(officialHolidaysOn(workspace,person,day).length)return true;
  const overrides = periodOverrides(workspace, person, day);
  return overrides.length ? overrides.every(entry => !entry.periodId && entry.restDay !== false) :
    isDefaultRestDay(workspace, person, scheduleWeekday(day)) || (defaultPeriodIds(person).length>0 &&
      !defaultPeriodIds(person).some(id=>{const period=workspace.workPeriods.find(p=>p.id===id);return periodAvailableFor(period,person)&&periodActiveOn(period,day);}));
}

// An unfinished historical shift remains incomplete; it is not today's open session.
export function punchSession(punches, windows, now, today) {
  const localDay = punch => new Date(Date.parse(punch.time) + 10800000).toISOString().slice(0, 10);
  const lastPunch = punches.reduce((last, punch) => Number.isFinite(Date.parse(punch.time)) &&
    (!last || Date.parse(punch.time) >= Date.parse(last.time)) ? punch : last, null);
  let openPunch = lastPunch?.kind === 'in' ? lastPunch : null;
  if (openPunch) {
    const time = Date.parse(openPunch.time);
    const window = windows.find(w => openPunch.shiftStart != null ? w.start === openPunch.shiftStart :
      time >= w.arrivalStart && time <= w.arrivalEnd);
    const start = openPunch.shiftStart ?? window?.start ?? time;
    const end = openPunch.shiftEnd ?? window?.end;
    const laterShift = windows.some(w => w.start > start && now >= w.arrivalStart &&
      end != null && now >= end);
    const sameDay = localDay(openPunch) === today;
    const overnight = window && now <= window.departureEnd && now >= time;
    if (laterShift || (!sameDay && !overnight)) openPunch = null;
  }
  return {lastPunch, openPunch, nextPunch: openPunch ? 'out' : 'in'};
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

// Save a real departure without inventing an arrival, within its scheduled
// checkout window. A second exit for the same shift is never accepted.
export function canRecordUnpairedCheckout(punches, windows, now, shiftStart) {
  const shift = windows.find(item => item.start === shiftStart);
  if (!shift || shift.flexible || now < shift.departureStart || now > shift.departureEnd) return false;
  return !punches.some(punch => punch.kind === 'out' && (punch.shiftStart != null
    ? punch.shiftStart === shift.start
    : Date.parse(punch.time) >= shift.start && Date.parse(punch.time) <= shift.departureEnd));
}

export function flexibleDayTotals(punches, day, now, bounds) {
  const start = bounds?.start ?? Date.parse(day + 'T00:00:00+03:00');
  const windowEnd = bounds?.end ?? start + 86400000;
  const end = Math.min(windowEnd, now);
  let open;
  let completedMilliseconds = 0;
  for (const punch of [...punches].sort((a, b) => Date.parse(a.time) - Date.parse(b.time))) {
    if (punch.kind === 'in') {
      const dayOf = p => p.date ?? new Date(Date.parse(p.time) + 10800000).toISOString().slice(0,10);
      const differentShift = open && (punch.shiftStart != null && open.shiftStart != null ?
        punch.shiftStart !== open.shiftStart : dayOf(punch) !== dayOf(open));
      if (!open || differentShift) open = punch;
    }
    else if (punch.kind === 'out' && open) {
      if (open.flexible) completedMilliseconds += Math.max(0,
        Math.min(Date.parse(punch.time), open.shiftEnd ?? Infinity, end) - Math.max(Date.parse(open.time), start));
      open = undefined;
    }
  }
  return {
    completedMilliseconds,
    activeSince: open?.flexible && Math.max(Date.parse(open.time), start) < Math.min(end, open.shiftEnd ?? Infinity) ? Math.max(Date.parse(open.time), start) : null,
    activeUntil: open?.flexible ? Math.min(open.shiftEnd ?? Infinity, windowEnd) : null,
  };
}
