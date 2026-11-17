const day = 86400000;
const valid = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const iso = value => new Date(value).toISOString().slice(0, 10);
export function annualLeaveBalance(person, today, requests = [], preferences = {}) {
  if (!valid(person.joinDate) || !valid(today)) return null;
  const joined = new Date(person.joinDate);
  const anniversary = month => {
    const year = joined.getUTCFullYear();
    const index = joined.getUTCMonth() + month;
    return Date.UTC(year, index, Math.min(joined.getUTCDate(), new Date(Date.UTC(year, index + 1, 0)).getUTCDate()));
  };
  const until = Date.parse(today);
  let currentYear = 0, currentUsed = 0, earned = 0, opening = 0;
  const entitlement = Number.isFinite(person.annualLeaveDays) ? person.annualLeaveDays : null;
  const mode = preferences.availability ?? 'full';
  const carry = value => preferences.remaining === 'reset' ? 0 : preferences.remaining === 'partial'
    ? Math.min(value, Math.max(0, Number(preferences.carryoverDays) || 0)) : value;
  const events = new Map();
  const add = (when, key, value) => {
    if (when < anniversary(0) || when > until) return;
    const event = events.get(when) ?? {};
    event[key] = ['used', 'refund'].includes(key) ? (event[key] ?? 0) + Number(value) : value; events.set(when, event);
  };
  for (let month = 0; anniversary(month) <= until; month++) add(anniversary(month), 'month', month);
  const snapshot = Number.isFinite(person.currentLeaveBalance) && valid(person.currentLeaveBalanceDate)
    && person.currentLeaveBalanceDate <= today ? Date.parse(person.currentLeaveBalanceDate) : null;
  if (snapshot !== null) add(snapshot, 'snapshot', person.currentLeaveBalance);
  const snapshotAt = snapshot === null ? null : Date.parse(person.currentLeaveBalanceAt ?? (person.currentLeaveBalanceDate + 'T23:59:59.999Z'));
  for (const request of requests) {
    if (request.staffId !== person.id || request.status !== 'Approved') continue;
    if (request.type === 'Leave cancellation' && request.originalLeaveType === 'Annual leave' && snapshotAt !== null &&
      Date.parse(request.originalApprovalAt) <= snapshotAt && Date.parse(request.decidedAt) > snapshotAt &&
      Number.isFinite(request.refundedDays)) {
      add(Date.parse(request.decidedAt.slice(0, 10)), 'refund', request.refundedDays);
    }
    if (request.type !== 'Annual leave' || !valid(request.date) || !valid(request.end ?? request.date)) continue;
    const approvedAt = request.decidedAt ?? request.submittedAt ?? request.submittedOn ?? request.date;
    const timestamp = Date.parse(approvedAt);
    if (snapshotAt !== null && timestamp <= snapshotAt) continue;
    const bookedDays = (Date.parse(request.end ?? request.date) - Date.parse(request.date)) / day + 1;
    if (bookedDays > 0) add(Date.parse(approvedAt.slice(0, 10)), 'used', bookedDays);
  }
  for (const [when, event] of [...events].sort((a, b) => a[0] - b[0])) {
    if (event.month !== undefined) {
      if (event.month > 0 && event.month % 12 === 0) {
        opening = carry(Math.max(0, (entitlement ?? 0) - currentUsed));
        currentUsed = 0;
      }
      currentYear = Math.floor(event.month / 12);
      earned = entitlement === null ? null : (event.month % 12) * entitlement / 12;
    }
    if (event.snapshot !== undefined) {
      const current = currentYear > 0 ? Math.min(event.snapshot, earned ?? 0) : event.snapshot;
      opening = currentYear > 0 ? carry(Math.max(0, event.snapshot - current)) : 0;
      currentUsed = (earned ?? 0) - current;
    }
    if (event.used) {
      const fromOpening = Math.min(event.used, opening);
      opening -= fromOpening;
      currentUsed += event.used - fromOpening;
    }
    if (event.refund) {
      const intoCurrent = Math.min(Math.max(0, currentUsed), event.refund);
      currentUsed -= intoCurrent;
      const rest = event.refund - intoCurrent;
      if (currentYear > 0) opening += rest;
      else currentUsed -= rest;
    }
  }
  const started = until >= anniversary(0);
  const current = entitlement === null ? null : started ? earned - currentUsed : 0;
  const round = value => value === null ? null : Math.round(value * 1e8) / 1e8;
  return { start: iso(anniversary(currentYear * 12)), end: iso(anniversary(currentYear * 12 + 12) - day),
    entitlement, used: round(currentUsed), opening: round(opening),
    openingExpires: currentYear > 0 ? iso(anniversary(currentYear * 12 + 12)) : null,
    currentExpires: iso(anniversary(currentYear * 12 + 24)), current: round(current),
    accrued: round(current === null ? null : opening + current),
    available: round(entitlement === null ? null : !started ? 0 : opening + (mode === 'full' ? entitlement - currentUsed : current)),
    remaining: round(current === null ? null : opening + current) };
}

export function annualLeaveRequired(requests, staffId, today, candidate, excludeId) {
  const intervals = requests.filter(item => item.id !== excludeId && item.staffId === staffId && item.type === 'Annual leave' &&
    item.status === 'Pending').map(item => ({...item, end: item.end ?? item.date,
      date: item.status === 'Approved' && item.date <= today ? iso(Date.parse(today) + day) : item.date}));
  intervals.push(candidate);
  const ranges = intervals.filter(item => valid(item.date) && valid(item.end ?? item.date))
    .map(item => [Date.parse(item.date), Date.parse(item.end ?? item.date)])
    .filter(([from, to]) => from <= to).sort((a, b) => a[0] - b[0]);
  let total = 0, through = -Infinity;
  for (const [from, to] of ranges) {
    const first = Math.max(from, through + day);
    if (first <= to) total += (to - first) / day + 1;
    through = Math.max(through, to);
  }
  return total;
}
