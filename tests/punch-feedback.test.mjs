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
test('offline, missing clock-in, and disallowed time never send a punch',async()=>{
 for(const [extra,key] of [[{online:false},'offline'],[{timing:{kind:'out',allowed:true}},'missingIn'],[{timing:{kind:'in',allowed:false}},'outside']]){
 const x=fixture(extra);await submitPunch(x.options);assert.equal(x.sends(),0);assert.deepEqual(x.messages.at(-1).message,punchMessages[key]);}
});
test('GPS denial, unavailable location and timeout explain why punch was not sent',async()=>{
 for(const [code,key] of [[1,'locationDenied'],[2,'locationUnavailable'],[3,'locationTimeout']]){
 const x=fixture({locate:async()=>{throw {code};}});await submitPunch(x.options);assert.equal(x.sends(),0);assert.deepEqual(x.messages.at(-1).message,punchMessages[key]);}
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
