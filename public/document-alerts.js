import {isAdministrator,roleBranches} from './branch-roles.js';
import {effectiveNotificationPreferences,effectiveNotificationSettings} from './notification-preferences.js';

export function documentAlertRecipient(workspace,viewer=null){
 const branch=viewer&&(roleBranches(viewer).includes(viewer.branchId)?viewer.branchId:roleBranches(viewer)[0]);
 const settings=effectiveNotificationSettings(workspace,branch);
 if(!effectiveNotificationPreferences(workspace,branch).documents)return false;
 if(viewer&&(viewer.status!=='Active'||!isAdministrator(viewer,workspace)))return false;
 const recipients=settings.documentRecipients;
 return recipients==null||recipients.includes(viewer?.id??'account-owner');
}
export function documentAlerts(workspace,today,viewer=null){
 if(!documentAlertRecipient(workspace,viewer))return [];
 const branch=viewer&&(roleBranches(viewer).includes(viewer.branchId)?viewer.branchId:roleBranches(viewer)[0]);
 const settings=effectiveNotificationSettings(workspace,branch),seen=new Set();
 return [...(workspace.documents??[]),...(workspace.followUpDocuments??[])].flatMap(doc=>{
  if(seen.has(doc.id))return [];seen.add(doc.id);
  const days=Math.round((Date.parse(doc.expiresOn+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);
  return Number.isFinite(days)&&days<=30?[{id:doc.id,name:doc.name,expiresOn:doc.expiresOn,days,
   mode:settings.documentAlertMode==='prominent'?'prominent':'normal'}]:[];
 });
}
export const documentNoticeDue=(alerts,lastShown,now)=>alerts.some(a=>a.mode==='prominent')&&
 (lastShown==null||now-lastShown>=86400000);
