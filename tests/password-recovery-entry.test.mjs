import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

for(const pathname of ['/forgot-password','/reset-password'])test(`${pathname} returns every account type to global email discovery`,()=>{
 const elements=new Map();
 const document={documentElement:{},getElementById:id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id);}};
 vm.runInNewContext(readFileSync(new URL('../public/password-recovery.js',import.meta.url),'utf8'),{
  document,URLSearchParams,location:{pathname,search:'?company=11111111-1111-4111-8111-111111111111&kind=employee',hash:''},
  history:{replaceState(){}},localStorage:{getItem(){return null;}},
 });
 assert.equal(elements.get('recovery-back').href,'/?signed-out=1');
});
