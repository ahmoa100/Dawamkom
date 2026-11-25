import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduleApprovedLoan} from '../loans.mjs';
import {employeeRequestTypes,employeeRequestEnabled,loanRequestTerms} from '../public/request-settings.js';
import {payrollEntries,payrollTotals} from '../public/payroll-model.js';
import {bankPayrollRows,csvReport} from '../public/bank-payroll.js';
test('approval catalog includes every leave including custom and inactive types, without browser changes or duplicates',()=>{
 const types=employeeRequestTypes({leaveTypes:['Annual leave','Marriage','Custom leave','Annual leave'],leaveSettings:{Marriage:{active:false}}});
 assert.deepEqual(types,['Annual leave','Marriage','Custom leave','Missed punch','Attendance excuse','Leave cancellation','Loan request','Shift change']);
 assert.equal(types.includes('Device change'),false);
});
test('request preferences preserve branch isolation and company off overrides branch on',()=>{
 const w={requestPreferences:{'Loan request':false},branchRequestPreferences:{a:{'Loan request':true,'Missed punch':false}}};
 assert.equal(employeeRequestEnabled(w,{branchId:'a'},'Loan request'),false);
 assert.equal(employeeRequestEnabled(w,{branchId:'a'},'Missed punch'),false);
 assert.equal(employeeRequestEnabled(w,{branchId:'b'},'Missed punch'),true);
});
test('loan schedules only final approved requests, skips approved payroll and never duplicates installments',()=>{
 const w={staff:[{id:'s',name:'Test',salary:{monthlyBase:2000}}],payrollRuns:[{month:'2026-11',status:'Approved',entries:[]}]};
 const request={id:'r',staffId:'s',type:'Loan request',status:'Pending',loanAmount:1000,repaymentInstallments:2};
 scheduleApprovedLoan(w,request,'2026-11-18');assert.equal(w.loanSchedules,undefined);
 request.status='Approved';scheduleApprovedLoan(w,request,'2026-11-18');scheduleApprovedLoan(w,request,'2026-11-18');
 assert.equal(w.loanSchedules.length,1);
 assert.deepEqual(w.loanSchedules[0].installments.map(i=>[i.month,i.amount]),[['2026-12',500],['2027-01',500]]);
 assert.equal(payrollTotals(payrollEntries(w,'2026-12')[0]).net,1500);
});
test('loan cents reconcile and invalid amounts/installment counts fail',()=>{
 const w={},r={id:'r',staffId:'s',type:'Loan request',status:'Approved',loanAmount:100,repaymentInstallments:3};
 scheduleApprovedLoan(w,r,'2026-11-18');assert.deepEqual(w.loanSchedules[0].installments.map(i=>i.amount),[33.34,33.33,33.33]);
 for(const amount of [0,-1,NaN,1.001])assert.throws(()=>loanRequestTerms({loanAmount:amount,repaymentInstallments:2}));
 assert.throws(()=>loanRequestTerms({loanAmount:100,repaymentInstallments:5}));
});
test('bank templates match supplied columns and reconcile net with allowances, additions and deductions',()=>{
 const e={name:'Test',nameEn:'Test Employee',base:5100,housing:600,other:0,insuranceBase:5700,insuranceRate:9.75,insuranceDays:30,
 adjustments:[{kind:'addition',amount:100}],payment:{identity:'1000000000',account:'12345678901234',bankCode:'NCBK',address:'Tabuk'}};
 const snb=bankPayrollRows([e],'snb','2026-11'),jazira=bankPayrollRows([e],'aljazira','2026-11');
 assert.equal(bankPayrollRows([e],'snb','2026-10')[1][3],'SALAY OCT  2026');
 assert.equal(snb[0].length,11);assert.equal(jazira[0].length,9);
 assert.equal(snb[1][2],'5244.25');assert.equal(jazira[1][8],'5244.25');
 assert.equal(jazira[1][0],'1000000000');assert.equal(jazira[1][6],'100.00');
 assert.ok(csvReport(snb).startsWith('\uFEFF"البنك","رقم الحساب"'));
 assert.throws(()=>bankPayrollRows([{...e,payment:{}}],'snb','2026-11'));
});
