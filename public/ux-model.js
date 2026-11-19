import { effectivePeriodIds, periodBounds, isScheduleRestDay } from './work-schedule.js';

export const normalizeSearch = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase()
  .replace(/[\u064b-\u065f\u0670\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim();

// A displayed absence is final only when every scheduled attendance window is over.
export function attendanceState(workspace, person, day, now = Date.now()) {
  const periods = new Map((workspace.workPeriods ?? []).map(period => [period.id, period]));
  const shifts = effectivePeriodIds(workspace, person, day).map(id => periods.get(id)).filter(Boolean);
  const leave = (workspace.requests ?? []).some(request => request.staffId === person.id && request.status === 'Approved' &&
    (workspace.leaveTypes ?? []).includes(request.type) && request.date <= day && (request.end ?? request.date) >= day);
  const records = (workspace.punches ?? []).filter(record => record.staffId === person.id && record.date === day)
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  // Include an overnight clock-out belonging to the previous day's clock-in.
  const lastIn = records.findLast(record => record.kind === 'in');
  const all = (workspace.punches ?? []).filter(record => record.staffId === person.id);
  const laterOut = lastIn && all.some(record => record.kind === 'out' && Date.parse(record.time) > Date.parse(lastIn.time) &&
    Date.parse(record.time) - Date.parse(lastIn.time) <= 86400000);
  const windows = shifts.map(period => ({ ...periodBounds(period, day), period }));
  const begins = Math.min(...windows.map(window => window.start));
  const ends = Math.max(...windows.map(window => window.end + (window.period.departure?.after ?? 0) * 60000));
  if (records.length) {
    if (lastIn && !laterOut) return now <= ends || !windows.length ? 'Working' : 'Incomplete record';
    if (!lastIn) return 'Incomplete record';
    return 'Present';
  }
  if (leave) return 'Approved leave';
  if (!windows.length) return 'Not required';
  if (now < begins) return 'Not started';
  if (now <= ends) return 'Awaiting clock-in';
  return 'Absent';
}

export function bankPaymentIssues(entries, bank) {
  if (!['snb', 'aljazira'].includes(bank)) return [{ staffId: null, fields: ['Bank template unavailable'] }];
  return entries.flatMap(entry => {
    const payment = entry.payment ?? {}, fields = [];
    const account = String(payment.account ?? '').replace(/\s/g, '').toUpperCase();
    if (!/^(?:SA\d{22}|\d{10,24})$/.test(account)) fields.push('Account / IBAN');
    if (!/^\d{10}$/.test(payment.identity ?? '')) fields.push('ID / Iqama');
    if (!/^[A-Z0-9]{4}$/.test(payment.bankCode ?? '')) fields.push('Bank code');
    if (!entry.nameEn?.trim()) fields.push('English name');
    if (bank === 'snb' && !payment.address?.trim()) fields.push('Employee address');
    return fields.length ? [{ staffId: entry.staffId, name: entry.name, nameEn: entry.nameEn, fields }] : [];
  });
}

export function scheduleWeekPlan(workspace, staffIds, start, { copy = false, periodIds = [], restDay = false } = {}) {
  const shiftDay = (day, amount) => new Date(Date.parse(day + 'T00:00:00Z') + amount * 86400000).toISOString().slice(0, 10);
  return staffIds.flatMap(staffId => {
    const person = workspace.staff.find(item => item.id === staffId);
    if (!person) return [];
    return Array.from({ length: 7 }, (_, index) => {
      const date = shiftDay(start, index), source = shiftDay(date, -7);
      return { staffId, date, periodIds: copy ? effectivePeriodIds(workspace, person, source) : restDay ? [] : periodIds,
        restDay: copy ? isScheduleRestDay(workspace, person, source) : restDay };
    });
  });
}
