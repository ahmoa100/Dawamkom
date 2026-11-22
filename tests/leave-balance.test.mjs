import test from 'node:test';
import assert from 'node:assert/strict';
import { annualLeaveBalance as balance, annualLeaveRequired, futureAnnualLeave } from '../public/leave-balance.js';

test('approved future annual leave creates debt and daily accrual repays it across renewal', () => {
  const person = {id:'borrower', joinDate:'2025-01-01', annualLeaveDays:30};
  const leave = {staffId:person.id, type:futureAnnualLeave, date:'2025-12-30', end:'2026-02-02', decidedAt:'2025-12-30T09:00:00Z'};
  const preferences = {availability:'accrued', remaining:'reset'};
  const result = (when,status='Approved') => balance(person,when,[{...leave,status}],preferences).available;
  assert.ok(result('2025-12-30','Pending') > 0);
  assert.ok(result('2025-12-30') < 0);
  assert.ok(result('2026-01-02') > result('2025-12-30') && result('2026-01-02') < 0);
  assert.ok(result('2026-04-01') > 0);
  assert.equal(result('2025-12-30','Cancelled'), result('2025-12-30','Pending'));
});
const employee = { id: 'a', joinDate: '2000-01-01', annualLeaveDays: 21 };
const leave = (date, end, extra = {}) => ({ id: 'request', staffId: 'a', type: 'Annual leave', status: 'Approved', date, end, ...extra });
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-12,`${actual} != ${expected}`);
test('splits an imported balance using earned calendar days and preserves its exact total', () => {
  const result = balance({ ...employee, currentLeaveBalance: 10, currentLeaveBalanceDate: '2001-05-01' }, '2001-05-01');
  close(result.opening,10-121*21/365);close(result.current,121*21/365);assert.equal(result.accrued,10);
});
test('splits imported 30-day balance after 20 months with a 30-day allowance', () => {
  const result = balance({ ...employee, annualLeaveDays: 30, currentLeaveBalance: 30, currentLeaveBalanceDate: '2001-09-01' }, '2001-09-01');
  close(result.opening,30-244*30/365);close(result.current,244*30/365);assert.equal(result.accrued,30);
});
test('old opening expires at the second anniversary while the next year carries', () => {
  const result = balance(employee, '2002-01-01');
  assert.equal(result.opening, 21);assert.equal(result.current,21/365);assert.equal(result.openingExpires,'2003-01-01');
});
test('reset and partial carryover policies', () => {
  assert.equal(balance(employee, '2001-01-01', [], { remaining: 'reset' }).opening, 0);
  assert.equal(balance(employee, '2001-01-01', [], { remaining: 'partial', carryoverDays: 5 }).opening, 5);
});
test('advance use makes earned balance negative but stays within full allowance', () => {
  const result = balance(employee, '2000-02-01', [leave('2000-01-02', '2000-01-06')]);
  close(result.accrued,32*21/366-5);assert.equal(result.available,16);
});
test('daily accrual, zero allowance and future joining dates', () => {
  assert.equal(balance(employee,'2000-02-01',[],{availability:'accrued'}).available,32*21/366);
  assert.equal(balance({ ...employee, annualLeaveDays: 0 }, '2001-05-01').available, 0);
  assert.equal(balance({ ...employee, joinDate: '2002-01-01' }, '2001-05-01').available, 0);
});
test('leap-day anniversary is clamped to February end', () => {
  assert.equal(balance({ ...employee, joinDate: '2000-02-29' }, '2001-02-28').opening, 21);
});
test('consumes opening first and does not repeat historical deductions after import', () => {
  const person = { ...employee, currentLeaveBalance: 10, currentLeaveBalanceDate: '2001-05-01' };
  const result = balance(person, '2001-05-03', [leave('2001-04-01', '2001-04-30'), leave('2001-05-02', '2001-05-03', { id: 'second' })]);
  close(result.opening,8-121*21/365);close(result.current,123*21/365);close(result.accrued,8+2*21/365);
});
test('reserves pending days and ignores already consumed approved days', () => {
  const requests = [leave('2001-04-01', undefined), leave('2001-05-03', '2001-05-04', { id: 'pending', status: 'Pending' })];
  assert.equal(annualLeaveRequired(requests, 'a', '2001-05-01', { date: '2001-05-05', end: '2001-05-05' }), 3);
});

