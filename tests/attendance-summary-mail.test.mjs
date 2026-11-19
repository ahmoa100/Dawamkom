import test from 'node:test';
import assert from 'node:assert/strict';
import {dueAttendancePeriods,claimAttendanceSummaryMessages,finishAttendanceSummaryMessage} from '../attendance-summary-mail.mjs';
const clock=s=>Date.parse(s+'+03:00');
test('summary periods use Thursday 22:00 and month-end in Riyadh, include seven days and never backfill activation',()=>{
 const settings={enabled:true,frequency:'both',startsOn:'2026-11-19'};
 assert.deepEqual(dueAttendancePeriods(clock('2026-11-19T21:59:00'),settings),[]);
 const periods=dueAttendancePeriods(clock('2026-11-19T22:00:00'),settings);
 assert.deepEqual(periods,[{id:'weekly:2026-11-19',kind:'weekly',first:'2026-11-13',last:'2026-11-19'}]);
 assert.equal(dueAttendancePeriods(clock('2026-11-30T22:00:00'),{...settings,frequency:'monthly'})[0].id,'monthly:2026-11');
 assert.deepEqual(dueAttendancePeriods(clock('2026-11-30T21:59:00'),{...settings,frequency:'monthly'}),[]);
 assert.deepEqual(dueAttendancePeriods(clock('2026-12-01T22:00:00'),{...settings,frequency:'monthly',startsOn:'2026-12-01'}),[]);
});
test('branch frequencies govern individual delivery, receipts are idempotent and other staff requests stay private',()=>{
 const now=clock('2026-11-19T22:00:00'),staff=['a','b'].map(id=>({id,name:id,email:id+'@example.com',branchId:id,status:'Active',account:{}}));
 const workspace={company:'QA',staff,workSchedule:{days:[]},workAssignments:[],workPeriods:[],punches:[],requests:[{staffId:'b',type:'Loan request',date:'2026-11-19',submittedOn:'2026-11-19',note:'PRIVATE B',status:'Pending'}],attendanceReportSettings:{enabled:true,frequency:'both',startsOn:'2026-11-19'},branchAttendanceReportSettings:{b:{enabled:true,frequency:'monthly',startsOn:'2026-11-19'}}};
 const companies=[{id:'c',workspace,account:{passwordHash:'yes'}}];
 const job=claimAttendanceSummaryMessages(companies,now).jobs[0];assert.equal(job.staffId,'a');assert.equal(job.html.includes('PRIVATE B'),false);assert.match(job.html,/align="right"/);
 assert.equal(claimAttendanceSummaryMessages(companies,now).jobs.length,0);
 assert.equal(finishAttendanceSummaryMessage(companies,job,{sent:true,messageId:'id'},now),true);
 assert.equal(claimAttendanceSummaryMessages(companies,now+60000).jobs.length,0);
 assert.equal(staff[0].account.attendanceSummaryReports[0].html,undefined);
});

test('release includes every root JavaScript module copied into the container',async()=>{
 const fs=await import('node:fs'),path=await import('node:path');
 const root=path.resolve(import.meta.dirname,'..'),docker=fs.readFileSync(path.join(root,'Dockerfile'),'utf8'),ignored=fs.readFileSync(path.join(root,'.dockerignore'),'utf8').split(/\r?\n/);
 const files=docker.split(/\r?\n/).find(line=>line.startsWith('COPY')&&line.includes('server.mjs')).split(/\s+/).filter(value=>value.endsWith('.mjs'));
 for(const file of files){assert.equal(fs.existsSync(path.join(root,file)),true,file);assert.ok(ignored.includes('!'+file),file+' excluded from build context');}
});
