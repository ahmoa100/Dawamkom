import test from 'node:test';
import assert from 'node:assert/strict';
import {residencyAlerts} from '../public/residency-alerts.js';
test('residence expiry alerts respect every assigned branch and 30-day window',()=>{
 const person=(id,branchId,expiry='2026-12-19',nationality='YE',status='Active')=>({id,branchId,nationality,status,residencyExpiryDate:expiry});
 const workspace={staff:[person('women','w'),person('men','m'),person('expired','m','2026-11-18'),person('later','m','2026-12-20'),person('saudi','w','2026-11-20','SA'),person('removed','w','2026-11-20','YE','Removed'),person('missing','w',''),person('invalid','w','2026-02-30')]};
 const maram={role:'Manager',branchId:'w',roleBranchIds:{Manager:['w']}};
 const abdulkarim={role:'Manager',branchId:'m',roleBranchIds:{Manager:['m','w']}};
 assert.deepEqual(residencyAlerts(workspace,'2026-11-19',maram).map(x=>x.staffId),['women']);
 assert.deepEqual(residencyAlerts(workspace,'2026-11-19',abdulkarim).map(x=>x.staffId),['expired','women','men']);
 assert.equal(residencyAlerts(workspace,'2026-11-19',abdulkarim)[0].daysRemaining,-1);
 assert.equal(residencyAlerts(workspace,'2026-11-19').length,3);
 assert.deepEqual(residencyAlerts(workspace,'2026-11-19',{role:'Employee',branchId:'w'}),[]);
 assert.equal(residencyAlerts(workspace,'2026-12-19',maram)[0].daysRemaining,0);
});

test('legacy residence reminder respects configured branch lead time',()=>{
 const workspace={staff:[{id:'e',branchId:'a',nationality:'EG',status:'Active',residencyExpiryDate:'2026-12-31'}],notificationSettings:{documentReminderDays:60},branchNotificationSettings:{a:{documentReminderDays:0}}};
 assert.equal(residencyAlerts(workspace,'2026-11-21').length,0);
 delete workspace.branchNotificationSettings;
 assert.equal(residencyAlerts(workspace,'2026-11-21').length,1);
});
