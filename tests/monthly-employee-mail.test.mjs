import test from 'node:test';
import assert from 'node:assert/strict';
import {monthlyEmployeeSummary, monthlyEmployeeMessage, previousReportMonth, claimMonthlyMessages, finishMonthlyMessage} from '../monthly-employee-mail.mjs';

const clock = value => Date.parse(value+'+03:00');
function fixture() {
  const person={id:'staff',nameAr:'موظف تجريبي',email:'staff@example.com',status:'Active',joinDate:'2026-02-01',annualLeaveDays:21,account:{}};
  const shift={id:'p',name:'Morning',start:'09:00',end:'17:00'};
  const workspace={company:'QA',slug:'11111111-1111-4111-8111-111111111111',staff:[person],workSchedule:{days:[]},
    workPeriods:[shift],workAssignments:['02','03','04','05'].map(day=>({staffId:person.id,date:'2026-02-'+day,periodId:'p'})),
    leaveTypes:['Annual leave'],requests:[{id:'leave',staffId:'staff',type:'Annual leave',date:'2026-02-05',end:'2026-02-05',status:'Approved',submittedOn:'2026-02-01'},
      {id:'excuse',staffId:'staff',type:'Attendance excuse',excuseType:'Late arrival',date:'2026-02-02',status:'Approved',submittedOn:'2026-02-02'},
      {id:'other',staffId:'someone-else',type:'Loan request',note:'OTHER EMPLOYEE PRIVATE DATA',status:'Approved',date:'2026-02-01',submittedOn:'2026-02-01'}],
    punches:[{staffId:'staff',kind:'in',time:'2026-02-02T09:15:00+03:00',date:'2026-02-02'},
      {staffId:'staff',kind:'out',time:'2026-02-02T16:30:00+03:00',date:'2026-02-02'},
      {staffId:'staff',kind:'in',time:'2026-02-04T09:00:00+03:00',date:'2026-02-04'}]};
  return {person,workspace,company:{id:workspace.slug,account:{passwordHash:'test'},monthlyReportStartMonth:'2026-02',workspace}};
}
test('monthly email separates absence, incomplete records, approved excuses, leave and rest days',()=>{
  const {person,workspace}=fixture();
  const summary=monthlyEmployeeSummary(workspace,person,'2026-02',clock('2026-03-01T10:00:00'));
  assert.deepEqual(summary.absentDates,['2026-02-03']);
  assert.deepEqual(summary.incompleteDates,['2026-02-04']);
  assert.deepEqual(summary.leaveDates,['2026-02-05']);
  assert.equal(summary.excusedLateMinutes,15);assert.equal(summary.lateMinutes,0);
  assert.equal(summary.earlyMinutes,30);assert.equal(summary.workedMinutes,435);
  assert.equal(summary.requiredMinutes,3*480);assert.equal(summary.workedDays,1);
  const message=monthlyEmployeeMessage(workspace,person,'2026-02',clock('2026-03-01T10:00:00'));
  assert.equal(message.to,'staff@example.com');assert.equal(message.text.includes('OTHER EMPLOYEE PRIVATE DATA'),false);
  assert.equal(summary.requests.length,2);
});
test('overnight month-end punches are included and report waits until the final shift closes',()=>{
  const {person,workspace}=fixture();
  workspace.workPeriods=[{id:'night',start:'23:00',end:'22:00',kind:'flexible',duration:120}];
  workspace.workAssignments=[{staffId:'staff',date:'2026-02-28',periodId:'night'}];
  const start=clock('2026-02-28T23:00:00'),end=clock('2026-03-01T22:00:00');
  workspace.punches=[{staffId:'staff',date:'2026-02-28',time:new Date(start).toISOString(),kind:'in',shiftStart:start,shiftEnd:end},
    {staffId:'staff',date:'2026-03-01',time:new Date(start+2*3600000).toISOString(),kind:'out',shiftStart:start,shiftEnd:end}];
  const summary=monthlyEmployeeSummary(workspace,person,'2026-02',clock('2026-03-01T23:00:00'));
  assert.equal(summary.requiredMinutes,120);assert.equal(summary.workedMinutes,120);
  assert.equal(summary.readyAt,clock('2026-03-01T23:00:00'));
  assert.deepEqual(summary.absentDates,[]);assert.deepEqual(summary.incompleteDates,[]);
});
test('rollout does not backfill old months; first next-month report is claimed only once',()=>{
  const {company}=fixture();delete company.monthlyReportStartMonth;
  const companies=[company];
  assert.equal(claimMonthlyMessages(companies,clock('2026-02-18T10:00:00')).jobs.length,0);
  assert.equal(company.monthlyReportStartMonth,'2026-02');
  assert.equal(claimMonthlyMessages(companies,clock('2026-03-01T08:59:00')).jobs.length,0);
  const result=claimMonthlyMessages(companies,clock('2026-03-01T09:00:00'));
  assert.equal(result.jobs.length,1);
  assert.equal(claimMonthlyMessages(companies,clock('2026-03-01T09:01:00')).jobs.length,0);
  assert.equal(finishMonthlyMessage(companies,result.jobs[0],{sent:true,messageId:'provider-id'},clock('2026-03-01T09:02:00')),true);
  assert.equal(claimMonthlyMessages(companies,clock('2026-03-02T09:00:00')).jobs.length,0);
  assert.equal(company.workspace.staff[0].account.monthlyReports[0].text,undefined);
});
test('definitive delivery failure retries later, while ambiguous delivery never auto-duplicates',()=>{
  const {company}=fixture(),companies=[company],now=clock('2026-03-01T09:00:00');
  const job=claimMonthlyMessages(companies,now).jobs[0];
  finishMonthlyMessage(companies,job,{sent:false,error:'AccessDeniedException'},now);
  assert.equal(claimMonthlyMessages(companies,now+60000).jobs.length,0);
  const retry=claimMonthlyMessages(companies,now+6*3600000).jobs[0];assert.equal(retry.attempt,2);
  finishMonthlyMessage(companies,retry,{sent:false,uncertain:true,error:'TimeoutError'},now+6*3600000);
  assert.equal(claimMonthlyMessages(companies,now+7*3600000).jobs.length,0);
  assert.equal(company.workspace.staff[0].account.monthlyReports[0].status,'uncertain');
});
test('no provider keeps reports pending; suspended companies, unactivated staff and future joins are excluded',()=>{
  const {company}=fixture(),now=clock('2026-03-01T09:00:00');
  assert.equal(claimMonthlyMessages([company],now,0).jobs.length,0);
  assert.equal(company.workspace.staff[0].account.monthlyReports[0].status,'pending');
  company.suspended=true;assert.equal(claimMonthlyMessages([company],now).jobs.length,0);
  const other=fixture().company;other.workspace.staff[0].status='Pending activation';
  assert.equal(claimMonthlyMessages([other],now).jobs.length,0);
  other.workspace.staff[0].status='Active';other.workspace.staff[0].joinDate='2026-03-01';
  assert.equal(claimMonthlyMessages([other],now).jobs.length,0);
  assert.equal(previousReportMonth(clock('2027-01-01T00:01:00')),'2026-12');
});
