import {monthlyEmployeeSummary} from './monthly-employee-mail.mjs';
import {attendanceReportEmail} from './public/attendance-report-email.js';
const dayMs=86400000;
const localDay=now=>new Date(now+10800000).toISOString().slice(0,10);
const shift=(date,n)=>new Date(Date.parse(date)+n*dayMs).toISOString().slice(0,10);
export function dueAttendancePeriods(now,settings){
  if(!settings?.enabled)return [];
  const today=localDay(now),time=new Date(now+10800000),weekday=time.getUTCDay(),hour=time.getUTCHours();
  // Keep a bounded catch-up window; never backfill historical periods on activation.
  const thursday=shift(today,-((weekday+3)%7));
  const weeklyDue=Date.parse(thursday+'T22:00:00+03:00');
  const month=today.slice(0,7),last=new Date(Date.UTC(time.getUTCFullYear(),time.getUTCMonth()+1,0)).toISOString().slice(0,10);
  const previousLast=shift(month+'-01',-1);
  const monthlyEnd=today===last&&hour>=22?last:previousLast;
  const result=[];
  if(settings.frequency==='both'&&now>=weeklyDue&&now-weeklyDue<7*dayMs)result.push({id:'weekly:'+thursday,kind:'weekly',first:shift(thursday,-6),last:thursday});
  const monthlyDue=Date.parse(monthlyEnd+'T22:00:00+03:00');
  if(now>=monthlyDue&&now-monthlyDue<7*dayMs)result.push({id:'monthly:'+monthlyEnd.slice(0,7),kind:'monthly',first:monthlyEnd.slice(0,7)+'-01',last:monthlyEnd});
  return result.filter(period=>!settings.startsOn||period.last>=settings.startsOn);
}
export function attendanceSummaryMessage(workspace,person,period,now){
  return attendanceReportEmail(workspace,person,period,monthlyEmployeeSummary(workspace,person,period.first.slice(0,7),now,period));
}
export function claimAttendanceSummaryMessages(partners,now,limit=5){
  const jobs=[];let changed=false;
  for(const company of partners){
    if(company.suspended||!company.account?.passwordHash||!company.workspace)continue;
    const workspace=company.workspace;
    for(const person of workspace.staff??[]){
      if(person.status!=='Active'||!person.account||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email??''))continue;
      const settings=workspace.branchAttendanceReportSettings?.[person.branchId]??workspace.attendanceReportSettings;
      if(!settings?.enabled)continue;
      const queue=person.account.attendanceSummaryReports??=[];
      for(const period of dueAttendancePeriods(now,settings)){
        if(person.joinDate>period.last||queue.some(job=>job.id===period.id))continue;
        queue.push({id:period.id,...attendanceSummaryMessage(workspace,person,period,now),status:'pending',attempts:0,nextAttemptAt:0});changed=true;
      }
      for(const job of queue){
        if(settings.frequency==='monthly'&&job.id.startsWith('weekly:')&&job.status==='pending'){job.status='cancelled';changed=true;}
        if(job.status==='sending'&&job.leaseUntil<now){job.status='uncertain';changed=true;}
        if(jobs.length>=limit||job.status!=='pending'||job.nextAttemptAt>now)continue;
        job.status='sending';job.attempts++;job.leaseUntil=now+600000;job.to=person.email;changed=true;
        jobs.push({...job,companyId:company.id,staffId:person.id,summaryReport:true});
      }
    }
  }
  return {jobs,changed};
}
export function finishAttendanceSummaryMessage(partners,job,outcome,now){
  const person=partners.find(c=>c.id===job.companyId)?.workspace?.staff?.find(p=>p.id===job.staffId);
  const saved=person?.account?.attendanceSummaryReports?.find(r=>r.id===job.id);
  if(!saved||saved.status!=='sending'||saved.attempts!==job.attempts)return false;
  saved.status=outcome.sent?'sent':outcome.uncertain?'uncertain':'pending';
  if(outcome.sent){saved.sentAt=now;saved.messageId=outcome.messageId;delete saved.html;delete saved.text;}
  else{saved.lastError=outcome.error;saved.nextAttemptAt=now+21600000;}
  delete saved.leaseUntil;return true;
}
