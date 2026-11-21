import {effectivePeriodIds, periodBounds, isFlexiblePeriod} from './public/work-schedule.js';
import {effectiveNotificationPreferences,effectiveNotificationSettings} from './public/notification-preferences.js';

const minute = 60000;
const defaults = {
  beforeStart: {enabled: true, minutes: 5}, beforeDeduction: {enabled: false, minutes: 5},
  beforeEnd: {enabled: true, minutes: 5}, afterEnd: {enabled: true, minutes: 5},
};
export function attendanceReminders(workspace, now = Date.now()) {
  const today = new Date(now + 3 * 3600000).toISOString().slice(0, 10);
  const days = [-1, 0, 1].map(offset => new Date(Date.parse(today) + offset * 86400000).toISOString().slice(0, 10));
  const events = [];
  for (const person of workspace.staff ?? []) {
    if (person.status !== 'Active' || !person.account) continue;
    if (!effectiveNotificationPreferences(workspace,person.branchId).attendance) continue;
    const notificationSettings=effectiveNotificationSettings(workspace,person.branchId);
    for (const day of days) {
      if (person.joinDate && day < person.joinDate) continue;
      if ((workspace.requests ?? []).some(request => request.staffId === person.id && request.status === 'Approved' &&
        (workspace.leaveTypes ?? []).includes(request.type) && request.date <= day && (request.end ?? request.date) >= day)) continue;
      for (const periodId of effectivePeriodIds(workspace, person, day)) {
        const period = (workspace.workPeriods ?? []).find(period => period.id === periodId);
        if (!period) continue;
        const {start, end} = periodBounds(period, day);
        const punches = (workspace.punches ?? []).filter(punch => punch.staffId === person.id &&
          (punch.shiftStart != null ? punch.shiftStart === start :
            Date.parse(punch.time) >= start - (period.arrival?.before ?? 60) * minute &&
            Date.parse(punch.time) <= end + (period.departure?.after ?? 60) * minute));
        const hasIn = punches.some(punch => punch.kind === 'in');
        const last = [...punches].sort((a,b) => Date.parse(a.time) - Date.parse(b.time)).at(-1);
        const hasOut = last?.kind === 'out';
        for (const [key, fallback] of Object.entries(defaults)) {
          const rule = notificationSettings.attendance?.[key] ?? fallback;
          if (!rule.enabled || !Number.isInteger(rule.minutes) || rule.minutes < 0 || rule.minutes > 1440) continue;
          const arrival = key === 'beforeStart' || key === 'beforeDeduction';
          if (arrival ? hasIn : hasOut) continue;
          const before = key === 'beforeStart' || key === 'beforeEnd';
          const boundary = arrival ? start : end;
          const due = boundary + (before ? -1 : 1) * rule.minutes * minute;
          // Do not flood employees with stale reminders after downtime, or send a countdown after its boundary.
          if (now < due || now >= due + 90000 || (before && rule.minutes > 0 && now >= boundary)) continue;
          const id = `${day}:${periodId}:${key}:${rule.minutes}`;
          if (person.account.attendanceReminderHistory?.some(event => event.id === id)) continue;
          const minutes = Math.max(0, Math.ceil((boundary - now) / minute));
          events.push({staffId: person.id, id, date: day, createdAt: now, kind: key,
            bodyAr: before ? (arrival ? `دوامك يبدأ خلال ${minutes} دقيقة` : `دوامك ينتهي خلال ${minutes} دقيقة`) :
              (arrival ? 'لم تقم بتسجيل بصمة دخول' : 'لم تقم بتسجيل بصمة خروج'),
            bodyEn: before ? (arrival ? `Your shift starts in ${minutes} minutes` : `Your shift ends in ${minutes} minutes`) :
              (arrival ? 'You have not clocked in' : 'You have not clocked out')});
        }
      }
    }
  }
  return events;
}

export function recordAttendanceReminder(person, event, now = Date.now()) {
  const account = person.account;
  account.attendanceReminderHistory = [...(account.attendanceReminderHistory ?? []).filter(item =>
    item.createdAt >= now - 7 * 86400000), event].slice(-160);
}

// Inbox visibility is derived from current scheduling; delivery history remains intact for deduplication.
export function visibleAttendanceReminders(workspace, person, now = Date.now()) {
 if(person.status!=='Active'||!effectiveNotificationPreferences(workspace,person.branchId).attendance)return [];
 return (person.account?.attendanceReminderHistory??[]).flatMap(event=>{
  const parts=String(event.id??'').split(':'),date=event.date??parts[0],kind=event.kind??parts.at(-2),periodId=event.periodId??parts.slice(1,-2).join(':');
  if(!['beforeStart','beforeDeduction','beforeEnd','afterEnd'].includes(kind)||!/^\d{4}-\d{2}-\d{2}$/.test(date))return [];
  if(!effectivePeriodIds(workspace,person,date).includes(periodId))return [];
  if((workspace.requests??[]).some(r=>r.staffId===person.id&&r.status==='Approved'&&(workspace.leaveTypes??[]).includes(r.type)&&r.date<=date&&(r.end??r.date)>=date))return [];
  const period=(workspace.workPeriods??[]).find(p=>p.id===periodId);if(!period)return [];
  const {start,end}=periodBounds(period,date),arrival=kind==='beforeStart'||kind==='beforeDeduction',flexible=isFlexiblePeriod(period);
  const expiresAt=flexible?end:arrival?start+(period.arrival?.after??60)*minute:end+(period.departure?.after??60)*minute;
  if(!Number.isFinite(expiresAt)||now>=expiresAt)return [];
  const punches=(workspace.punches??[]).filter(p=>p.staffId===person.id&&(p.shiftStart!=null?p.shiftStart===start:Date.parse(p.time)>=start-(period.arrival?.before??60)*minute&&Date.parse(p.time)<=end+(period.departure?.after??60)*minute));
  if(punches.some(p=>p.kind===(arrival?'in':'out')))return [];
  return [{...event,expiresAt}];
 }).slice(-30);
}
