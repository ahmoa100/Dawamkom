import test from 'node:test';
import assert from 'node:assert/strict';
import {submitPunch,punchMessages} from '../public/punch-feedback.js';
const fixture=(extra={})=>{
 const messages=[];let sends=0;
 const options={timing:{kind:'in',allowed:true},nextPunch:'in',hasLocations:true,anywhere:false,online:true,
 locate:async()=>({coords:{latitude:28,longitude:36,accuracy:5}}),
 send:async()=>{sends++;return {ok:true,saved:true};},feedback:(message,tone)=>messages.push({message,tone}),...extra};
 return {options,messages,sends:()=>sends};
};
test('confirmed server save gives success, with progress and explicit coordinate properties',async()=>{
 let body;
 const coords=Object.create({latitude:28,longitude:36,accuracy:5});
 const x=fixture({locate:async()=>({coords}),send:async value=>{body=value;return {ok:true,saved:true};}});
 assert.equal((await submitPunch(x.options)).saved,true);
 assert.deepEqual(body,{latitude:28,longitude:36,accuracy:5,kind:'in'});
 assert.deepEqual(x.messages.map(x=>x.tone),['pending','pending','success']);
 assert.deepEqual(x.messages.at(-1).message,punchMessages.savedIn);
});
test('offline does not send, but the server records an out-of-window attempt',async()=>{
 const offline=fixture({online:false});await submitPunch(offline.options);assert.equal(offline.sends(),0);
 const x=fixture({timing:{kind:'in',allowed:false},send:async()=>({ok:false,httpStatus:400,
   error:'Outside the punch time window.',attemptRecorded:true})});
 await submitPunch(x.options);
 assert.match(x.messages.at(-1).message[1], /Attempt saved.*outside the allowed time window/);
});
test('missing arrival does not block checkout and confirmed success explains correction',async()=>{
 const x=fixture({timing:{kind:'out',allowed:true},nextPunch:'in',anywhere:true});
 assert.equal((await submitPunch(x.options)).saved,true);assert.equal(x.sends(),1);
 assert.deepEqual(x.messages.at(-1).message,punchMessages.savedOutMissingIn);
});
test('GPS failures send an attempt without coordinates and explain the recorded rejection',async()=>{
 for(const [code,key] of [[1,'locationDenied'],[2,'locationUnavailable'],[3,'locationTimeout']]){
 const x=fixture({locate:async()=>{throw {code};},send:async body=>{
   assert.equal(body.latitude,undefined);
   return {ok:false,httpStatus:400,attemptRecorded:true,error:'Your phone did not return a valid location.'};
 }});await submitPunch(x.options);assert.ok(x.messages.at(-1).message[1].endsWith(punchMessages[key][1].split(': ')[1]));}
});
test('dropped response, server failure and unconfirmed result never claim success or retry',async()=>{
 for(const send of [async()=>{throw new Error('timeout');},async()=>({ok:false,httpStatus:503}),async()=>({ok:true})]){
 let count=0;const x=fixture({send:async body=>{count++;return send(body);}});await submitPunch(x.options);assert.equal(count,1);assert.deepEqual(x.messages.at(-1).message,punchMessages.uncertain);assert.equal(x.messages.at(-1).tone,'error');}
});
test('server rejection is visible and anywhere punches skip GPS',async()=>{
 const x=fixture({anywhere:true,locate:async()=>assert.fail('GPS should be skipped'),send:async()=>({ok:false,httpStatus:400,error:'Clock in before clocking out.'})});
 await submitPunch(x.options);assert.deepEqual(x.messages.at(-1).message,punchMessages.missingIn);
 const y=fixture({timing:{kind:'out',allowed:true},nextPunch:'out',anywhere:true});await submitPunch(y.options);assert.deepEqual(y.messages.at(-1).message,punchMessages.savedOut);
});
