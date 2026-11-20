import test from 'node:test';
import assert from 'node:assert/strict';
import {pendingFollowUpCount,updateFollowUp} from '../public/follow-up.js';
test('follow-up badge clears when a pending document task is completed',()=>{
 const w={staff:[],documents:[{id:'d',name:'Permit',expiresOn:'2026-11-25'}]};
 assert.equal(pendingFollowUpCount(w,'2026-11-20'),1);
 updateFollowUp(w,{itemId:'document:d:2026-11-25',operation:'details',assigneeId:null,status:'completed',dueOn:null},null,'2026-11-20');
 assert.equal(pendingFollowUpCount(w,'2026-11-20'),0);
 assert.equal(pendingFollowUpCount({...w,documents:[]},'2026-11-20'),0);
});
