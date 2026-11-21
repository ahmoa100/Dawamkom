import test from 'node:test';
import assert from 'node:assert/strict';
import {eligibleRequestApprover,eligibleApprovalRoles,approvalStepMembers} from '../public/role-permissions.js';

test('approval eligibility follows current grants across custom roles, not role names or administrator labels',()=>{
  const workspace={rolePermissions:{HR:{administrator:true,values:{requests:true}},Observer:{administrator:true,values:{requests:false}},Manager:{values:{requests:false}}}};
  const hr={role:'HR',status:'Active'};
  assert.equal(eligibleRequestApprover(workspace,hr),true);
  assert.equal(eligibleRequestApprover(workspace,{role:'Observer',status:'Active'}),false);
  assert.equal(eligibleRequestApprover(workspace,{role:'Manager',status:'Active'}),false);
  for(const status of ['Removed','Pending activation','Inactive'])assert.equal(eligibleRequestApprover(workspace,{...hr,status}),false);
  workspace.rolePermissions.HR.values.requests=false;
  assert.equal(eligibleRequestApprover(workspace,hr),false);
  assert.equal(eligibleRequestApprover(workspace,undefined),false);
  assert.equal(eligibleRequestApprover({}, {role:'Manager',status:'Active'}),true);
  assert.equal(eligibleRequestApprover({}, {role:'Employee',status:'Active'}),false);
});
test('role approval routes to any eligible holder in applicant branch and never self; grants are checked live',()=>{
 const w={staffRoles:['HR','Employee'],rolePermissions:{HR:{values:{requests:true}}},staff:[
  {id:'a',role:'HR',branchId:'men',status:'Active'},
  {id:'b',role:'HR',branchId:'men',status:'Active'},
  {id:'c',role:'HR',branchId:'women',status:'Active'},
  {id:'d',role:'HR',branchId:'women',roleBranchIds:{HR:['men','women']},status:'Active'},
  {id:'pending',role:'HR',branchId:'men',status:'Pending activation'}]};
 const r={staffId:'a',approvalSteps:['role:HR'],approvalIndex:0};
 assert.deepEqual(eligibleApprovalRoles(w),['HR']);
 assert.deepEqual(approvalStepMembers(w,r),['b','d']);
 w.staff.find(p=>p.id==='b').role='Employee';
 assert.deepEqual(approvalStepMembers(w,r),['d']);
 w.rolePermissions.HR.values.requests=false;
 assert.deepEqual(approvalStepMembers(w,r),[]);
 assert.deepEqual(eligibleApprovalRoles(w),[]);
});
