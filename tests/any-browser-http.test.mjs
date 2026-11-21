import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash,scryptSync} from 'node:crypto';
import {permissionsFor,hasAdministration} from '../public/role-permissions.js';

test('any-browser role permission controls sign-in, revokes extra sessions, and grants no administration',async()=>{
 const root=path.resolve(import.meta.dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'dawamkom-any-browser-'));
 for(const f of fs.readdirSync(root).filter(f=>f.endsWith('.mjs')))fs.copyFileSync(path.join(root,f),path.join(dir,f));
 fs.cpSync(path.join(root,'public'),path.join(dir,'public'),{recursive:true});
 const hash=t=>createHash('sha256').update(t).digest('hex'),owner='f'.repeat(64),browser='a'.repeat(64),oldSession='b'.repeat(64),password='FictionalPass123!';
 const account={salt:'fixture-salt',passwordHash:scryptSync(password,'fixture-salt',64).toString('hex')};
 const id='11111111-1111-4111-8111-111111111111';
 const person={id:'employee',name:'Fictional',email:'fictional@example.com',role:'Employee',jobTitle:'مدير عام',status:'Active',branchId:'a',account:{...account,browser:hash(browser),sessionHash:hash(oldSession),employeeSessionExpires:Date.now()+3600000}};
 const w={company:'Fictional',slug:id,staff:[person],staffRoles:['Employee','Manager'],jobTitles:[],locations:[{id:'a',name:'A'}],workSchedule:{days:[0,1,2,3,4,6]},workPeriods:[],workAssignments:[],requests:[],punches:[],leaveTypes:[]};
 assert.equal(permissionsFor(w,'Employee').anyBrowser,false);assert.equal(permissionsFor(w,'Manager').anyBrowser,true);
 const file=path.join(dir,'.dawamkom-partners.json');
 fs.writeFileSync(file,JSON.stringify({partners:[{id,name:'Fictional',email:'owner@example.com',account:{...account,sessionHash:hash(owner),sessionExpires:Date.now()+3600000},workspace:w}],profile:{name:'QA'},demoCompanyStatus:'deleted'}));
 const env={...process.env,PORT:'0',DAWAMAK_HOST:'127.0.0.1',DAWAMAK_RUNTIME_MODE:'live'};
 for(const k of Object.keys(env))if(/AWS|STORAGE|SES|MAIL|OAUTH|GOOGLE|VAPID|PUSH|BOOTSTRAP|SAMPLE/.test(k)||k==='DAWAMAK_PORT')delete env[k];
 const child=spawn(process.execPath,['server.mjs'],{cwd:dir,env,stdio:['ignore','pipe','pipe']});
 try{
  const port=await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Timeout')),15000);child.stdout.on('data',v=>{const m=String(v).match(/port (\d+)/);if(m){clearTimeout(t);resolve(m[1]);}});child.on('exit',c=>{clearTimeout(t);reject(Error('Exit '+c));});});
  const base='http://127.0.0.1:'+port+'/company/'+id;
  const call=(route,cookie='',body)=>fetch(base+'/api/'+route,{method:body?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const credentials={email:person.email,password};
  assert.equal((await call('employee/login','',credentials)).status,403);
  const values={...permissionsFor(w,'Employee'),anyBrowser:true};
  assert.equal((await call('role-permissions','dawamkom_company='+owner,{role:'Employee',expectedVersion:0,values})).status,200);
  const loaded=JSON.parse(fs.readFileSync(file)).partners[0].workspace;
  assert.equal(hasAdministration(loaded,loaded.staff[0]),false);
  const login=await call('employee/login','',credentials);assert.equal(login.status,200);assert.equal((await login.json()).approved,true);
  const cookies=login.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
  assert.equal((await call('employee/session',cookies)).status,200);
  assert.notEqual((await call('state',cookies)).status,200);
  const denied={...values,anyBrowser:false};
  assert.equal((await call('role-permissions','dawamkom_company='+owner,{role:'Employee',expectedVersion:1,values:denied})).status,200);
  assert.equal((await call('employee/session',cookies)).status,401);
  assert.equal((await call('employee/login','',credentials)).status,403);
  assert.equal((await call('employee/login','dawamkom_employee='+browser,credentials)).status,200);
  const saved=JSON.parse(fs.readFileSync(file)).partners[0].workspace.staff[0].account;
  assert.equal(saved.managerSessions,undefined);assert.equal(saved.browser,hash(browser));
 }finally{child.kill();await new Promise(r=>child.once('close',r));assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.ok(path.basename(dir).startsWith('dawamkom-any-browser-'));fs.rmSync(dir,{recursive:true,force:true});}
});
