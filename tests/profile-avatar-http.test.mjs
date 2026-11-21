import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';import {createHash} from 'node:crypto';
test('employee avatar persists on employee session even with simultaneous owner cookie and survives reload',async()=>{
 const root=path.resolve(import.meta.dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'dawamkom-avatar-'));
 for(const f of fs.readdirSync(root).filter(f=>f.endsWith('.mjs')))fs.copyFileSync(path.join(root,f),path.join(dir,f));fs.cpSync(path.join(root,'public'),path.join(dir,'public'),{recursive:true});
 const id='11111111-1111-4111-8111-111111111111',owner='a'.repeat(64),staff='b'.repeat(64),hash=v=>createHash('sha256').update(v).digest('hex');
 const account=t=>({passwordHash:'fixture',sessionHash:hash(t),sessionExpires:Date.now()+3600000,browser:hash(t),employeeSessionExpires:Date.now()+3600000});
 const workspace={company:'Fictional',staffRoles:['Employee'],jobTitles:[],staff:[{id:'s',name:'Fictional',role:'Employee',status:'Active',account:account(staff)}],locations:[],requests:[],punches:[],workPeriods:[],workAssignments:[],leaveTypes:[]};
 const stateFile=path.join(dir,'.dawamkom-partners.json');fs.writeFileSync(stateFile,JSON.stringify({partners:[{id,name:'Fictional',email:'owner@example.com',account:account(owner),workspace}],profile:{name:'Fictional'},demoCompanyStatus:'deleted'}));
 const env={...process.env,PORT:'0',DAWAMAK_HOST:'127.0.0.1',DAWAMAK_RUNTIME_MODE:'live'};for(const k of Object.keys(env))if(/AWS|STORAGE|SES|MAIL|OAUTH|GOOGLE|VAPID|PUSH|BOOTSTRAP|SAMPLE/.test(k)||k==='DAWAMAK_PORT')delete env[k];
 const child=spawn(process.execPath,['server.mjs'],{cwd:dir,env,stdio:['ignore','pipe','pipe']});
 try{
 const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('startup timeout')),15000);child.stdout.on('data',v=>{const m=String(v).match(/port (\d+)/);if(m){clearTimeout(timer);resolve(m[1]);}});child.on('exit',c=>reject(Error('exit '+c)));});
 const base=`http://127.0.0.1:${port}/company/${id}`;
 const cookie=`dawamkom_company=${owner}; dawamkom_employee=${staff}; dawamkom_employee_session=${staff}`;
 const photo='data:image/jpeg;base64,/9j/AA==';
 const response=await fetch(base+'/api/employee/avatar',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({photo})});assert.equal(response.status,200);assert.equal((await response.json()).saved,true);
 const session=await(await fetch(base+'/api/employee/session',{headers:{Cookie:cookie}})).json();assert.equal(session.photo,photo);
 const saved=JSON.parse(fs.readFileSync(stateFile)).partners[0];assert.equal(saved.workspace.staff[0].photo,photo);assert.equal(saved.account.photo,undefined);
 const invalid=await fetch(base+'/api/employee/avatar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({photo})});assert.equal(invalid.status,401);
 }finally{child.kill();await new Promise(resolve=>child.once('exit',resolve));fs.rmSync(dir,{recursive:true,force:true});}
});
