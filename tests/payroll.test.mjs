import test from 'node:test';
import assert from 'node:assert/strict';
import { mutatePayroll, publicPayrollRuns, payrollAlerts } from '../payroll.mjs';
import { payrollTotals, payrollMonths, gosiRates, payrollEntry, payrollEntries } from '../public/payroll-model.js';
const now='2026-11-18T12:00:00Z';
function fixture(){return {company:'Demo',today:'2026-11-18',staff:[{id:'a',name:'A',branchId:'one',status:'Active',joinDate:'2026-09-01',salary:{monthlyBase:5100,monthlyAllowances:600}},{id:'b',name:'B',branchId:'two',status:'Active',salary:{monthlyBase:4000}}]};}
const update=(w,b,scope={owner:true})=>mutatePayroll(w,{month:'2026-11',expectedVersion:w.payrollRuns?.[0]?.version??0,...b},{...scope,now});

test('GOSI uses payroll month boundaries and explicit classification, not joining date',()=>{
 assert.equal(gosiRates('old','2028-07').total,9.75);
 for(const [month,rate] of [['2025-06',9.75],['2025-07',10.25],['2026-06',10.25],['2026-07',10.75],['2027-07',11.25],['2028-07',11.75]]) assert.equal(gosiRates('new',month).total,rate);
 assert.equal(gosiRates('new','2026-11',false).total,10);
 assert.equal(gosiRates('none','2026-11').total,0);
 const p={id:'x',joinDate:'2026-11-01',gosiScheme:'old',gosiBase:5000,salary:{monthlyBase:4500},iban:'SA0380000000608010167519'};
 assert.equal(payrollTotals(payrollEntry(p,'2026-11')).insurance,487.5);
 assert.equal(payrollEntry(p,'2026-11').payment.account,p.iban);
 const w=fixture();update(w,{operation:'prepare'});
 update(w,{operation:'salary',staffId:'a',base:5000,housing:0,other:0,insuranceBase:5000,insuranceRate:99,insuranceDays:30,insuranceScheme:'new',insuranceSaned:true});
 assert.equal(payrollTotals(w.payrollRuns[0].entries[0]).insurance,537.5);
 update(w,{operation:'approve'});
 assert.equal(w.payrollRuns[0].entries[0].insuranceRate,10.75);
});
test('monthly draft snapshots salary, adds and deducts with cent precision, and keeps source salary unchanged',()=>{
 const w=fixture();update(w,{operation:'prepare'});
 update(w,{operation:'salary',staffId:'a',base:5100,housing:600,other:0,insuranceBase:5700,insuranceRate:9.75,insuranceDays:30});
 update(w,{operation:'adjustment',staffId:'a',category:'other-add',amount:100,description:'Bonus'});
 update(w,{operation:'adjustment',staffId:'a',category:'late',amount:50,description:'Reviewed deduction'});
 assert.deepEqual(payrollTotals(w.payrollRuns[0].entries[0]),{gross:5700,insurance:555.75,additions:100,deductions:605.75,net:5194.25});
 assert.equal(w.staff[0].salary.monthlyAllowances,600);
 const item=w.payrollRuns[0].entries[0].adjustments[1];
 update(w,{operation:'adjustment',staffId:'a',category:'late',adjustmentId:item.id,amount:59.5,description:'Adjusted deduction'});
 assert.equal(w.payrollRuns[0].entries[0].adjustments.length,2);
 assert.equal(w.payrollRuns[0].entries[0].adjustments[1].id,item.id);
 assert.equal(payrollTotals(w.payrollRuns[0].entries[0]).deductions,615.25);
 update(w,{operation:'remove-adjustment',staffId:'a',adjustmentId:item.id});
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
 assert.throws(()=>update(w,{operation:'export',format:'xlsx',language:'en',branchId:'two'},scope),/outside your branch/);
 update(w,{operation:'bank',bankId:'snb'});
 update(w,{operation:'export',format:'xlsx',language:'ar',branchId:'two'});
 const filtered=w.issuedReports[0];
 assert.equal(filtered.language,'ar');
 assert.equal(filtered.rows.length,3);
 assert.equal(filtered.rows[1][1],'B');
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
 assert.throws(()=>update(w,{operation:'bank',bankId:'alrajhi'},scope));
 update(w,{operation:'bank',bankId:'aljazira'},scope);
 assert.equal(w.payrollRuns[0].bank.id,'snb');
 update(w,{operation:'export',format:'xlsx',language:'ar'},scope);
 assert.equal(w.issuedReports[0].bank.id,'aljazira');
});
test('stale financial edits are rejected rather than silently overwriting a changed payroll',()=>{
 const w=fixture();update(w,{operation:'prepare'});
 update(w,{operation:'adjustment',staffId:'a',category:'late',amount:5,description:'First'});
 assert.throws(()=>update(w,{operation:'adjustment',expectedVersion:0,staffId:'a',category:'late',amount:7,description:'Stale'}),/Payroll changed/);
 assert.equal(w.payrollRuns[0].entries[0].adjustments.length,1);
});


