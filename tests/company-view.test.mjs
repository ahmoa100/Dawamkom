import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';

test('super-admin company view is temporary, bound to the admin and company, and preserves owner credentials',async()=>{
 const root=path.resolve(import.meta.dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'dawamkom-company-view-'));
 for(const f of fs.readdirSync(root).filter(f=>f.endsWith('.mjs')))fs.copyFileSync(path.join(root,f),path.join(dir,f));
 fs.cpSync(path.join(root,'public'),path.join(dir,'public'),{recursive:true});
 const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
 const ownerToken='a'.repeat(64),ownerHash=createHash('sha256').update(ownerToken).digest('hex');
 const partners=ids.map((id,i)=>({id,name:'Company '+i,email:'owner'+i+'@example.com',suspended:i===2,
  account:{passwordHash:'unchanged-private-hash',sessionHash:ownerHash,sessionExpires:Date.now()+3600000},
  workspace:{company:'Company '+i,slug:id,staff:[],locations:[],workSchedule:{days:[]},workPeriods:[],workAssignments:[],punches:[],requests:[],leaveTypes:[],staffRoles:[]}}));
 const file=path.join(dir,'.dawamkom-partners.json');fs.writeFileSync(file,JSON.stringify({partners,profile:{name:'QA'},demoCompanyStatus:'deleted'}));
 // Mock Google's network responses only in this isolated test process; use the real OAuth/session implementation.
 fs.writeFileSync(path.join(dir,'start-test.mjs'),`const original=globalThis.fetch;globalThis.fetch=async(input,options)=>{
 const url=String(input);if(url==='https://oauth2.googleapis.com/token')return Response.json({access_token:'test-only'});
 if(url==='https://openidconnect.googleapis.com/v1/userinfo')return Response.json({email_verified:true,email:'ahmoa100@gmail.com'});
 return original(input,options);};await import('./server.mjs');`);
 const env={...process.env,PORT:'0',DAWAMAK_HOST:'0.0.0.0',DAWAMAK_RUNTIME_MODE:'preview'};
 for(const k of Object.keys(env))if(/AWS|STORAGE|SES|MAIL|OAUTH|GOOGLE|PUSH|VAPID|BOOTSTRAP|SAMPLE/.test(k)||k==='DAWAMAK_PORT')delete env[k];
 Object.assign(env,{DAWAMAK_GOOGLE_CLIENT_ID:'test-client',DAWAMAK_GOOGLE_CLIENT_SECRET:'test-secret',DAWAMAK_PUBLIC_ORIGIN:'https://www.dawamkom.net'});
 const child=spawn(process.execPath,['start-test.mjs'],{cwd:dir,env,stdio:['ignore','pipe','pipe']});
 try{
  const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server timeout')),12000);child.stdout.on('data',c=>{const m=String(c).match(/port (\d+)/);if(m){clearTimeout(timer);resolve(m[1]);}});child.on('exit',c=>{clearTimeout(timer);reject(Error('Server exit '+c));});});
  const base='http://127.0.0.1:'+port;
  const cookie=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
  const login=async()=>{
   const start=await fetch(base+'/admin?next=super-admin',{redirect:'manual'});
   const state=new URL(start.headers.get('location')).searchParams.get('state');
   const done=await fetch(base+'/admin/google/callback?code=test&state='+state,{redirect:'manual',headers:{Cookie:cookie(start)}});
   assert.equal(done.status,303);return cookie(done).split('; ').find(c=>c.startsWith('dawamkom_admin='));
  };
  const post=(url,body,credentials='',origin='https://www.dawamkom.net')=>fetch(base+url,{method:'POST',redirect:'manual',headers:{Cookie:credentials,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const view=(id,credentials,origin)=>post('/api/partners',{operation:'view',id},credentials,origin);
  assert.equal((await view(ids[0],'')).status,403);
  assert.equal((await view(ids[0],'dawamkom_company='+ownerToken)).status,403);
  const admin=await login(),otherAdmin=await login();
  assert.equal((await view(ids[0],admin,'https://evil.example')).status,403);
  assert.equal((await view(ids[2],admin)).status,404);
  const started=await view(ids[0],admin);assert.equal(started.status,200);
  assert.deepEqual(await started.json(),{url:'/company/'+ids[0]+'/'});
  const attributes=started.headers.get('set-cookie');assert.match(attributes,/HttpOnly; Secure; SameSite=Strict; Max-Age=1800/);
  assert.ok(attributes.includes('Path=/company/'+ids[0]+'/'));
  const access=cookie(started),credentials=admin+'; '+access;
  const statePath='/company/'+ids[0]+'/api/state';
  const read=credentials=>fetch(base+statePath,{headers:{Cookie:credentials}});
  assert.equal((await read(access)).status,401);
  assert.equal((await read(otherAdmin+'; '+access)).status,401);
  assert.equal((await fetch(base+'/company/'+ids[1]+'/api/state',{headers:{Cookie:credentials}})).status,401);
  const state=await(await read(credentials)).json();assert.equal(state.isCompanyOwner,true);assert.equal(state.companyView,true);
  assert.ok(!JSON.stringify(state).includes('unchanged-private-hash'));
  assert.equal((await post('/company/'+ids[0]+'/api/setup-guide',{step:0},credentials)).status,200);
  const logout=await post('/company/'+ids[0]+'/logout',{},credentials);
  assert.equal(logout.status,303);assert.equal(logout.headers.get('location'),'/super-admin#partners');
  assert.equal((await read(credentials)).status,401);
  assert.equal((await read('dawamkom_company='+ownerToken)).status,200);
  const saved=JSON.parse(fs.readFileSync(file,'utf8')).partners[0];
  assert.equal(saved.account.passwordHash,'unchanged-private-hash');assert.equal(saved.account.sessionHash,ownerHash);
  assert.equal(saved.account.adminViewHistory.length,1);
  const second=await view(ids[0],admin);const secondAccess=cookie(second);
  await post('/admin/logout',{},admin);
  assert.equal((await read(admin+'; '+secondAccess)).status,401);
 }finally{child.kill();await new Promise(resolve=>child.once('close',resolve));assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.ok(path.basename(dir).startsWith('dawamkom-company-view-'));fs.rmSync(dir,{recursive:true,force:true});}
});
