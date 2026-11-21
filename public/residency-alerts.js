import {effectiveNotificationSettings,documentReminderDays} from './notification-preferences.js';
import {isAdministrator,managesBranch} from './branch-roles.js';
export function residencyAlerts(workspace,today,viewer=null) {
  if(viewer&&!isAdministrator(viewer))return [];
  const now=Date.parse(today+'T00:00:00Z');
  return (workspace.staff??[]).flatMap(person=>{
    if(person.status==='Removed'||!person.nationality||person.nationality==='SA'||!/^\d{4}-\d{2}-\d{2}$/.test(person.residencyExpiryDate??'')||
      (viewer&&!managesBranch(viewer,person.branchId)))return [];
    const expiry=Date.parse(person.residencyExpiryDate+'T00:00:00Z');
    if(!Number.isFinite(expiry)||new Date(expiry).toISOString().slice(0,10)!==person.residencyExpiryDate)return [];
    const days=Math.round((expiry-now)/86400000);
    if(days>documentReminderDays(effectiveNotificationSettings(workspace,person.branchId)))return [];
    return [{staffId:person.id,name:person.name,nameAr:person.nameAr,nameEn:person.nameEn,expiresOn:person.residencyExpiryDate,daysRemaining:days}];
  }).sort((a,b)=>a.daysRemaining-b.daysRemaining);
}
