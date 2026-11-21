import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash,scryptSync} from 'node:crypto';
import {permissionsFor} from '../public/role-permissions.js';

test('owner alone delegates permission distribution; delegates edit company roles and lose access immediately after revocation',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dawamkom-role-delegation-')),root=path.resolve(import.meta.dirname,'..');
 for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.mjs')))fs.copyFileSync(path.join(root,file),path.join(dir,file));
 fs.cpSync(path.join(root,'public'),path.join(dir,'public'),{recursive:true});
 const id='11111111-1111-4111-8111-111111111111',owner='a'.repeat(64),delegate='b'.repeat(64),ordinary='c'.repeat(64),hash=v=>createHash('sha256').update(v).digest('hex');
 const account=t=>({salt:'salt',passwordHash:scryptSync('PreviousPass123!','salt',64).toString('hex'),sessionHash:hash(t),sessionExpires:Date.now()+3600000,browser:hash(t),employeeSessionExpires:Date.now()+3600000});
 const workspace={company:'Demo',slug:id,staffRoles:['Manager','Employee','HR'],jobTitles:[],staff:[{id:'hr',name:'HR',email:'hr@example.com',role:'HR',branchId:'a',status:'Active',account:account(delegate)},{id:'manager',name:'Manager',email:'manager@example.com',role:'Manager',branchId:'a',status:'Active',account:account(ordinary)},{id:'staff',name:'Other branch',email:'staff@example.com',role:'Employee',branchId:'b',status:'Active'}],locations:[{id:'a',name:'A'},{id:'b',name:'B'}],requests:[],punches:[],workSchedule:{days:[]},workPeriods:[],workAssignments:[],leaveTypes:[]};
 fs.writeFileSync(path.join(dir,'.dawamkom-partners.json'),JSON.stringify({partners:[{id,name:'Demo',email:'owner@example.com',account:account(owner),workspace}],profile:{name:'Demo'},demoCompanyStatus:'deleted'}));
 const env={...process.env,PORT:'0',DAWAMAK_HOST:'127.0.0.1',DAWAMAK_RUNTIME_MODE:'live'};
 for(const k of Object.keys(env))if(/AWS|STORAGE|SES|MAIL|OAUTH|GOOGLE|VAPID|PUSH|BOOTSTRAP|SAMPLE/.test(k)||k==='DAWAMAK_PORT')delete env[k];
 const child=spawn(process.execPath,['server.mjs'],{cwd:dir,env,stdio:['ignore','pipe','pipe']});
 try{
  const port=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Server timeout')),15000);child.stdout.on('data',v=>{const m=String(v).match(/port (\d+)/);if(m){clearTimeout(timeout);resolve(m[1]);}});child.on('exit',c=>{clearTimeout(timeout);reject(Error('Server exited '+c));});});
  const base='http://127.0.0.1:'+port+'/company/'+id;
  const cookies={owner:'dawamkom_company='+owner,delegate:'dawamkom_employee='+delegate+'; dawamkom_employee_session='+delegate,ordinary:'dawamkom_employee='+ordinary+'; dawamkom_employee_session='+ordinary};
  const post=(who,body)=>fetch(base+'/api/role-permissions',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookies[who]},body:JSON.stringify(body)});
  const enrich=(who,body)=>fetch(base+'/api/staff/enrich',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookies[who]},body:JSON.stringify(body)});
  const extra={staffId:'staff',source:{email:'staff@example.com',phone:'0530000000'},fields:['phone']};
  assert.equal((await enrich('ordinary',extra)).status,403);
  assert.equal((await enrich('owner',{...extra,source:{email:'staff@example.com',phone:'invalid'}})).status,400);
  assert.equal((await enrich('owner',extra)).status,200);
  assert.equal((await enrich('owner',extra)).status,400);
  assert.equal((await enrich('owner',{...extra,staffId:'manager'})).status,400);
  const enriched=await(await fetch(base+'/api/state',{headers:{Cookie:cookies.owner}})).json();assert.equal(enriched.staff.length,3);assert.equal(enriched.staff.find(p=>p.id==='staff').phone,'0530000000');assert.deepEqual(enriched.staff.find(p=>p.id==='staff').enrichmentHistory[0].fields,['phone']);
  const hr={role:'HR',expectedVersion:0,values:permissionsFor(workspace,'HR'),managePermissions:true};
  assert.equal((await post('ordinary',hr)).status,403);
  assert.equal((await post('delegate',hr)).status,401);
  assert.equal((await post('owner',hr)).status,200);
  const loaded=await(await fetch(base+'/api/state',{headers:{Cookie:cookies.delegate}})).json();
  assert.equal(loaded.canManageRolePermissions,true);assert.equal(loaded.isCompanyOwner,false);assert.equal(loaded.staff.some(s=>s.id==='staff'),false);
  const employeeValues=permissionsFor(workspace,'Employee');employeeValues.reports=true;
  const target={role:'Employee',expectedVersion:0,administrator:false,values:employeeValues};
  const edited=await post('delegate',target);assert.equal(edited.status,200);const result=await edited.json();assert.equal(result.isCompanyOwner,false);assert.equal(result.rolePermissions.Employee.values.reports,true);
  assert.equal((await post('delegate',{...target,expectedVersion:1,managePermissions:true})).status,403);
  assert.equal((await post('delegate',{...hr,expectedVersion:1,managePermissions:false})).status,403);
  assert.equal((await post('delegate',target)).status,400);
  assert.equal((await post('owner',{...hr,expectedVersion:1,managePermissions:false})).status,200);
  assert.equal((await post('delegate',{...target,expectedVersion:1})).status,401);
 }finally{child.kill();await new Promise(resolve=>child.once('close',resolve));assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.ok(path.basename(dir).startsWith('dawamkom-role-delegation-'));fs.rmSync(dir,{recursive:true,force:true});}
});
