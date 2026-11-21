import test from 'node:test';
import assert from 'node:assert/strict';
import {documentAlerts,documentNoticeDue} from '../public/document-alerts.js';
import {followUpItems} from '../public/follow-up.js';

test('document recipients honor administrator classification, enabled scope, expiry and minimal metadata',()=>{
 const manager={id:'m',role:'Manager',status:'Active',branchId:'a'},other={id:'o',role:'HR',status:'Active',branchId:'b'},staff={id:'e',role:'Employee',status:'Active',branchId:'a'};
 const w={staff:[manager,other,staff],rolePermissions:{HR:{administrator:true}},notificationPreferences:{documents:true},notificationSettings:{documentRecipients:['m'],documentAlertMode:'prominent'},documents:[{id:'d',name:'Licence',expiresOn:'2026-11-25',data:'private-file'},{id:'later',expiresOn:'2027-01-01'}]};
 const alerts=documentAlerts(w,'2026-11-21',manager);assert.equal(alerts.length,1);assert.equal(alerts[0].mode,'prominent');assert.equal(alerts[0].data,undefined);
 assert.deepEqual(documentAlerts(w,'2026-11-21',other),[]);assert.deepEqual(documentAlerts(w,'2026-11-21',staff),[]);assert.deepEqual(documentAlerts(w,'2026-11-21'),[]);
 assert.ok(followUpItems(w,'2026-11-21',manager).some(i=>i.kind==='document'));
 assert.ok(!followUpItems(w,'2026-11-21',other).some(i=>i.kind==='document'));
 w.notificationSettings.documentRecipients=null;
 assert.equal(documentAlerts(w,'2026-11-21',other).length,1);assert.equal(documentAlerts(w,'2026-11-21').length,1);
 w.branchNotificationPreferences={a:{documents:false}};assert.deepEqual(documentAlerts(w,'2026-11-21',manager),[]);
 w.notificationSettings.documentRecipients=['e'];assert.deepEqual(documentAlerts(w,'2026-11-21',staff),[]);
});
test('prominent document notice repeats at 24 hours, normal never opens a modal, and every new opening resets first display',()=>{
 const a=[{mode:'prominent'}],now=100000000;
 assert.equal(documentNoticeDue(a,null,now),true);
 assert.equal(documentNoticeDue(a,now,now+86400000-1),false);
 assert.equal(documentNoticeDue(a,now,now+86400000),true);
 assert.equal(documentNoticeDue(a,null,now+1000),true);
 assert.equal(documentNoticeDue([{mode:'normal'}],null,now),false);
 assert.equal(documentNoticeDue([],null,now),false);
});
