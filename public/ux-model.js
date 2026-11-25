import {followUpItems} from './follow-up.js';
import {hasEnglishPayrollName} from './payroll-model.js';
import {managesBranch,needsDirectManager} from './branch-roles.js';
import {hasRolePermission} from './role-permissions.js';
import {officialHolidaysOn} from './official-holidays.js';
import {displayLeaveType} from './request-settings.js';
import { effectivePeriodIds, periodBounds, isScheduleRestDay, isDefaultRestDay, isFlexiblePeriod } from './work-schedule.js';

export const normalizeSearch = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase()
  .replace(/[\u064b-\u065f\u0670\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim();

export function approvedAttendanceLeaves(workspace, person) {
  const current=(workspace.requests??[]).filter(request=>request.staffId===person.id &&
    request.status==='Approved' && (workspace.leaveTypes??[]).includes(request.type));
  const historical=(person.historicalLeave??[]).filter(item=>item.source==='jisr');
  return [...current,...historical];
}
export function approvedLeaveTypesOn(workspace, staffId, day) {
  const person=workspace.staff?.find(item=>item.id===staffId)??{id:staffId};
  return [...new Set(approvedAttendanceLeaves(workspace,person).filter(request=>
    request.date<=day && (request.end??request.date)>=day).map(request=>displayLeaveType(request.type)))];
}

const attendanceStatusOrder = new Map(['Present', 'Working', 'Incomplete record', 'Absent',
  'Awaiting clock-in', 'Not started', 'Approved leave', 'Not required'].map((status, index) => [status, index]));

export function compareAttendanceRows(a, b, sort) {
  if (sort === 'status') return (attendanceStatusOrder.get(a.status) ?? attendanceStatusOrder.size) -
    (attendanceStatusOrder.get(b.status) ?? attendanceStatusOrder.size);
  if (sort !== 'schedule') return 0;
  if (!a.scheduled.length || !b.scheduled.length) return Number(!a.scheduled.length) - Number(!b.scheduled.length);
  for (let index = 0; index < Math.min(a.scheduled.length, b.scheduled.length); index++) {
    const first = a.scheduled[index], second = b.scheduled[index];
    const difference = (first.start || '24:00').localeCompare(second.start || '24:00') ||
      (first.end || '24:00').localeCompare(second.end || '24:00') || first.id.localeCompare(second.id);
    if (difference) return difference;
  }
  return a.scheduled.length - b.scheduled.length;
}

// A displayed absence is final only when every scheduled attendance window is over.
export function attendanceState(workspace, person, day, now = Date.now()) {
  const periods = new Map((workspace.workPeriods ?? []).map(period => [period.id, period]));
  const shifts = effectivePeriodIds(workspace, person, day).map(id => periods.get(id)).filter(Boolean);
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
  const holidays=officialHolidaysOn(workspace,person,day);
  if(holidays.length)return holidays.map(h=>h.name).join(' / ');
  if (approvedLeaveTypesOn(workspace, person.id, day).length) return 'Approved leave';
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
    if (!hasEnglishPayrollName(entry.nameEn)) fields.push('English name');
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

// All input is already server-scoped; enforce branch membership again for dashboard drill-downs.
export function homeReviewGroups(workspace,{viewer=null,owner=false,requestContext=null,now=Date.now()}={}) {
 const group=(id,ar,en,priority)=>({id,ar,en,priority,items:[]});
 const groups=[group('manager','بدون مدير مباشر','Without direct manager',6),group('schedule','بدون جدول دوام','Without work schedule',5),group('requests','طلبات تنتظر موافقتك','Awaiting your approval',2),group('punches','بصمات تحتاج تصحيح','Punches needing correction',3),group('activation','حسابات بانتظار التفعيل','Awaiting activation',7),group('staff','بيانات موظفين ناقصة','Missing employee information',4),group('documents','مستندات تحتاج تجديدًا','Documents requiring renewal',1),group('overdue','مهام متأخرة','Overdue tasks',0)];
 if(!owner&&!viewer)return groups;
 const today=workspace.today??new Date(now+10800000).toISOString().slice(0,10),shift=(d,n)=>new Date(Date.parse(d)+n*86400000).toISOString().slice(0,10);
 const people=(workspace.staff??[]).filter(p=>['Active','Pending activation','Invitation draft'].includes(p.status)&&(owner||managesBranch(viewer,p.branchId))),allowed=new Set(people.map(p=>p.id)),byId=new Map(people.map(p=>[p.id,p]));
 const punchIndex=new Map();for(const punch of workspace.punches??[]){if(!punchIndex.has(punch.staffId))punchIndex.set(punch.staffId,[]);punchIndex.get(punch.staffId).push(punch);}
 const add=(id,item)=>groups.find(g=>g.id===id).items.push(item),profile=p=>'#staff/'+encodeURIComponent(p.id)+'/personal';
 for(const person of people){
  const staffPunches=punchIndex.get(person.id)??[];
  const base={id:person.id,staffId:person.id,name:person.nameAr||person.name,nameEn:person.nameEn,href:profile(person)};
  if(person.status==='Pending activation')add('activation',{...base,status:person.status});
  if(person.status!=='Active')continue;
  if(needsDirectManager(workspace,person))add('manager',base);
  const days=Array.from({length:7},(_,i)=>shift(today,i)).filter(day=>(!person.joinDate||day>=person.joinDate)&&!isDefaultRestDay(workspace,person,new Date(day).getUTCDay())&&!officialHolidaysOn(workspace,person,day).length&&!(workspace.workAssignments??[]).some(a=>a.staffId===person.id&&a.date===day&&a.restDay===true)&&!(workspace.requests??[]).some(r=>r.staffId===person.id&&r.status==='Approved'&&(workspace.leaveTypes??[]).includes(r.type)&&r.date<=day&&(r.end??r.date)>=day));
  if(days.length&&!days.some(day=>effectivePeriodIds(workspace,person,day).some(id=>(workspace.workPeriods??[]).some(p=>p.id===id))))add('schedule',{...base,href:'#staff/'+encodeURIComponent(person.id)+'/overview',first:today,last:shift(today,6)});
  const dates=[...new Set(staffPunches.map(p=>p.shiftStart!=null?new Date(p.shiftStart+10800000).toISOString().slice(0,10):p.date))].filter(d=>d>=shift(today,-29)&&d<=today);
  for(const day of dates){
   if(officialHolidaysOn(workspace,person,day).length||(workspace.requests??[]).some(r=>r.staffId===person.id&&r.status==='Approved'&&(workspace.leaveTypes??[]).includes(r.type)&&r.date<=day&&(r.end??r.date)>=day))continue;
   const periods=effectivePeriodIds(workspace,person,day).map(id=>(workspace.workPeriods??[]).find(p=>p.id===id)).filter(Boolean);
   if(periods.some(period=>{const {start,end}=periodBounds(period,day),expiry=isFlexiblePeriod(period)?end:end+(period.departure?.after??60)*60000;if(now<=expiry)return false;const records=staffPunches.filter(p=>(p.shiftStart!=null?p.shiftStart===start:Date.parse(p.time)>=start-(period.arrival?.before??60)*60000&&Date.parse(p.time)<=end+(period.departure?.after??60)*60000));return records.some(p=>p.kind==='in')!==records.some(p=>p.kind==='out');}))add('punches',{...base,id:person.id+':'+day,date:day,href:'#attendance'});
  }
 }
 const follows=followUpItems(workspace,today,owner?null:viewer).filter(i=>i.status!=='completed');
 for(const item of follows){
  if(item.kind==='staff'&&allowed.has(item.staffId))add('staff',{...item,href:'#staff/'+encodeURIComponent(item.staffId)+'/personal'});
  if(['document','residence','work-permit'].includes(item.kind)&&item.expiresOn&&(item.kind==='document'||allowed.has(item.staffId)))add('documents',{...item,href:'#followup'});
  if(item.overdue)add('overdue',{...item,href:'#followup'});
 }
 if(owner||hasRolePermission(workspace,viewer,'requests')){
  for(const r of requestContext?.requests??[])if(r.status==='Pending'&&allowed.has(r.staffId)&&(owner||!r.approvalSteps||(r.approverIds??[r.approverId]).includes(viewer.id)))add('requests',{...r,name:byId.get(r.staffId)?.nameAr||byId.get(r.staffId)?.name,nameEn:byId.get(r.staffId)?.nameEn,href:'#requests'});
  for(const r of requestContext?.deviceRequests??[])if(allowed.has(r.staffId))add('requests',{...r,id:r.requestId,type:'Browser change',href:'#requests'});
 }
 return groups.sort((a,b)=>a.priority-b.priority);
}
