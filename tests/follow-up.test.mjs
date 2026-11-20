import test from 'node:test';
import assert from 'node:assert/strict';
import {expiryCandidates} from '../public/document-reader.js';
import {followUpItems,assignFollowUp,updateFollowUp,publicFollowUpRecords} from '../public/follow-up.js';
test('expiry suggestions accept Arabic digits, validated Gregorian dates and Umm al-Qura Hijri dates',()=>{
 assert.equal(expiryCandidates('تاريخ الانتهاء: ٢٠٢٧/١٢/٣١')[0].date,'2027-12-31');
 assert.equal(expiryCandidates('Expiry date: 2027-12-31')[0].labelled,true);
 assert.equal(expiryCandidates('انتهاء: 1448/02/15')[0].calendar,'hijri');
 assert.equal(expiryCandidates('Expiry 2027-02-31').length,0);
});
test('follow-up classifies deadlines and assignment is branch-authorized with history',()=>{
 const manager={id:'m',status:'Active',role:'Manager',branchId:'a'};
 const other={id:'o',status:'Active',role:'Manager',branchId:'b'};
 const person={id:'p',status:'Active',branchId:'a',nationality:'EG',residencyExpiryDate:'2026-11-25'};
 const w={staff:[manager,other,person],documents:[{id:'d',name:'Licence',expiresOn:'2026-12-15'}]};
 assert.ok(followUpItems(w,'2026-11-20').some(i=>i.kind==='document'&&i.category==='soon'));
 const scoped=followUpItems(w,'2026-11-20',manager);assert.ok(!scoped.some(i=>i.kind==='document'||i.staffId==='o'));
 const item=scoped.find(i=>i.kind==='residence');assert.equal(item.category,'urgent');
 assert.throws(()=>assignFollowUp(w,{itemId:item.id,assigneeId:'o'},manager,'2026-11-20'),/authorized/);
 assignFollowUp(w,{itemId:item.id,assigneeId:'m'},manager,'2026-11-20');
 assignFollowUp(w,{itemId:item.id,assigneeId:null},manager,'2026-11-20');
 assert.equal(w.followUpAssignments[0].history.length,1);
 assert.throws(()=>assignFollowUp(w,{itemId:item.id,assigneeId:'m'},other,'2026-11-20'),/permissions/);
 assert.equal(followUpItems({...w,staff:[{...person,residencyExpiryDate:'2027-01-01'}]},'2026-11-20').filter(i=>i.kind==='residence'&&i.status!=='completed').length,0);
});

const workflowFixture=()=>({staff:[{id:'m',name:'Manager',status:'Active',role:'Manager',branchId:'a'},{id:'p',name:'Employee',status:'Active',branchId:'a',nationality:'EG',residencyExpiryDate:'2026-11-25'}],documents:[]});
test('follow-up tracks deadlines, status, optimistic versions and audit events',()=>{
 const w=workflowFixture(),m=w.staff[0],id=followUpItems(w,'2026-11-20',m).find(i=>i.kind==='residence').id;
 updateFollowUp(w,{itemId:id,operation:'details',assigneeId:'m',dueOn:'2026-11-19',status:'in-progress',expectedVersion:0},m,'2026-11-20','2026-11-20T10:00:00Z');
 let item=followUpItems(w,'2026-11-20',m).find(i=>i.id===id);assert.equal(item.overdue,true);assert.equal(item.assignment.events[0].by,'m');
 assert.throws(()=>updateFollowUp(w,{itemId:id,operation:'details',expectedVersion:0},m,'2026-11-20'),/changed/);
 assert.throws(()=>updateFollowUp(w,{itemId:id,operation:'details',assigneeId:'m',dueOn:'2026-02-30',status:'new'},m,'2026-11-20'),/date/);
 updateFollowUp(w,{itemId:id,operation:'details',assigneeId:'m',dueOn:null,status:'completed',expectedVersion:1},m,'2026-11-20');
 item=followUpItems(w,'2026-11-20',m).find(i=>i.id===id);assert.equal(item.status,'completed');assert.equal(item.overdue,false);
});
test('renewal archives old follow-up but retains history and branch boundaries',()=>{
 const w=workflowFixture(),m=w.staff[0],id=followUpItems(w,'2026-11-20',m).find(i=>i.kind==='residence').id;
 assignFollowUp(w,{itemId:id,assigneeId:'m'},m,'2026-11-20');
 w.staff[1].residencyExpiryDate='2027-11-25';
 const item=followUpItems(w,'2026-11-20',m).find(i=>i.id===id);assert.equal(item.autoCompleted,true);assert.equal(item.status,'completed');assert.equal(item.assignment.events.length,1);
 assert.throws(()=>updateFollowUp(w,{itemId:id,operation:'comment',text:'Change'},m,'2026-11-20'),/automatically/);
 assert.ok(!followUpItems(w,'2026-11-20',{...m,branchId:'b'}).some(i=>i.id===id));
 w.staff[1].residencyExpiryDate='';assert.ok(!followUpItems(w,'2026-11-20',m).some(i=>i.id===id));
});
test('comments validate files, retain private bytes and expose only safe metadata',()=>{
 const w=workflowFixture(),m=w.staff[0],id=followUpItems(w,'2026-11-20',m).find(i=>i.kind==='residence').id;
 const attachment={name:'proof.pdf',mime:'application/pdf',data:Buffer.from('%PDF-1.4 test').toString('base64')};
 updateFollowUp(w,{itemId:id,operation:'comment',text:'Renewal submitted',attachment,expectedVersion:0},m,'2026-11-20');
 assert.equal(w.followUpAssignments[0].comments[0].attachment.data,attachment.data);
 assert.equal(publicFollowUpRecords(w.followUpAssignments)[0].comments[0].attachment.data,undefined);
 assert.throws(()=>updateFollowUp(w,{itemId:id,operation:'comment',text:'',attachment:{...attachment,data:'AAAA'}},m,'2026-11-20'),/PDF/);
 assert.throws(()=>updateFollowUp(w,{itemId:id,operation:'comment',text:'X'}, {...m,branchId:'b'},'2026-11-20'),/permissions/);
});

test('company document follow-up is visible only to its assigned manager, without exposing the wallet',()=>{
 const w=workflowFixture(),m=w.staff[0];w.documents=[{id:'d',name:'Licence',expiresOn:'2026-11-25'}];
 const id=followUpItems(w,'2026-11-20').find(i=>i.kind==='document').id;
 assert.ok(!followUpItems(w,'2026-11-20',m).some(i=>i.id===id));
 assignFollowUp(w,{itemId:id,assigneeId:'m'},null,'2026-11-20');
 assert.ok(followUpItems(w,'2026-11-20',m).some(i=>i.id===id));
 assert.throws(()=>updateFollowUp(w,{itemId:id,operation:'details',status:'new',dueOn:null,assigneeId:null},m,'2026-11-20'),/reassign/);
 const scoped={...w,documents:[],followUpDocuments:w.documents};
 assert.ok(followUpItems(scoped,'2026-11-20').some(i=>i.id===id));
 w.documents[0].expiresOn='2027-11-25';assert.equal(followUpItems(w,'2026-11-20',m).find(i=>i.id===id).autoCompleted,true);
});
