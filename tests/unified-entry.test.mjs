import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const companySource=readFileSync(new URL('../public/company-auth.js',import.meta.url),'utf8');
for(const [action,email,expected,search=''] of [['login','',true],['access','',true],['access','owner@example.com',false],['activate','',false],['access','',false,'?view=documents']])test(`company ${action}${search} with ${email?'discovered':'no'} email opens the expected sign-in screen`,()=>{
 let redirect;
 const form={dataset:{action},hidden:action!=='activate',elements:{email:{value:''}},querySelector:()=>({}),addEventListener(){}};
 const context={URLSearchParams,document:{querySelector:s=>s==='#company-auth'?form:s==='#company-access-email'?{}:null},location:{pathname:'/company/11111111-1111-4111-8111-111111111111/'+action,search,replace:v=>redirect=v},sessionStorage:{getItem:()=>email,removeItem(){}}};
 vm.runInNewContext(companySource,context);
 assert.equal(Boolean(redirect),expected);
 if(expected)assert.equal(redirect,'/?signed-out=1');else assert.equal(form.hidden,false);
});
const employeeSource=readFileSync(new URL('../public/employee.js',import.meta.url),'utf8');
const show=employeeSource.slice(employeeSource.indexOf('async function show(forceLogin'),employeeSource.indexOf('async function authenticate('));
for(const unavailable of [false,true])test(`legacy employee entry ${unavailable?'retains context during outage':'returns expired session to email discovery'}`,async()=>{
 let redirect;
 const fields=new Map();
 const context={invitationLoad:0,token:null,employeeLanguage:'ar',form:{},status:{},dashboard:{},session:null,documentNotices:{update(){}},
  $:id=>{if(!fields.has(id))fields.set(id,{});return fields.get(id);},tr:v=>v,
  document:{documentElement:{classList:{add(){},remove(){}}}},
  location:{pathname:'/company/11111111-1111-4111-8111-111111111111/employee',replace:v=>redirect=v},
  api:async()=>{if(unavailable)throw Error('Unavailable');return {ok:false,httpStatus:401};}};
 vm.runInNewContext(show+';globalThis.done=show();',context);
 if(unavailable)await assert.rejects(context.done);else await context.done;
 assert.equal(redirect,unavailable?undefined:'/?signed-out=1');
});
