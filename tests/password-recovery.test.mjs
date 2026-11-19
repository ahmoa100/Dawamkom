import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,scryptSync} from 'node:crypto';
import {requestRecovery,consumeRecovery,RecoveryThrottle,recoveryError} from '../password-recovery.mjs';
import {activationEmailSent,recordActivationEmail,accountEmail} from '../public/account-email.js';
const now=Date.parse('2026-11-19T12:00:00Z'),origin='https://www.dawamkom.net',token='a'.repeat(64),password='NewSecret123!';
function fixture(){return [{id:'11111111-1111-4111-8111-111111111111',name:'Company',email:'owner@example.com',account:{salt:'owner-salt',passwordHash:'old-owner-hash',sessionHash:'owner-session',sessionExpires:now+999999},workspace:{company:'Demo',staff:[{id:'active',name:'Person',email:'person@example.com',status:'Active',account:{salt:'staff-salt',passwordHash:'old-staff-hash',browser:'approved-browser',sessionHash:'employee-session',managerSessions:['manager-session']}},{id:'pending',email:'pending@example.com',status:'Pending activation',account:{activationHash:'test'}}]}}];}
test('recovery issues private hashed tokens only for active scoped accounts, with cooldown',()=>{
 const companies=fixture(),options={now,origin,tokenFactory:()=>token};
 assert.deepEqual(requestRecovery(companies,{email:'absent@example.com'},options),[]);
 assert.deepEqual(requestRecovery(companies,{email:'pending@example.com'},options),[]);
 assert.deepEqual(requestRecovery(companies,{email:'person@example.com',kind:'company'},options),[]);
 const jobs=requestRecovery(companies,{email:' PERSON@example.com ',kind:'employee'},options);
 assert.equal(jobs.length,1);assert.equal(jobs[0].url,origin+'/reset-password#reset='+token);
 const account=companies[0].workspace.staff[0].account;
 assert.equal(account.passwordRecovery.hash,createHash('sha256').update(token).digest('hex'));
 assert.equal(account.passwordRecovery.expires,now+3600000);assert.equal(JSON.stringify(account).includes(token),false);
 assert.equal(account.passwordHash,'old-staff-hash');assert.equal(account.sessionHash,'employee-session');
 assert.deepEqual(requestRecovery(companies,{email:'person@example.com'},options),[]);
});
test('single-use reset revokes sessions but preserves employee device approval and other accounts',()=>{
 const companies=fixture();requestRecovery(companies,{email:'person@example.com'},{now,origin,tokenFactory:()=>token});
 const beforeOwner=structuredClone(companies[0].account);
 assert.throws(()=>consumeRecovery(companies,{token,password,confirmation:'different'},{now}),/متطابقتين/);
 assert.throws(()=>consumeRecovery(companies,{token,password:'weak',confirmation:'weak'},{now}));
 consumeRecovery(companies,{token,password,confirmation:password},{now:now+1000});
 const account=companies[0].workspace.staff[0].account;
 assert.equal(account.passwordHash,scryptSync(password,account.salt,64).toString('hex'));
 assert.equal(account.browser,'approved-browser');assert.equal(account.sessionHash,null);assert.deepEqual(account.managerSessions,[]);
 assert.equal(account.passwordRecovery,undefined);assert.deepEqual(companies[0].account,beforeOwner);
 assert.throws(()=>consumeRecovery(companies,{token,password,confirmation:password},{now:now+2000}),new RegExp(recoveryError));
});
test('expired tokens and changes to email, password, status or company access invalidate recovery',()=>{
 for(const change of [(c)=>{c[0].workspace.staff[0].email='other@example.com';},(c)=>{c[0].workspace.staff[0].account.passwordHash='changed';},(c)=>{c[0].workspace.staff[0].status='Removed';},(c)=>{c[0].suspended=true;},()=>{}]){
  const companies=fixture();requestRecovery(companies,{email:'person@example.com'},{now,origin,tokenFactory:()=>token});change(companies);
  assert.throws(()=>consumeRecovery(companies,{token,password,confirmation:password},{now:change.toString()==='()=>{}'?now+3600000:now+1000}));
 }
});
test('owner recovery is scoped, follows the same password policy, and caps email requests',()=>{
 const companies=fixture();const jobs=requestRecovery(companies,{email:'owner@example.com',kind:'company',companyId:companies[0].id},{origin,now,tokenFactory:()=>token});
 assert.equal(jobs.length,1);consumeRecovery(companies,{token,password,confirmation:password},{now:now+1});assert.equal(companies[0].account.sessionHash,null);
 const repeated=fixture();for(let i=0;i<3;i++)assert.equal(requestRecovery(repeated,{email:'person@example.com'},{origin,now:now+i*300001,tokenFactory:()=>token}).length,1);
 assert.equal(requestRecovery(repeated,{email:'person@example.com'},{origin,now:now+900003,tokenFactory:()=>token}).length,0);
 const limit=new RecoveryThrottle();for(let i=0;i<10;i++)assert.equal(limit.allow('ip',now),true);assert.equal(limit.allow('ip',now),false);assert.equal(limit.allow('ip',now+900000),true);
});
test('sent activation badges follow the exact invitation and email; templates escape personal data and place the logo left of the title',()=>{
 const account={activationHash:'a'};recordActivationEmail(account,' USER@example.com ');assert.equal(activationEmailSent(account,'user@example.com'),true);
 assert.equal(activationEmailSent(account,'other@example.com'),false);account.activationHash='b';assert.equal(activationEmailSent(account,'user@example.com'),false);
 account.passwordHash='activated';assert.equal(recordActivationEmail(account,'user@example.com'),false);
 const markup=accountEmail({title:'Reset',name:'<img>',text:'<script>',url:origin+'/reset-password#reset='+token});
 assert.match(markup, /<td align="right" valign="middle"><h1/);
 assert.match(markup, /<td align="left" valign="middle" width="64"[^>]*><img[^>]*alt="شعار دوامكم"/);
 assert.ok(markup.includes('&lt;img&gt;'));assert.ok(!markup.includes('<script>'));
});
