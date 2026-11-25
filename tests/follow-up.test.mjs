import test from 'node:test';
import assert from 'node:assert/strict';
import {expiryCandidates} from '../public/document-reader.js';
import {followUpItems,assignFollowUp,updateFollowUp,publicFollowUpRecords,createFollowUpTicket} from '../public/follow-up.js';
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
test('linked ticket opens only after completion and retries never duplicate it',()=>{
 const w=workflowFixture(),m=w.staff[0],today='2026-11-20';
 w.locations=[{id:'a'},{id:'b'}];
 const nextTicket={requestId:'11111111-1111-4111-8111-111111111111',branchId:'a',assigneeId:'m',name:'Second',dueOn:today};
 const body={...nextTicket,requestId:'22222222-2222-4222-8222-222222222222',name:'First',nextTicket};
 assert.throws(()=>createFollowUpTicket(w,{...body,nextTicket:{...nextTicket,branchId:'b'}},m,today),/authorized branch/);
 assert.equal(w.followUpAssignments,undefined);
 const first=createFollowUpTicket(w,body,m,today);
 assert.equal(createFollowUpTicket(w,body,m,today),first);
 assert.deepEqual(publicFollowUpRecords(w.followUpAssignments).map(r=>r.snapshot.name),['First']);
 assert.ok(!followUpItems(w,today,m).some(item=>item.name==='Second'));
 const close={itemId:first.itemId,operation:'details',assigneeId:'m',dueOn:today,status:'completed',expectedVersion:1};
 updateFollowUp(w,close,m,today);
 assert.equal(followUpItems(w,today,m).find(item=>item.name==='Second')?.status,'new');
 assert.throws(()=>updateFollowUp(w,close,m,today),/changed/);
 assert.equal(w.followUpAssignments.filter(r=>r.snapshot.name==='Second').length,1);
});
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

test('bulk follow-up assignment is atomic, branch-scoped and rejects stale or completed entries',async()=>{
 const {assignFollowUpBatch}=await import('../public/follow-up.js');
 const w=workflowFixture();w.staff.push({id:'p2',name:'Second',status:'Active',branchId:'a',nationality:'EG',residencyExpiryDate:'2026-11-26'});
 const m=w.staff[0],day='2026-11-20',items=followUpItems(w,day,m).filter(i=>i.kind==='residence').map(i=>({itemId:i.id,expectedVersion:0}));
 assert.equal(items.length,2);
 const before=JSON.stringify(w);
 assert.throws(()=>assignFollowUpBatch(w,{items:[items[0],{...items[1],expectedVersion:7}],assigneeId:'m'},m,day),/changed/);assert.equal(JSON.stringify(w),before);
 assert.throws(()=>assignFollowUpBatch(w,{items,assigneeId:'m'},{...m,branchId:'b'},day),/unavailable/);assert.equal(JSON.stringify(w),before);
 assert.throws(()=>assignFollowUpBatch(w,{items,assigneeId:'missing'},m,day),/authorized/);assert.equal(JSON.stringify(w),before);
 assert.equal(assignFollowUpBatch(w,{items,assigneeId:'m'},m,day),2);assert.equal(w.followUpAssignments.length,2);assert.ok(w.followUpAssignments.every(r=>r.assigneeId==='m'&&r.events.length===1));
 const current=items.map(i=>({...i,expectedVersion:1}));
 updateFollowUp(w,{...current[1],operation:'details',assigneeId:'m',status:'completed',dueOn:null},m,day);
 const completed=JSON.stringify(w);assert.throws(()=>assignFollowUpBatch(w,{items:current,assigneeId:'m'},m,day),/completed/);assert.equal(JSON.stringify(w),completed);
});

