import {effectivePeriodIds, isFlexiblePeriod, periodBounds} from './public/work-schedule.js';
import {annualLeaveBalance, annualLeaveRequired} from './public/leave-balance.js';
import ar from './public/ar.js';

const dayMs = 86400000, minuteMs = 60000;
const localDay = now => new Date(now + 10800000).toISOString().slice(0,10);
const label = value => ar[value] ?? value ?? '—';
const requestState = (request, now) => request.status === 'Pending' && now -
  Date.parse(request.approvalStepStartedAt ?? request.submittedAt ?? (request.submittedOn ? request.submittedOn+'T00:00:00+03:00' : '')) >= 3*dayMs ? 'Cancelled' : request.status;
export function previousReportMonth(now) {
  const date = new Date(localDay(now)+'T00:00:00Z');
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth()-1);
  return date.toISOString().slice(0,7);
}
function bounds(month) {
  const first = month+'-01';
  const next = new Date(first+'T00:00:00Z'); next.setUTCMonth(next.getUTCMonth()+1);
  return {first,last:new Date(next-dayMs).toISOString().slice(0,10),next:next.toISOString().slice(0,10)};
}

// Uses the same shift matching, pairing and excuse rules as the attendance report.
// A wholly absent day is kept separate from a partly recorded day.
export function monthlyEmployeeSummary(workspace, person, month, now=Date.now()) {
  const {first,last}=bounds(month);
  const periods=new Map((workspace.workPeriods??[]).map(period=>[period.id,period]));
  const punches=(workspace.punches??[]).filter(p=>p.staffId===person.id)
    .map(p=>({...p,timestamp:Date.parse(p.time)})).sort((a,b)=>a.timestamp-b.timestamp);
  const approved=(workspace.requests??[]).filter(r=>r.staffId===person.id && r.status==='Approved');
  const pairs=[]; let arrival;
  for(const punch of punches) {
    if(punch.kind==='in') arrival=punch;
    else if(punch.kind==='out' && arrival) {
      if(punch.timestamp-arrival.timestamp<=dayMs &&
        (arrival.shiftStart==null || punch.shiftStart==null || arrival.shiftStart===punch.shiftStart)) pairs.push([arrival,punch]);
      arrival=undefined;
    }
  }
  const result={requiredMinutes:0,workedMinutes:0,lateMinutes:0,excusedLateMinutes:0,
    earlyMinutes:0,excusedEarlyMinutes:0,absentDates:[],incompleteDates:[],leaveDates:[],workedDays:0};
  let readyAt=Date.parse(bounds(month).next+'T09:00:00+03:00');
  for(let time=Date.parse(first);time<=Date.parse(last);time+=dayMs) {
    const day=new Date(time).toISOString().slice(0,10);
    if(person.joinDate && day<person.joinDate) continue;
    const scheduled=effectivePeriodIds(workspace,person,day).map(id=>periods.get(id)).filter(Boolean)
      .map(period=>({period,...periodBounds(period,day),flexible:isFlexiblePeriod(period)}));
    if(day===last) for(const shift of scheduled) readyAt=Math.max(readyAt,shift.end+(shift.period.departure?.after??60)*minuteMs);
    const starts=new Set(scheduled.map(s=>s.start));
    const daily=punches.filter(p=>p.shiftStart==null ? p.date===day : starts.has(p.shiftStart));
    const dayPairs=pairs.filter(([p])=>p.shiftStart==null ? p.date===day : starts.has(p.shiftStart));
    result.workedMinutes+=dayPairs.reduce((total,[entry,exit])=>total+Math.max(0,Math.min(exit.timestamp,entry.shiftEnd??Infinity)-entry.timestamp)/minuteMs,0);
    const leave=approved.some(r=>(workspace.leaveTypes??[]).includes(r.type) && r.date<=day && (r.end??r.date)>=day);
    if(leave) {result.leaveDates.push(day);continue;}
    let missing=false,complete=0;
    for(const shift of scheduled) {
      const {period,start,end,flexible}=shift;
      result.requiredMinutes+=flexible ? (period.duration??(end-start)/minuteMs) : (end-start)/minuteMs;
      const records=daily.filter(p=>p.shiftStart===start || (p.shiftStart==null &&
        (scheduled.length===1 || (p.kind==='in' ? p.timestamp>=start-(period.arrival?.before??60)*minuteMs && p.timestamp<=start+(period.arrival?.after??60)*minuteMs :
          p.timestamp>=end-(period.departure?.before??60)*minuteMs && p.timestamp<=end+(period.departure?.after??60)*minuteMs))));
      const clockIn=records.find(p=>p.kind==='in'),clockOut=records.findLast(p=>p.kind==='out');
      if(!clockIn || !clockOut || records.at(-1)?.kind==='in') missing=true;
      const worked=dayPairs.filter(([p])=>records.includes(p)).reduce((sum,[entry,exit])=>sum+
        Math.max(0,Math.min(exit.timestamp,end,entry.shiftEnd??Infinity)-Math.max(entry.timestamp,start)),0);
      if(clockIn && clockOut && clockOut.timestamp>=clockIn.timestamp && records.at(-1)?.kind==='out' &&
        (!flexible || !period.duration || worked>=period.duration*minuteMs)) complete++;
      if(flexible) continue;
      const excuse=kind=>approved.some(r=>r.type==='Attendance excuse' && r.date===day && r.excuseType===kind);
      result[excuse('Late arrival')?'excusedLateMinutes':'lateMinutes']+=clockIn?Math.max(0,clockIn.timestamp-start)/minuteMs:0;
      result[excuse('Early departure')?'excusedEarlyMinutes':'earlyMinutes']+=clockOut?Math.max(0,end-clockOut.timestamp)/minuteMs:0;
    }
    const unmatched=daily.length>dayPairs.length*2;
    if(scheduled.length && !daily.length) result.absentDates.push(day);
    else if(missing || unmatched) result.incompleteDates.push(day);
    if(dayPairs.some(([entry,exit])=>exit.timestamp>entry.timestamp) && !unmatched && complete===scheduled.length) result.workedDays++;
  }
  for(const key of ['requiredMinutes','workedMinutes','lateMinutes','excusedLateMinutes','earlyMinutes','excusedEarlyMinutes'])
    result[key]=Math.floor(result[key]);
  const requests=(workspace.requests??[]).filter(r=>r.staffId===person.id).map(r=>({...r,status:requestState(r,now)}));
  const submitted=requests.filter(r=>{
    const day=r.submittedOn ?? (r.submittedAt ? localDay(Date.parse(r.submittedAt)) : r.date);
    return day>=first && day<=last;
  });
  const leave=annualLeaveBalance(person,last,requests,workspace.leavePreferences);
  if(leave?.available!=null) leave.available-=annualLeaveRequired(requests,person.id,last,{});
  return {...result,month,first,last,readyAt,requests:submitted,leave};
}

