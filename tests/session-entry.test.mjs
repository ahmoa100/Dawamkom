import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/workspace-login.js',import.meta.url),'utf8');
const resume=source.slice(source.indexOf('async function resumeWorkspace()'));
const path='/company/11111111-1111-4111-8111-111111111111/employee';
async function check(response){
 const result={removed:false,visible:false,redirect:null};
 const context={localStorage:{getItem:()=>path,removeItem:()=>result.removed=true},fetch:async()=>{if(response instanceof Error)throw response;return response;},AbortSignal,input:{value:''},search:undefined,location:{replace:value=>result.redirect=value},document:{documentElement:{classList:{remove:()=>result.visible=true}}}};
 vm.runInNewContext(resume.replace('void resumeWorkspace();','globalThis.finished=resumeWorkspace();'),context);
 await context.finished;return result;
}
test('remembered session redirects without exposing the entry form',async()=>{
 assert.deepEqual(await check({ok:true,status:200}),{removed:false,visible:false,redirect:path});
});
test('expired session reveals sign-in and clears only its remembered destination',async()=>{
 assert.deepEqual(await check({ok:false,status:401}),{removed:true,visible:true,redirect:null});
});
test('temporary failures retain remembered session and make sign-in usable',async()=>{
 for(const response of [new Error('offline'),{ok:false,status:503}])assert.deepEqual(await check(response),{removed:false,visible:true,redirect:null});
});
test('entry shell suppresses form before module/session request runs',()=>{
 const html=readFileSync(new URL('../public/workspace-login.html',import.meta.url),'utf8');
 assert.ok(html.indexOf("classList.add('session-restoring')")<html.indexOf('<body'));
 assert.match(html,/session-restoring #workspace-search/);
});
