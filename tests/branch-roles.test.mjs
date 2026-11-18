import test from 'node:test';
import assert from 'node:assert/strict';
import {assignBranchRole,roleBranches,managesBranch} from '../public/branch-roles.js';
const fixture=()=>({locations:[{id:'a'},{id:'b'}],staffRoles:['Manager','Employee'],staff:[
{id:'m',role:'Manager',branchId:'a'}, {id:'s',role:'Employee',branchId:'b'}]});
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
