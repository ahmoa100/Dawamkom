import test from 'node:test';
import assert from 'node:assert/strict';
import {eligibleRequestApprover} from '../public/role-permissions.js';

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
