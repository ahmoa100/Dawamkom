import test from 'node:test';import assert from 'node:assert/strict';import {homeReviewGroups} from '../public/ux-model.js';
const now=Date.parse('2026-11-22T12:00:00+03:00');
const fixture=()=>{const person=(id,branchId='a')=>({id,name:id,status:'Active',role:'Employee',branchId,nationality:'EG',email:id+'@example.com',phone:'0500000000',identityNumber:'2000000000',joinDate:'2025-01-01',jobTitle:'Teacher',iban:'SA0000000000000000000000',residencyExpiryDate:'2028-01-01',periodIds:['p'],managerId:'m'});return {today:'2026-11-22',staff:[person('s'),{...person('m'),role:'Manager'},person('other','b'),{...person('pending'),status:'Pending activation'}],locations:[{id:'a'},{id:'b'}],workSchedule:{days:[0,1,2,3,4,5,6]},workPeriods:[{id:'p',start:'09:00',end:'17:00'}],workAssignments:[],leaveTypes:['Annual leave'],requests:[],punches:[{staffId:'s',kind:'in',date:'2026-11-21',time:'2026-11-21T09:00:00+03:00'},{staffId:'other',kind:'in',date:'2026-11-21',time:'2026-11-21T09:00:00+03:00'},{staffId:'s',kind:'out',date:'2026-11-22',time:'2026-11-22T11:00:00+03:00'}],documents:[{id:'d',name:'Company licence',expiresOn:'2026-11-23'}],followUpAssignments:[{itemId:'document:d:2026-11-23',status:'new',dueOn:'2026-11-20',assigneeId:'m'}]};};
const get=(groups,id)=>groups.find(g=>g.id===id).items;
test('dashboard provides all eight drill-down groups with branch and current approver scope',()=>{
 const w=fixture(),context={requests:[{id:'r',staffId:'s',status:'Pending',approvalSteps:['role:Manager'],approverIds:['m']},{id:'other-stage',staffId:'s',status:'Pending',approvalSteps:['role:HR'],approverIds:['x']},{id:'outside',staffId:'other',status:'Pending'}]};
 const groups=homeReviewGroups(w,{viewer:w.staff[1],requestContext:context,now});assert.equal(groups.length,8);
 assert.deepEqual(get(groups,'requests').map(r=>r.id),['r']);assert.deepEqual(get(groups,'activation').map(r=>r.id),['pending']);assert.deepEqual(get(groups,'punches').map(r=>r.id),['s:2026-11-21']);assert.ok(groups.flatMap(g=>g.items).every(i=>i.staffId!=='other'));
 const owner=homeReviewGroups(w,{owner:true,requestContext:context,now});assert.equal(get(owner,'documents').length,1);assert.equal(get(owner,'overdue').length,1);assert.equal(owner[0].id,'overdue');assert.deepEqual(homeReviewGroups(w,{now}).flatMap(g=>g.items),[]);
});
test('schedule attention excludes rest days and approved leave and counts absent schedules only once per employee',()=>{
 const w=fixture();w.staff[0].periodIds=[];const review=()=>homeReviewGroups(w,{viewer:w.staff[1],now});assert.deepEqual(get(review(),'schedule').map(r=>r.id),['s']);
 w.requests=[{staffId:'s',status:'Approved',type:'Annual leave',date:'2026-11-22',end:'2026-11-28'}];assert.equal(get(review(),'schedule').length,0);
 w.requests=[];w.staff[0].restWeekdays=[0,1,2,3,4,5,6];assert.equal(get(review(),'schedule').length,0);
 w.staff[0].restWeekdays=[];w.staff[0].periodIds=['p'];w.staff[0].managerId='unknown';assert.ok(get(review(),'manager').some(p=>p.id==='s'));w.staff[0].email='';assert.ok(get(review(),'staff').some(p=>p.staffId==='s'));
});
