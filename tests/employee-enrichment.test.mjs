import test from 'node:test';
import assert from 'node:assert/strict';
import {enrichmentPlan,enrichmentPatch} from '../public/employee-enrichment.js';
const staff=[{id:'a',nameAr:'Existing',email:'a@example.com',identityNumber:'1234567890',status:'Active',salary:{monthlyBase:0,monthlyAllowances:0},annualLeaveDays:0,probationDays:0},{id:'b',email:'b@example.com',identityNumber:'2345678901',status:'Active'}];
test('additional imports require unambiguous strong identifiers and never match by name alone',()=>{
 assert.equal(enrichmentPlan(staff,{nameAr:'Existing'}).status,'unmatched');
 assert.equal(enrichmentPlan(staff,{email:' A@EXAMPLE.COM ',identityNumber:'١٢٣٤٥٦٧٨٩٠',phone:'0530000000'}).staffId,'a');
 assert.equal(enrichmentPlan(staff,{email:'b@example.com',identityNumber:'1234567890'}).status,'ambiguous');
 assert.equal(enrichmentPlan(staff,{email:'changed@example.com',identityNumber:'1234567890'}).status,'conflict');
 assert.equal(enrichmentPlan([...staff,{...staff[0],id:'c'}],{email:'a@example.com'}).status,'ambiguous');
});
test('additional imports fill selected missing fields, preserve existing values including zeros, and reject stale previews',()=>{
 const source={email:'a@example.com',nameAr:'Replacement',phone:'0530000000',salary:'5000',allowances:'1000',annualLeave:'21',probation:'90'};
 const plan=enrichmentPlan(staff,source);assert.deepEqual(plan.changes,{phone:'0530000000'});
 assert.deepEqual(enrichmentPatch(staff,{staffId:'a',source,fields:['phone']}),{staffId:'a',phone:'0530000000'});
 assert.throws(()=>enrichmentPatch(staff,{staffId:'b',source,fields:['phone']}),/match/);
 assert.throws(()=>enrichmentPatch(staff,{staffId:'a',source,fields:['salary']}),/changed/);
 assert.throws(()=>enrichmentPatch([{...staff[0],phone:'0540000000'}],{staffId:'a',source,fields:['phone']}),/changed/);
 assert.throws(()=>enrichmentPatch(staff,{staffId:'a',source:{...source,role:'Manager'},fields:['phone']}),/valid/);
 assert.throws(()=>enrichmentPatch(staff,{staffId:'a',source,fields:['role']}),/valid/);
});