test('only assignee can receive once, preserving deadline and auditing receipt; reassignment clears receipt',async()=>{
 const {receiveFollowUp}=await import('../public/follow-up.js');const w=workflowFixture(),m=w.staff[0],day='2026-11-20';w.staff.push({id:'other',role:'Manager',status:'Active',branchId:'a'});
 const id=followUpItems(w,day,m).find(i=>i.kind==='residence').id;
 updateFollowUp(w,{itemId:id,operation:'details',assigneeId:'m',dueOn:'2026-11-28',status:'new'},null,day);
 const before=JSON.stringify(w);assert.throws(()=>receiveFollowUp(w,{itemId:id,expectedVersion:1},w.staff.at(-1),day),/assigned/);assert.equal(JSON.stringify(w),before);
 assert.throws(()=>receiveFollowUp(w,{itemId:id,expectedVersion:0},m,day),/changed/);
 receiveFollowUp(w,{itemId:id,expectedVersion:1},m,day,'2026-11-20T12:00:00Z');let r=w.followUpAssignments.find(r=>r.itemId===id);assert.equal(r.status,'in-progress');assert.equal(r.receivedBy,'m');assert.equal(r.receivedAt,'2026-11-20T12:00:00Z');assert.equal(r.dueOn,'2026-11-28');assert.equal(r.events.at(-1).type,'received');
 receiveFollowUp(w,{itemId:id,expectedVersion:1},m,day);assert.equal(r.events.length,2);
 assignFollowUp(w,{itemId:id,assigneeId:'other'},null,day);r=w.followUpAssignments.find(r=>r.itemId===id);assert.equal(r.status,'new');assert.equal(r.receivedAt,undefined);
});
test('follow-up postpones its reminder and validates the configured second window',()=>{
 const w=workflowFixture();
 w.notificationSettings={documentSecondReminderDays:5};
 const today='2026-11-20';
 const itemId=followUpItems(w,today).find(i=>i.kind==='residence').id;
 const details={itemId,operation:'details',assigneeId:null,status:'new',dueOn:'2026-12-10'};
 const get=date=>followUpItems(w,date).find(i=>i.id===itemId);
 updateFollowUp(w,details,null,today);
 assert.equal(get('2026-12-09').reminderPending,true);
 assert.equal(get('2026-12-10').reminderActive,true);
 assert.equal(get('2026-12-10').expiresOn,'2026-11-25');
 assert.throws(()=>updateFollowUp(w,{...details,reminderOn:'2026-12-05'},null,today),/more than 5/);
 w.branchNotificationSettings={a:{documentSecondReminderDays:3}};
 assert.throws(()=>updateFollowUp(w,{...details,reminderOn:'2026-12-07'},null,today),/more than 3/);
 updateFollowUp(w,{...details,reminderOn:'2026-12-06'},null,today);
 assert.equal(get('2026-12-05').reminderPending,true);
 assert.equal(get('2026-12-06').reminderActive,true);
 assert.equal(w.followUpAssignments[0].events.at(-1).to.reminderOn,'2026-12-06');
});
test('recurring tickets open on their scheduled dates and only the assignee can complete them',async()=>{
 const {createFollowUpTicket,materializeRecurringFollowUps}=await import('../public/follow-up.js');
 const w=workflowFixture(),manager=w.staff[0];
 w.locations=[{id:'a'}];
 const requestId='11111111-1111-4111-8111-111111111111';
 const record=createFollowUpTicket(w,{requestId,branchId:'a',assigneeId:manager.id,name:'Monthly task',dueOn:'2027-01-31',
  recurrence:{frequency:'monthly',firstOn:'2027-01-31'}},null,'2027-01-25');
 const tickets=date=>followUpItems(w,date).filter(item=>item.kind==='ticket');
 assert.equal(tickets('2027-01-30').length,0);
 assert.equal(tickets('2027-01-31').length,1);
 const close={itemId:record.itemId,operation:'details',status:'completed',assigneeId:manager.id,dueOn:record.dueOn};
 assert.throws(()=>updateFollowUp(w,close,null,'2027-01-31'),/assigned employee/);
 updateFollowUp(w,close,manager,'2027-01-31');
 assert.equal(materializeRecurringFollowUps(w,'2027-02-27'),false);
 assert.equal(materializeRecurringFollowUps(w,'2027-02-28'),true);
 assert.equal(materializeRecurringFollowUps(w,'2027-02-28'),false);
 assert.equal(w.recurringFollowUps[0].nextOn,'2027-03-31');
 const fresh=tickets('2027-02-28').find(item=>item.status==='new');
 assert.equal(fresh.dueOn,'2027-02-28');
 assert.notEqual(fresh.number,record.snapshot.number);
});
