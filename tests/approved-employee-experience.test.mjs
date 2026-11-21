import test from 'node:test';import assert from 'node:assert/strict';
import {requestCounts,filterRequests,availableLeave,requestCardMarkup,recordedDuration} from '../public/employee-experience.js';
import {approvalRequestTypes,browserApprovalMembers,beginBrowserApproval,decideBrowserApproval} from '../public/browser-approval.js';
import {employeeRequestTypes} from '../public/request-settings.js';
import {permissionsFor,rolePermissionGroups} from '../public/role-permissions.js';
import {followUpItems,assignFollowUp,receiveFollowUp,updateFollowUp} from '../public/follow-up.js';
test('request filters count each real status once and cards escape untrusted labels',()=>{
 const rows=[{status:'Pending'},{status:'Approved'},{status:'Declined'},{status:'Cancelled'}];assert.deepEqual(requestCounts(rows),{all:4,pending:1,completed:3});assert.equal(filterRequests(rows,'completed').length,3);assert.equal(filterRequests(rows,'pending').length,1);assert.equal(rows.length,4);
 const html=requestCardMarkup({type:'Missed punch',status:'Pending'},{label:'<img onerror=bad>',statusLabel:'Pending',dateLabel:'21/11/2026',progress:'<script>bad</script>'});assert.doesNotMatch(html,/<img|<script/);assert.match(html,/&lt;img/);
 assert.equal(availableLeave({available:-2.5,current:10,opening:5}),-2.5);assert.equal(availableLeave({current:10,opening:5}),15);assert.equal(availableLeave(null),null);assert.equal(recordedDuration(480,'en'),'8 h');assert.equal(recordedDuration(undefined),'—');
});
function fixture(){return {leaveTypes:['Annual leave'],staffRoles:['Employee','HR','Manager'],rolePermissions:{HR:{administrator:true,values:{requests:true,tasks:true}}},staff:[{id:'s',role:'Employee',branchId:'a',status:'Active',managerId:'m',account:{}},{id:'h',role:'HR',branchId:'a',status:'Active'},{id:'h2',role:'HR',branchId:'b',status:'Active'},{id:'m',role:'Manager',branchId:'a',status:'Active'}],requests:[],punches:[],workPeriods:[],workAssignments:[],locations:[]};}
test('browser changes are approval-only, role stages resolve live branch membership and require final approval',()=>{
 const w=fixture(),s=w.staff[0],hr=w.staff[1],other=w.staff[2],m=w.staff[3];assert.ok(approvalRequestTypes(w).includes('Device change'));assert.ok(!employeeRequestTypes(w).includes('Device change'));
 s.account.browser='original';s.account.pendingBrowser='candidate';beginBrowserApproval(w,s,['role:HR','role:Manager']);assert.deepEqual(browserApprovalMembers(w,s),['h']);assert.throws(()=>decideBrowserApproval(w,s,other,'approve'),/current approval/);assert.throws(()=>decideBrowserApproval(w,s,m,'approve'),/current approval/);
 assert.equal(decideBrowserApproval(w,s,hr,'approve').forwarded,true);assert.equal(s.account.browser,'original');assert.deepEqual(browserApprovalMembers(w,s),['m']);assert.throws(()=>decideBrowserApproval(w,s,hr,'approve'),/current approval/);const end=decideBrowserApproval(w,s,m,'approve');assert.equal(end.forwarded,false);assert.equal(end.approvalHistory.length,2);
});
test('browser approval revocation takes effect immediately and rejection does not grant browser access',()=>{
 const w=fixture(),s=w.staff[0],hr=w.staff[1];s.account.browser='original';beginBrowserApproval(w,s,['role:HR']);w.rolePermissions.HR.values.requests=false;assert.deepEqual(browserApprovalMembers(w,s),[]);assert.throws(()=>decideBrowserApproval(w,s,hr,'approve'),/current approval/);w.rolePermissions.HR.values.requests=true;assert.equal(decideBrowserApproval(w,s,hr,'reject').forwarded,false);assert.equal(s.account.browser,'original');assert.equal(s.account.pendingApprovalHistory[0].status,'Declined');
});
test('follow-up permission independently controls receiving, assigning and closing within a branch',()=>{
 const w=fixture(),manager=w.staff[3],hr=w.staff[1],today='2026-11-22';const task=followUpItems(w,today).find(i=>i.staffId==='s');assert.ok(rolePermissionGroups.flatMap(g=>g[2]).some(p=>p[0]==='tasks'&&p[1].includes('مركز المتابعة')));assignFollowUp(w,{itemId:task.id,assigneeId:hr.id},manager,today);
 w.rolePermissions.HR.values.tasks=false;assert.throws(()=>receiveFollowUp(w,{itemId:task.id,expectedVersion:1},hr,today),/permission/);assert.throws(()=>updateFollowUp(w,{itemId:task.id,operation:'details',assigneeId:hr.id,status:'completed',dueOn:null},hr,today),/permission/);w.rolePermissions.HR.values.tasks=true;
 const r=receiveFollowUp(w,{itemId:task.id,expectedVersion:1},hr,today);assert.equal(r.status,'in-progress');assert.throws(()=>updateFollowUp(w,{itemId:task.id,operation:'details',assigneeId:'h2',status:'new',dueOn:null},hr,today),/authorized/);assert.equal(updateFollowUp(w,{itemId:task.id,operation:'details',expectedVersion:r.version,assigneeId:hr.id,status:'completed',dueOn:null},hr,today).status,'completed');
 assert.equal(permissionsFor(w,'Employee').tasks,false);
});