test('approved bookings immediately reduce balance, shortening to two days restores 18', () => {
  const person = { ...employee, annualLeaveDays: 30, currentLeaveBalance: 30, currentLeaveBalanceDate: '2001-09-01' };
  const original = leave('2001-09-03', '2001-09-22', { decidedAt: '2001-09-02T10:00:00Z' });
  close(balance(person,'2001-09-02',[original]).accrued,10+30/365);
  close(balance(person,'2001-09-05',[{...original,end:'2001-09-04'}]).accrued,28+4*30/365);
});
test('refunds unused leave booked before an imported balance without double charging it', () => {
  const person = { ...employee, annualLeaveDays: 30, currentLeaveBalance: 10, currentLeaveBalanceDate: '2001-09-02' };
  const original = leave('2001-09-03', '2001-09-04', { decidedAt: '2001-09-01T10:00:00Z' });
  const cancellation = {staffId:'a',type:'Leave cancellation',status:'Approved',originalLeaveType:'Annual leave',
    originalApprovalAt:original.decidedAt,decidedAt:'2001-09-05T10:00:00Z',refundedDays:18};
  close(balance(person,'2001-09-05',[original,cancellation]).accrued,28+3*30/365);
});
test('negative imported balance remains a debt, accrues daily, and does not expire at anniversary',()=>{
 const person={...employee,currentLeaveBalance:-5,currentLeaveBalanceDate:'2001-05-01'};
 const initial=balance(person,'2001-05-01');assert.equal(initial.opening,0);assert.equal(initial.current,-5);assert.equal(initial.accrued,-5);
 close(balance(person,'2001-06-01').accrued,-5+31*21/365);
 const debt={...person,currentLeaveBalance:-30};close(balance(debt,'2002-01-01').accrued,-30+245*21/365);
 const zero={...person,annualLeaveDays:0};assert.equal(balance(zero,'2002-01-01').accrued,-5);
});

test('every contractual day earns an unrounded fraction; the last day is exactly the annual allowance',()=>{
 for(const [join,end,next,days] of [['2026-01-01','2026-12-31','2027-01-01',365],['2024-01-01','2024-12-31','2025-01-01',366],['2023-03-01','2024-02-29','2024-03-01',366]]) {
  for(const entitlement of [0,21,30]) {
   const person={id:'a',joinDate:join,annualLeaveDays:entitlement};
   assert.equal(balance(person,join).current,entitlement/days);
   assert.equal(balance(person,end).current,entitlement);
   assert.equal(balance(person,end,[],{availability:'accrued'}).available,entitlement);
   const rolled=balance(person,next);assert.equal(rolled.opening,entitlement);assert.equal(rolled.current,entitlement/365);
  }
 }
 const first=balance({...employee,joinDate:'2026-11-19'},'2026-11-19').current;
 assert.equal(first,21/365);assert.notEqual(first,Math.round(first*1e8)/1e8);
});

test('previous opening expires at the second anniversary while the current year continues earning',()=>{
 const person={...employee,currentLeaveBalance:25,currentLeaveBalanceDate:'2001-12-31'};
 const last=balance(person,'2001-12-31');assert.equal(last.opening,4);assert.equal(last.current,21);
 const next=balance(person,'2002-01-01');assert.equal(next.opening,21);assert.equal(next.current,21/365);
});

test('imported balances on the joining date stay exact and then gain only subsequent daily accrual',()=>{
 for(const imported of [-5,0,10]) {
  const person={...employee,joinDate:'2026-11-19',currentLeaveBalance:imported,currentLeaveBalanceDate:'2026-11-19'};
  close(balance(person,'2026-11-19').accrued,imported);
  close(balance(person,'2026-11-20').accrued,imported+21/365);
 }
});

test('live entry preview splits imported balance, detects impossible surplus and preserves negative balances', async()=>{
 const {leaveBalancePreview}=await import('../public/leave-balance.js');
 const person={joinDate:'2024-11-19',annualLeaveDays:21,currentLeaveBalanceDate:'2026-11-19',currentLeaveBalance:10};
 const b=leaveBalancePreview(person,'2026-11-19').balance;
 assert.ok(Math.abs(b.current-21/365)<1e-10);assert.ok(Math.abs(b.opening-(10-21/365))<1e-10);
 assert.equal(b.openingExpires,'2027-11-19');assert.equal(b.currentExpires,'2028-11-19');
 const surplus=leaveBalancePreview({...person,annualLeaveDays:30,currentLeaveBalance:60},'2026-11-19');
 assert.equal(surplus.exceedsAccrued,true);assert.ok(Math.abs(surplus.maximum-(30+30/365))<1e-10);
 assert.equal(leaveBalancePreview({...person,currentLeaveBalance:-5},'2026-11-19').balance.current,-5);
});
