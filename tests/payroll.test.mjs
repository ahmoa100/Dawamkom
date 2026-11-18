import test from 'node:test';
import assert from 'node:assert/strict';
import { mutatePayroll, publicPayrollRuns } from '../payroll.mjs';
import { payrollTotals, payrollMonths } from '../public/payroll-model.js';
const now='2026-11-18T12:00:00Z';
function fixture(){return {company:'Demo',today:'2026-11-18',staff:[{id:'a',name:'A',branchId:'one',status:'Active',joinDate:'2026-09-01',salary:{monthlyBase:5100,monthlyAllowances:600}},{id:'b',name:'B',branchId:'two',status:'Active',salary:{monthlyBase:4000}}]};}
const update=(w,b,scope={owner:true})=>mutatePayroll(w,{month:'2026-11',expectedVersion:w.payrollRuns?.[0]?.version??0,...b},{...scope,now});
test('monthly draft snapshots salary, adds and deducts with cent precision, and keeps source salary unchanged',()=>{
 const w=fixture();update(w,{operation:'prepare'});
 update(w,{operation:'salary',staffId:'a',base:5100,housing:600,other:0,insuranceBase:5700,insuranceRate:9.75,insuranceDays:30});
 update(w,{operation:'adjustment',staffId:'a',category:'other-add',amount:100,description:'Bonus'});
 update(w,{operation:'adjustment',staffId:'a',category:'late',amount:50,description:'Reviewed deduction'});
 assert.deepEqual(payrollTotals(w.payrollRuns[0].entries[0]),{gross:5700,insurance:555.75,additions:100,deductions:605.75,net:5194.25});
 assert.equal(w.staff[0].salary.monthlyAllowances,600);
 const item=w.payrollRuns[0].entries[0].adjustments[1];update(w,{operation:'remove-adjustment',staffId:'a',adjustmentId:item.id});
 assert.equal(payrollTotals(w.payrollRuns[0].entries[0]).net,5244.25);
 assert.equal(w.payrollRuns[0].entries[0].adjustments[1].removedAt,now);
});
test('insurance defaults to zero, supports configured days and rejects invalid amounts',()=>{
 const w=fixture();update(w,{operation:'prepare'});assert.equal(payrollTotals(w.payrollRuns[0].entries[0]).insurance,0);
 update(w,{operation:'salary',staffId:'a',base:5100,housing:600,other:0,insuranceBase:5700,insuranceRate:9.75,insuranceDays:15});
 assert.equal(payrollTotals(w.payrollRuns[0].entries[0]).insurance,277.88);
 assert.throws(()=>update(w,{operation:'adjustment',staffId:'a',category:'late',amount:-1,description:'Bad'}));
});
test('branch managers can change their branch only and cannot approve or export other employees',()=>{
 const w=fixture(),scope={owner:false,manager:{id:'manager',branchId:'one'}};
 update(w,{operation:'prepare'},scope);
 assert.throws(()=>update(w,{operation:'adjustment',staffId:'b',category:'late',amount:1,description:'Bad'},scope));
 update(w,{operation:'adjustment',staffId:'a',category:'other-add',amount:1,description:'Good'},scope);
 assert.throws(()=>update(w,{operation:'approve',expectedVersion:1},scope));
 update(w,{operation:'bank',bankId:'snb'},scope);
 const id=update(w,{operation:'export',format:'xlsx',language:'en'},scope);
 const report=w.issuedReports.find(item=>item.id===id);assert.equal(report.branchId,'one');assert.ok(report.rows.some(row=>row[1]==='A'));assert.ok(!report.rows.some(row=>row[1]==='B'));
});
test('approval checks version, locks all edits and freezes the approved export',()=>{
 const w=fixture();update(w,{operation:'prepare'});
 update(w,{operation:'adjustment',staffId:'a',category:'loan',amount:10,description:'Loan'});
 assert.throws(()=>update(w,{operation:'approve',expectedVersion:0}));
 update(w,{operation:'approve',expectedVersion:1});assert.equal(w.payrollRuns[0].status,'Approved');
 assert.throws(()=>update(w,{operation:'adjustment',staffId:'a',category:'late',amount:1,description:'Late'}));
 update(w,{operation:'bank',bankId:'snb'});
 update(w,{operation:'export',format:'pdf',language:'ar'});const old=w.issuedReports[0].rows;
 w.staff[0].salary.monthlyBase=9000;assert.equal(w.payrollRuns[0].entries[0].base,5100);assert.deepEqual(w.issuedReports[0].rows,old);
});
test('attachments are validated and stripped from public state',()=>{
 const w=fixture();update(w,{operation:'prepare'});
 update(w,{operation:'adjustment',staffId:'a',category:'other-add',amount:1,description:'Proof',attachment:{name:'proof.pdf',mime:'application/pdf',data:Buffer.from('%PDF-1.4').toString('base64')}});
 assert.equal(publicPayrollRuns(w.payrollRuns)[0].entries[0].adjustments[0].attachment.data,undefined);
 assert.throws(()=>update(w,{operation:'adjustment',staffId:'a',category:'late',amount:1,description:'Bad',attachment:{name:'bad.exe',mime:'application/exe',data:'AAAA'}}));
});
test('months sort newest first and newly added staff join only draft runs',()=>{
 const w=fixture();assert.deepEqual(payrollMonths(w),['2026-11','2026-10','2026-09']);update(w,{operation:'prepare'});
 w.staff.push({id:'c',name:'C',branchId:'one',status:'Pending activation',joinDate:'2026-11-15'});update(w,{operation:'prepare'});
 assert.equal(w.payrollRuns[0].entries.length,3);
});

test('exports require a selected bank and branch bank preferences do not alter company preference',()=>{
 const w=fixture();update(w,{operation:'prepare'});
 assert.throws(()=>update(w,{operation:'export',format:'xlsx',language:'ar'}),/Choose a bank/);
 update(w,{operation:'bank',bankId:'snb'});
 const scope={owner:false,manager:{id:'manager',branchId:'one'}};
 update(w,{operation:'bank',bankId:'alrajhi'},scope);
 assert.equal(w.payrollRuns[0].bank.id,'snb');
 update(w,{operation:'export',format:'xlsx',language:'ar'},scope);
 assert.equal(w.issuedReports[0].bank.id,'alrajhi');
});
test('stale financial edits are rejected rather than silently overwriting a changed payroll',()=>{
 const w=fixture();update(w,{operation:'prepare'});
 update(w,{operation:'adjustment',staffId:'a',category:'late',amount:5,description:'First'});
 assert.throws(()=>update(w,{operation:'adjustment',expectedVersion:0,staffId:'a',category:'late',amount:7,description:'Stale'}),/Payroll changed/);
 assert.equal(w.payrollRuns[0].entries[0].adjustments.length,1);
});
