import test from 'node:test';
import assert from 'node:assert/strict';
import { attendanceState, normalizeSearch, bankPaymentIssues, scheduleWeekPlan } from '../public/ux-model.js';
const person = { id: 'a', periodIds: ['shift'] };
const workspace = { staff: [person], workSchedule: { days: [0,1,2,3,4,5,6] }, workPeriods: [
  { id: 'shift', start: '09:00', end: '17:00', departure: { after: 30 } },
], punches: [], requests: [], leaveTypes: ['Annual leave'] };
const at = clock => Date.parse('2026-11-19T' + clock + ':00+03:00');
test('attendance distinguishes future, waiting, final absence and approved leave', () => {
  assert.equal(attendanceState(workspace, person, '2026-11-19', at('08:59')), 'Not started');
  assert.equal(attendanceState(workspace, person, '2026-11-19', at('09:00')), 'Awaiting clock-in');
  assert.equal(attendanceState(workspace, person, '2026-11-19', at('17:30')), 'Awaiting clock-in');
  assert.equal(attendanceState(workspace, person, '2026-11-19', at('17:31')), 'Absent');
  assert.equal(attendanceState({...workspace,requests:[{staffId:'a',type:'Annual leave',status:'Approved',date:'2026-11-19',end:'2026-11-20'}]},person,'2026-11-19',at('18:00')), 'Approved leave');
});
test('open records and overnight shifts remain in progress until their window ends', () => {
  const night = {...workspace,workPeriods:[{id:'shift',start:'22:00',end:'06:00'}],punches:[{staffId:'a',date:'2026-11-19',kind:'in',time:'2026-11-19T22:00:00+03:00'}]};
  assert.equal(attendanceState(night,person,'2026-11-19',Date.parse('2026-11-20T03:00:00+03:00')),'Working');
  assert.equal(attendanceState(night,person,'2026-11-19',Date.parse('2026-11-20T07:00:00+03:00')),'Incomplete record');
  night.punches.push({staffId:'a',date:'2026-11-20',kind:'out',time:'2026-11-20T06:00:00+03:00'});
  assert.equal(attendanceState(night,person,'2026-11-19',Date.parse('2026-11-20T07:00:00+03:00')),'Present');
});
test('search normalizes Arabic and week copy respects per-day overrides', () => {
  assert.equal(normalizeSearch('أَحْمَد  علي'), normalizeSearch('احمد علي'));
  const plan = scheduleWeekPlan({...workspace,workAssignments:[{staffId:'a',date:'2026-11-12',periodId:null}]},['a'],'2026-11-19',{copy:true});
  assert.equal(plan.length,7);assert.deepEqual(plan[0].periodIds,[]);assert.equal(plan[0].restDay,true);
  assert.deepEqual(plan[1].periodIds,['shift']);
});
test('bank preflight reports every missing field and accepts matching template data', () => {
  assert.equal(bankPaymentIssues([{staffId:'a'}],'snb')[0].fields.length,5);
  assert.deepEqual(bankPaymentIssues([{staffId:'a',nameEn:'Test',payment:{account:'SA'+'1'.repeat(22),identity:'1'.repeat(10),bankCode:'NCBK',address:'Tabuk'}}],'snb'),[]);
});
