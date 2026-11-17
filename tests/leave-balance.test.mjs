import test from 'node:test';
import assert from 'node:assert/strict';
import { annualLeaveBalance as balance, annualLeaveRequired } from '../public/leave-balance.js';
const employee = { id: 'a', joinDate: '2000-01-01', annualLeaveDays: 21 };
const leave = (date, end, extra = {}) => ({ id: 'request', staffId: 'a', type: 'Annual leave', status: 'Approved', date, end, ...extra });
test('splits imported 10-day balance into opening 3 and earned 7', () => {
  const result = balance({ ...employee, currentLeaveBalance: 10, currentLeaveBalanceDate: '2001-05-01' }, '2001-05-01');
  assert.equal(result.opening, 3); assert.equal(result.current, 7); assert.equal(result.accrued, 10);
});
test('splits imported 30-day balance after 20 months with a 30-day allowance', () => {
  const result = balance({ ...employee, annualLeaveDays: 30, currentLeaveBalance: 30, currentLeaveBalanceDate: '2001-09-01' }, '2001-09-01');
  assert.equal(result.opening, 10); assert.equal(result.current, 20);
});
test('old opening expires at the second anniversary while the next year carries', () => {
  const result = balance(employee, '2002-01-01');
  assert.equal(result.opening, 21); assert.equal(result.current, 0); assert.equal(result.openingExpires, '2003-01-01');
});
test('reset and partial carryover policies', () => {
  assert.equal(balance(employee, '2001-01-01', [], { remaining: 'reset' }).opening, 0);
  assert.equal(balance(employee, '2001-01-01', [], { remaining: 'partial', carryoverDays: 5 }).opening, 5);
});
test('advance use makes earned balance negative but stays within full allowance', () => {
  const result = balance(employee, '2000-02-01', [leave('2000-01-02', '2000-01-06')]);
  assert.equal(result.accrued, -3.25); assert.equal(result.available, 16);
});
test('monthly accrual, zero allowance and future joining dates', () => {
  assert.equal(balance(employee, '2000-02-01', [], { availability: 'accrued' }).available, 1.75);
  assert.equal(balance({ ...employee, annualLeaveDays: 0 }, '2001-05-01').available, 0);
  assert.equal(balance({ ...employee, joinDate: '2002-01-01' }, '2001-05-01').available, 0);
});
test('leap-day anniversary is clamped to February end', () => {
  assert.equal(balance({ ...employee, joinDate: '2000-02-29' }, '2001-02-28').opening, 21);
});
test('consumes opening first and does not repeat historical deductions after import', () => {
  const person = { ...employee, currentLeaveBalance: 10, currentLeaveBalanceDate: '2001-05-01' };
  const result = balance(person, '2001-05-03', [leave('2001-04-01', '2001-04-30'), leave('2001-05-02', '2001-05-03', { id: 'second' })]);
  assert.equal(result.opening, 1); assert.equal(result.current, 7); assert.equal(result.accrued, 8);
});
test('reserves pending days and ignores already consumed approved days', () => {
  const requests = [leave('2001-04-01', undefined), leave('2001-05-03', '2001-05-04', { id: 'pending', status: 'Pending' })];
  assert.equal(annualLeaveRequired(requests, 'a', '2001-05-01', { date: '2001-05-05', end: '2001-05-05' }), 3);
});

test('approved bookings immediately reduce balance, shortening to two days restores 18', () => {
  const person = { ...employee, annualLeaveDays: 30, currentLeaveBalance: 30, currentLeaveBalanceDate: '2001-09-01' };
  const original = leave('2001-09-03', '2001-09-22', { decidedAt: '2001-09-02T10:00:00Z' });
  assert.equal(balance(person, '2001-09-02', [original]).accrued, 10);
  assert.equal(balance(person, '2001-09-05', [{ ...original, end: '2001-09-04' }]).accrued, 28);
});
test('refunds unused leave booked before an imported balance without double charging it', () => {
  const person = { ...employee, annualLeaveDays: 30, currentLeaveBalance: 10, currentLeaveBalanceDate: '2001-09-02' };
  const original = leave('2001-09-03', '2001-09-04', { decidedAt: '2001-09-01T10:00:00Z' });
  const cancellation = {staffId:'a',type:'Leave cancellation',status:'Approved',originalLeaveType:'Annual leave',
    originalApprovalAt:original.decidedAt,decidedAt:'2001-09-05T10:00:00Z',refundedDays:18};
  assert.equal(balance(person,'2001-09-05',[original,cancellation]).accrued,28);
});
