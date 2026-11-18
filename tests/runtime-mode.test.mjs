import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {runtimePolicy} from '../runtime-mode.mjs';

test('default live mode preserves writes and deliveries; unsupported modes fail closed',()=>{
  const live=runtimePolicy({});assert.equal(live.writes,true);assert.equal(live.delivery,true);assert.equal(live.background,true);
  assert.equal(live.permits('POST','/api/employee/punch'),true);
  assert.throws(()=>runtimePolicy({DAWAMAK_RUNTIME_MODE:'typo'}));
});
test('preview requires its isolated storage object and never enables outbound delivery or schedulers',()=>{
  assert.throws(()=>runtimePolicy({DAWAMAK_RUNTIME_MODE:'preview',DAWAMAK_STORAGE_BUCKET:'bucket',DAWAMAK_STORAGE_KEY:'dawamkom/state.json'}));
  const preview=runtimePolicy({DAWAMAK_RUNTIME_MODE:'preview',DAWAMAK_STORAGE_BUCKET:'bucket',DAWAMAK_STORAGE_KEY:'migration/preview-state.json'});
  assert.equal(preview.writes,true);assert.equal(preview.delivery,false);assert.equal(preview.background,false);
});
test('standby blocks mutations and maintenance blocks app reads too, while health remains available',()=>{
  const standby=runtimePolicy({DAWAMAK_RUNTIME_MODE:'standby'}),maintenance=runtimePolicy({DAWAMAK_RUNTIME_MODE:'maintenance'});
  for(const mode of [standby,maintenance]) {
    assert.equal(mode.writes,false);assert.equal(mode.delivery,false);assert.equal(mode.background,false);
    for(const verb of ['POST','PUT','PATCH','DELETE'])assert.equal(mode.permits(verb,'/api/employee/punch'),false);
    assert.equal(mode.permits('GET','/health'),true);
  }
  assert.equal(standby.permits('GET','/api/state'),true);
  assert.equal(maintenance.permits('GET','/api/state'),false);
});
test('preview native and web push do not contact a delivery provider',()=>{
  const script=`let calls=0; globalThis.fetch=async()=>{calls++;throw Error('Unexpected delivery');};
    const {notifyAttendance,notifyApproval}=await import('./push.mjs');
    const account={nativePushTokens:[{token:'ExpoPushToken[abcdefghijklmno]'}],pushSubscriptions:[{endpoint:'https://fcm.googleapis.com/test'}]};
    await notifyAttendance(account,'/company/test',{id:'test',bodyAr:'QA',bodyEn:'QA'});
    await notifyApproval(account,'/company/test','request'); console.log(calls);`;
  const env={...process.env,DAWAMAK_RUNTIME_MODE:'preview'};
  delete env.DAWAMAK_STORAGE_BUCKET;
  assert.equal(execFileSync(process.execPath,['--input-type=module','-e',script],{cwd:new URL('..',import.meta.url),env,encoding:'utf8'}).trim(),'0');
});
test('standby persistence is fenced even outside HTTP routing',()=>{
  const script=`const {assertRuntimeWrite}=await import('./runtime-mode.mjs');try{assertRuntimeWrite();process.exit(1);}catch(e){console.log(e.code);}`;
  assert.equal(execFileSync(process.execPath,['--input-type=module','-e',script],{cwd:new URL('..',import.meta.url),
    env:{...process.env,DAWAMAK_RUNTIME_MODE:'standby'},encoding:'utf8'}).trim(),'READ_ONLY');
});
