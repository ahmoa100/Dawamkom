import test from 'node:test';
import assert from 'node:assert/strict';
import {applyPunchCorrection} from '../public/punch-correction.js';
import {periodBounds} from '../public/work-schedule.js';
import {monthlyEmployeeSummary} from '../monthly-employee-mail.mjs';
const day='2026-10-15',now=Date.parse('2026-10-20T12:00:00+03:00');
function fixture(start='09:00',end='17:00') {
  const person={id:'s',periodIds:['p'],joinDate:day};
  const period={id:'p',start,end};
  return {person,workspace:{workPeriods:[period],workAssignments:[],workSchedule:{days:[0,1,2,3,4,5,6]},punches:[],requests:[]},bounds:periodBounds(period,day)};
}
test('approved correction adds missing punches, fixes totals and retains an audit reference',()=>{
  const {workspace,person}=fixture();
  applyPunchCorrection(workspace,person,{id:'r',date:day,proposedIn:'09:00',proposedOut:'17:00'},now);
  const report=monthlyEmployeeSummary(workspace,person,'2026-10',now);
  assert.equal(report.workedMinutes,480);assert.equal(report.workedDays,1);
  assert.ok(!report.absentDates.includes(day));
  assert.ok(workspace.punches.every(p=>p.correctionRequestId==='r'&&p.correctionHistory[0].previous===null&&!p.site));
});
test('correcting a recorded arrival preserves its original time and device; the untouched exit is retained',()=>{
  const {workspace,person,bounds}=fixture();
  const original={staffId:'s',kind:'in',date:day,time:day+'T10:00:00+03:00',shiftStart:bounds.start,device:'original'};
  const exit={...original,kind:'out',time:day+'T17:00:00+03:00'};
  workspace.punches=[original,exit];
  applyPunchCorrection(workspace,person,{id:'r',date:day,proposedIn:'09:00'},now);
  assert.equal(workspace.punches.length,2);assert.equal(workspace.punches[1],exit);
  assert.equal(workspace.punches[0].correctionHistory[0].previous.time,original.time);
  assert.equal(workspace.punches[0].device,'original');
  assert.equal(monthlyEmployeeSummary(workspace,person,'2026-10',now).lateMinutes,0);
});
test('overnight exit belongs to the next calendar day but to the same scheduled shift',()=>{
  const {workspace,person,bounds}=fixture('22:00','06:00');
  applyPunchCorrection(workspace,person,{id:'r',date:day,proposedIn:'22:00',proposedOut:'06:00'},now);
  assert.equal(workspace.punches[1].date,'2026-10-16');
  assert.equal(workspace.punches[1].shiftStart,bounds.start);
  assert.equal(monthlyEmployeeSummary(workspace,person,'2026-10',now).workedMinutes,480);
});
test('invalid ordering and future times fail atomically without touching attendance',()=>{
  const {workspace,person}=fixture();
  assert.throws(()=>applyPunchCorrection(workspace,person,{id:'r',date:day,proposedIn:'17:00',proposedOut:'09:00'},now),/after/);
  assert.deepEqual(workspace.punches,[]);
  assert.throws(()=>applyPunchCorrection(workspace,person,{id:'r',date:'2026-11-01',proposedIn:'09:00'},now),/future/);
  assert.deepEqual(workspace.punches,[]);
});
test('adding historical corrections does not replace the latest punch used for the current session',()=>{
  const {workspace,person}=fixture();
  const latest={staffId:'s',kind:'in',date:'2026-10-19',time:'2026-10-19T09:00:00+03:00'};
  workspace.punches.push(latest);
  applyPunchCorrection(workspace,person,{id:'r',date:day,proposedIn:'09:00',proposedOut:'17:00'},now);
  assert.equal(workspace.punches.at(-1),latest);
});
