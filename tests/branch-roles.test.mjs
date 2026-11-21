import test from 'node:test';
import assert from 'node:assert/strict';
import {assignBranchRole,roleBranches,managesBranch,eligibleDirectManager} from '../public/branch-roles.js';
const fixture=()=>({locations:[{id:'a'},{id:'b'}],staffRoles:['Manager','Employee'],staff:[
{id:'m',role:'Manager',branchId:'a'}, {id:'s',role:'Employee',branchId:'b'}]});
test('direct managers include active custom administrators serving the employee branch, excluding self and other branches',()=>{
 const w={rolePermissions:{HR:{administrator:true}}},p={id:'hr',role:'HR',status:'Active',branchId:'b',roleBranchIds:{HR:['a','b']}};
 assert.equal(eligibleDirectManager(w,p,'a','employee'),true);
 assert.equal(eligibleDirectManager(w,p,'a','hr'),false);
 assert.equal(eligibleDirectManager(w,p,'c','employee'),false);
 assert.equal(eligibleDirectManager(w,p,undefined,'employee'),false);
 assert.equal(eligibleDirectManager(w,{...p,status:'Pending activation'},'a','employee'),false);
 assert.equal(eligibleDirectManager(w,{...p,role:'Employee'},'b','employee'),false);
});
test('administrator branches save independently without changing the employee home branch',()=>{
 const w=fixture();assignBranchRole(w,'Manager',[{branchId:'a',staffIds:['m']},{branchId:'b',staffIds:['m']}]);
 assert.deepEqual(roleBranches(w.staff[0]),['a','b']);assert.equal(w.staff[0].branchId,'a');
 assert.equal(managesBranch(w.staff[0],'b'),true);assert.equal(managesBranch(w.staff[0],'other'),false);
 assignBranchRole(w,'Manager',[{branchId:'a',staffIds:[]},{branchId:'b',staffIds:['m']}]);
 assert.deepEqual(roleBranches(w.staff[0]),['b']);assert.equal(w.staff[0].role,'Manager');
});
test('ordinary staff cannot be assigned through another branch and removed access does not fall back',()=>{
 const w=fixture();assert.throws(()=>assignBranchRole(w,'Manager',[{branchId:'a',staffIds:['s']}]));
 assignBranchRole(w,'Manager',[{branchId:'a',staffIds:[]},{branchId:'b',staffIds:[]}]);
 assert.equal(w.staff[0].role,'Employee');assert.deepEqual(roleBranches(w.staff[0],'Manager'),[]);
 assert.throws(()=>assignBranchRole(w,'Manager',[{branchId:'missing',staffIds:[]}]));
});