test('draft zero placeholders acquire profile GOSI while approved runs remain frozen',()=>{
 const w=fixture();w.staff[0].nationality='SA';delete w.staff[0].joinDate;update(w,{operation:'prepare'});
 assert.equal(payrollEntries(w,'2026-11')[0].insuranceNeedsSetup,true);
 assert.throws(()=>update(w,{operation:'approve'}),/Complete GOSI/);
 Object.assign(w.staff[0],{gosiScheme:'new',gosiBase:4000,gosiSaned:true});
 assert.equal(payrollTotals(payrollEntries(w,'2026-11')[0]).insurance,430);
 update(w,{operation:'approve'});
 w.staff[0].gosiBase=8000;
 assert.equal(payrollTotals(payrollEntries(w,'2026-11')[0]).insurance,430);
});
test('confirmed monthly settings survive refresh; non-Saudi deductions remain zero',()=>{
 const w=fixture();Object.assign(w.staff[0],{nationality:'SA',gosiScheme:'new',gosiBase:4000});
 update(w,{operation:'prepare'});
 update(w,{operation:'salary',staffId:'a',base:5000,housing:0,other:0,insuranceBase:3200,insuranceRate:0,insuranceDays:30,insuranceScheme:'new',insuranceSaned:true});
 assert.equal(payrollTotals(payrollEntries(w,'2026-11')[0]).insurance,344);
 w.staff[0].nationality='EG';
 assert.equal(payrollTotals(payrollEntries(w,'2026-11')[0]).insurance,0);
});

 test('confirmed first enrollment and registered salary calculate automatically; Tamheer is exempt',()=>{
 const w=fixture();Object.assign(w.staff[0],{nationality:'SA',joinDate:'2026-09-01'});
 let entry=payrollEntries(w,'2026-11')[0];assert.equal(entry.insuranceNeedsSetup,false);assert.equal(entry.insuranceBase,5700);assert.equal(payrollTotals(entry).insurance,612.75);
 w.staff[0].joinDate='2024-07-02';assert.equal(payrollEntries(w,'2026-11')[0].insuranceRate,9.75);
 w.staff[0].joinDate='2024-07-03';assert.equal(payrollEntries(w,'2026-11')[0].insuranceRate,10.75);
 w.staff[0].contractType='Tamheer';entry=payrollEntries(w,'2026-11')[0];assert.equal(entry.insuranceNeedsSetup,false);assert.equal(payrollTotals(entry).insurance,0);
 });

test('review exports need no bank and explicit bank exports preserve the saved bank preference',()=>{
 const w=fixture();update(w,{operation:'prepare'});
 update(w,{operation:'export',format:'xlsx',language:'ar',bankTemplate:false});
 assert.equal(w.issuedReports[0].bankTemplate,false);
 assert.equal(w.issuedReports[0].bank,undefined);
 update(w,{operation:'export',format:'xlsx',language:'ar',bankTemplate:true,bankId:'aljazira'});
 assert.equal(w.issuedReports[0].bank.id,'aljazira');
 assert.equal(w.payrollRuns[0].bank,undefined);
});