export function monthlyEmployeeMessage(workspace, person, month, now) {
  const summary=monthlyEmployeeSummary(workspace,person,month,now);
  const duration=minutes=>`${Math.floor(minutes/60)} ساعة و${minutes%60} دقيقة`;
  const list=dates=>dates.length ? dates.join('، ') : 'لا يوجد';
  const statuses=['Approved','Declined','Pending','Cancelled','Expired'];
  const reportUrl=process.env.DAWAMAK_PUBLIC_ORIGIN ? new URL('/company/'+workspace.slug+'/employee#requests',process.env.DAWAMAK_PUBLIC_ORIGIN).href : null;
  return {summary, to:person.email, subject:`تقريرك الشهري — ${month} | ${workspace.company}`,
    text:[`مرحبًا ${person.nameAr||person.name||person.nameEn}،`,
      `تقرير ${workspace.company} من ${summary.first} إلى ${summary.last}.`,
      `ساعات العمل المطلوبة: ${duration(summary.requiredMinutes)}`,
      `ساعات العمل المسجلة: ${duration(summary.workedMinutes)}`,
      `النقص عن الساعات المطلوبة: ${duration(Math.max(0,summary.requiredMinutes-summary.workedMinutes))}`,
      `إجمالي التأخير: ${summary.lateMinutes+summary.excusedLateMinutes} دقيقة`,
      `التأخير دون عذر معتمد: ${summary.lateMinutes} دقيقة`,
      `التأخير بعذر معتمد: ${summary.excusedLateMinutes} دقيقة`,
      `إجمالي الخروج المبكر: ${summary.earlyMinutes+summary.excusedEarlyMinutes} دقيقة`,
      `الخروج المبكر دون عذر معتمد: ${summary.earlyMinutes} دقيقة`,
      `الخروج المبكر بعذر معتمد: ${summary.excusedEarlyMinutes} دقيقة`,
      `أيام الغياب: ${summary.absentDates.length}\nالتواريخ: ${list(summary.absentDates)}`,
      `أيام عدم اكتمال البصمة: ${summary.incompleteDates.length}\nالتواريخ: ${list(summary.incompleteDates)}`,
      `أيام العمل المكتملة: ${summary.workedDays}\nأيام الإجازات المعتمدة خلال الشهر: ${summary.leaveDates.length}`,
      summary.leave ? `رصيد الإجازة السنوية بنهاية الشهر:\nالافتتاحي: ${summary.leave.opening??'غير محدد'} يوم\nالمستحق من السنة الحالية: ${summary.leave.current??'غير محدد'} يوم\nالمتاح للاستخدام: ${summary.leave.available??'غير محدد'} يوم` : '',
      'الطلبات المقدمة خلال الشهر:\n'+statuses.map(status=>`${label(status)}: ${summary.requests.filter(r=>r.status===status).length}`).join(' | '),
      ...summary.requests.map(r=>[`${label(r.type)} | ${r.date} — ${r.end??r.date} | ${label(r.status)}`,
        r.periodName?`الفترة: ${r.periodName}`:'', r.loanAmount?`مبلغ السلفة: ${r.loanAmount} ر.س — السداد: ${r.repaymentInstallments} دفعات`:'',
        r.excuseType?`نوع الاستئذان: ${label(r.excuseType)}`:'',r.proposedIn?`وقت الحضور المقترح: ${r.proposedIn}`:'',
        r.proposedOut?`وقت الانصراف المقترح: ${r.proposedOut}`:'', r.note?`السبب: ${r.note}`:'',r.rejectionNote?`ملاحظات الرفض: ${r.rejectionNote}`:''].filter(Boolean).join('\n')),
      !summary.requests.length?'لا توجد طلبات مقدمة خلال الشهر.':'',
      'يُحتسب الغياب على الأيام المجدولة فقط، ولا يُحتسب يوم الغياب نفسه مرة أخرى ضمن البصمات غير المكتملة. ',
      reportUrl?`لمراجعة طلباتك أو تقديم طلب تصحيح بصمة، افتح حسابك:\n${reportUrl}`:'تواصل مع مديرك لمراجعة السجلات أو تصحيحها.',
    ].filter(Boolean).join('\n\n')};
}

