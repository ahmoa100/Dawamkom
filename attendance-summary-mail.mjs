import {monthlyEmployeeSummary} from './monthly-employee-mail.mjs';
import ar from './public/ar.js';
const dayMs=86400000;
const localDay=now=>new Date(now+10800000).toISOString().slice(0,10);
const shift=(date,n)=>new Date(Date.parse(date)+n*dayMs).toISOString().slice(0,10);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
  const summary=monthlyEmployeeSummary(workspace,person,period.first.slice(0,7),now,period);
  const duration=value=>Math.floor(value/60)+' ساعة و'+value%60+' دقيقة';
  const rows=[['أيام الحضور',summary.workedDays+summary.incompleteDates.length],['ساعات العمل المسجلة',duration(summary.workedMinutes)],['الساعات المطلوبة',duration(summary.requiredMinutes)],['دقائق التأخير',summary.lateMinutes+summary.excusedLateMinutes],['دقائق الخروج المبكر',summary.earlyMinutes+summary.excusedEarlyMinutes],['أيام الغياب',summary.absentDates.length],['السجلات غير المكتملة حتى وقت الإرسال',summary.incompleteDates.length],['أيام الإجازات المعتمدة',summary.leaveDates.length]];
  const title='تقرير ملخص الدوام '+(period.kind==='weekly'?'الأسبوعي':'الشهري'),name=person.nameAr||person.name||person.nameEn;
  const requestText=summary.requests.map(r=>[ar[r.type]??r.type,r.date,ar[r.status]??r.status].join(' | '));
  const body=rows.map(([label,value])=>'<tr><td align="right" style="padding:12px;border-bottom:1px solid #dce5de">'+esc(label)+'</td><td align="left" style="padding:12px;border-bottom:1px solid #dce5de;font-weight:bold">'+esc(value)+'</td></tr>').join('');
  const requests=summary.requests.map(r=>'<tr><td align="right" style="padding:12px">'+esc(ar[r.type]??r.type)+'</td><td align="right">'+esc(r.date)+'</td><td align="right">'+esc(ar[r.status]??r.status)+'</td></tr>').join('');
  const html='<html dir="rtl" lang="ar"><body dir="rtl" style="background:#eef2ee;font-family:Tahoma,Arial;color:#193f40;padding:20px"><table dir="rtl" width="100%" style="max-width:600px;margin:auto;background:#fff;border-radius:18px;overflow:hidden;border-spacing:0"><tr><td align="right" style="padding:26px;background:#1b4043;color:white"><img src="https://www.dawamkom.net/app-icon-192.png" alt="دوامكم" width="52" style="float:left;border-radius:12px"><h2>'+title+'</h2><p>'+period.first+' — '+period.last+'</p></td></tr><tr><td align="right" style="padding:24px"><h3>حياك الله، '+esc(name)+' 🌿</h3><p>'+esc(workspace.company)+'</p><table dir="rtl" width="100%" style="border-spacing:0">'+body+'</table><h3>طلباتك خلال الفترة</h3>'+(requests?'<table dir="rtl" width="100%"><tr><th align="right">الطلب</th><th align="right">التاريخ</th><th align="right">الحالة</th></tr>'+requests+'</table>':'<p>لا يوجد</p>')+'<p style="font-size:12px;line-height:1.8">هذا الملخص حتى الساعة 10 مساءً بتوقيت السعودية. السجلات المفتوحة والطلبات اللاحقة قد تغير النتائج. السجل الناقص لا يُعد غيابًا تلقائيًا.</p></td></tr></table></body></html>';
  return {to:person.email,subject:title+' | '+workspace.company,text:[title,name,period.first+' — '+period.last,...rows.map(r=>r.join(': ')),...requestText].join('\n'),html};
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