test('dated absence deduction follows corrected attendance in draft totals and exports and freezes on approval',()=>{
 const w=fixture(), day='2026-11-16';
 w.staff[0].periodIds=['fixed'];
 w.workPeriods=[{id:'fixed',start:'09:00',end:'17:00'}];
 w.workSchedule={days:[0,1,2,3,4,5,6]};
 w.punches=[];w.requests=[];
 update(w,{operation:'prepare'});
 const deduction={operation:'adjustment',staffId:'a',category:'absence',amount:190,description:'Absence'};
 assert.throws(()=>update(w,deduction),/absence date/);
 update(w,{...deduction,attendanceDate:day});
 assert.throws(()=>update(w,{...deduction,attendanceDate:day}),/already has/);
 const entries=()=>payrollEntries(w,'2026-11',Date.parse(now));
 const [item]=entries()[0].adjustments;
 assert.equal(payrollTotals(entries()[0]).net,5510);
 w.punches.push({staffId:'a',date:day,kind:'in',time:day+'T09:00:00+03:00'},
  {staffId:'a',date:day,kind:'out',time:day+'T17:00:00+03:00'});
 assert.equal(payrollTotals(entries()[0]).net,5700);
 assert.equal(entries()[0].adjustments[0].absenceResolved,true);
 assert.throws(()=>update(w,{operation:'approve'}),/Attendance changed/);
 update(w,{operation:'bank',bankId:'aljazira'});
 const report=update(w,{operation:'export',format:'xlsx',language:'en'});
 assert.equal(w.issuedReports.find(row=>row.id===report).rows[1].at(-1),'5700.00');
 update(w,{operation:'approve',resolvedAbsenceIds:[item.id]});
 w.punches=[];
 assert.equal(payrollTotals(entries()[0]).net,5700);
 assert.equal(w.payrollRuns[0].entries[0].adjustments[0].id,item.id);
});

test('an existing undated deduction stays manual until linked and approved leave excludes only that date',()=>{
 const w=fixture();
 w.staff[0].periodIds=['fixed'];
 w.workPeriods=[{id:'fixed',start:'09:00',end:'17:00'}];
 w.workSchedule={days:[0,1,2,3,4,5,6]};
 w.leaveTypes=['Annual leave'];
 w.requests=[{staffId:'a',type:'Annual leave',status:'Approved',date:'2026-11-16'}];
 update(w,{operation:'prepare'});
 const entry=w.payrollRuns[0].entries[0];
 entry.adjustments.push({id:'legacy',category:'absence',kind:'deduction',amount:190,description:'Old absence'});
 const net=()=>payrollTotals(payrollEntries(w,'2026-11',Date.parse(now))[0]).net;
 assert.equal(net(),5510);
 update(w,{operation:'edit-adjustment',staffId:'a',adjustmentId:'legacy',amount:190,description:'Old absence',attendanceDate:'2026-11-16'});
 update(w,{operation:'adjustment',staffId:'a',category:'absence',amount:150,description:'Separate absence',attendanceDate:'2026-11-17'});
 assert.equal(net(),5550);
});

test('delegated payroll approver can lock a run only when every entry is inside their branch permissions',()=>{
 const w=fixture();
 w.rolePermissions={Reviewer:{values:{payrollView:true,payrollApprove:true}}};
 const manager={id:'reviewer',role:'Reviewer',branchId:'one',roleBranchIds:{Reviewer:['one']}};
 update(w,{operation:'prepare'});
 assert.throws(()=>update(w,{operation:'approve'},{manager}),/every branch/);
 manager.roleBranchIds.Reviewer.push('two');
 w.rolePermissions.Reviewer.values.payrollApprove=false;
 assert.throws(()=>update(w,{operation:'approve'},{manager}),/approval permission/);
 w.rolePermissions.Reviewer.values.payrollApprove=true;
 update(w,{operation:'approve'},{manager});
 assert.equal(w.payrollRuns[0].status,'Approved');
 assert.equal(w.payrollRuns[0].approvedBy,'reviewer');
});

test('payroll alerts go to selected active recipients with access, including after a permission revocation',()=>{
 const w=fixture();
 w.staff[0].role='Reviewer';w.staff[1].role='Exporter';
 w.rolePermissions={Reviewer:{values:{payrollView:true}},Exporter:{values:{payrollExport:true}}};
 w.payrollNotificationSettings={enabled:true,inApp:true,email:true,recipientIds:['a','b']};
 update(w,{operation:'prepare'});
 assert.deepEqual(payrollAlerts(w,w.staff[0]),[]);
 update(w,{operation:'approve'});
 const [run]=w.payrollRuns;
 assert.deepEqual(run.payrollNotice,{ids:['a','b'],inApp:true,email:true});
 assert.deepEqual(payrollAlerts(w,w.staff[0]),[{id:run.id,month:'2026-11',approvedAt:now,canOpen:true}]);
 assert.deepEqual(payrollAlerts(w,w.staff[1]),[{id:run.id,month:'2026-11',approvedAt:now,canOpen:false}]);
 assert.equal(publicPayrollRuns(w.payrollRuns)[0].payrollNotice,undefined);
 w.rolePermissions.Reviewer.values.payrollView=false;
 assert.deepEqual(payrollAlerts(w,w.staff[0]),[]);
});
