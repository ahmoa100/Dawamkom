import test from 'node:test';
import assert from 'node:assert/strict';
import {expiryCandidates} from '../public/document-reader.js';
import {followUpItems,assignFollowUp} from '../public/follow-up.js';
test('expiry suggestions accept Arabic digits and valid dates without guessing Hijri conversion',()=>{
 assert.equal(expiryCandidates('تاريخ الانتهاء: ٢٠٢٧/١٢/٣١')[0].date,'2027-12-31');
 assert.equal(expiryCandidates('Expiry date: 2027-12-31')[0].labelled,true);
 assert.equal(expiryCandidates('انتهاء: 1448/02/15').length,0);
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
 assert.equal(followUpItems({...w,staff:[{...person,residencyExpiryDate:'2027-01-01'}]},'2026-11-20').filter(i=>i.kind==='residence').length,0);
});