export function claimMonthlyMessages(partners, now, limit=5) {
  const current=localDay(now).slice(0,7),month=previousReportMonth(now),jobs=[];
  let changed=false;
  for(const company of partners) {
    if(company.suspended || !company.account?.passwordHash || !company.workspace) continue;
    if(!company.monthlyReportStartMonth) {company.monthlyReportStartMonth=current;changed=true;}
    for(const person of company.workspace.staff??[]) {
      if(person.status!=='Active' || !person.account || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email??'')) continue;
      const queue=person.account.monthlyReports??=[];
      if(month>=company.monthlyReportStartMonth && (!person.joinDate || person.joinDate<=bounds(month).last) && !queue.some(r=>r.month===month)) {
        const message=monthlyEmployeeMessage({...company.workspace,slug:company.id},person,month,now);
        if(now>=message.summary.readyAt) {queue.push({month,status:'pending',attempts:0,nextAttemptAt:0,
          to:person.email,subject:message.subject,text:message.text,createdAt:now});changed=true;}
      }
      for(const job of queue) {
        // A crash after provider acceptance leaves delivery ambiguous. Do not resend automatically.
        if(job.status==='sending' && job.leaseUntil<now) {job.status='uncertain';changed=true;}
        if(jobs.length>=limit || job.status!=='pending' || job.nextAttemptAt>now) continue;
        job.to=person.email;job.status='sending';job.attempts++;job.leaseUntil=now+10*minuteMs;
        jobs.push({companyId:company.id,staffId:person.id,month:job.month,attempt:job.attempts,
          to:job.to,subject:job.subject,text:job.text});changed=true;
      }
    }
  }
  return {jobs,changed};
}

export function finishMonthlyMessage(partners, job, outcome, now) {
  const person=partners.find(c=>c.id===job.companyId)?.workspace?.staff?.find(p=>p.id===job.staffId);
  const saved=person?.account?.monthlyReports?.find(r=>r.month===job.month);
  if(!saved || saved.status!=='sending' || saved.attempts!==job.attempt) return false;
  saved.status=outcome.sent?'sent':outcome.uncertain?'uncertain':'pending';
  if(outcome.sent) {saved.sentAt=now;saved.messageId=outcome.messageId;delete saved.text;}
  else {saved.lastError=outcome.error;saved.nextAttemptAt=now+6*3600000;}
  delete saved.leaseUntil;
  return true;
}
