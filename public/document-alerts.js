import {isAdministrator,roleBranches,managesBranch} from './branch-roles.js';
import {effectiveNotificationPreferences,effectiveNotificationSettings,documentReminderDays} from './notification-preferences.js';

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
 const sources=[...(workspace.documents??[]),...(workspace.followUpDocuments??[])];
 for(const person of workspace.staff??[]){
  if(person.status==='Removed'||!person.nationality||person.nationality==='SA'||(viewer&&!managesBranch(viewer,person.branchId)))continue;
  for(const [kind,field] of [['residence','residencyExpiryDate'],['work-permit','workPermitExpiryDate']])if(person[field])sources.push({id:kind+':'+person.id,name:person.nameAr||person.name,expiresOn:person[field],kind,branchId:person.branchId});
 }
 return sources.flatMap(doc=>{
  if(seen.has(doc.id))return [];seen.add(doc.id);
  const days=Math.round((Date.parse(doc.expiresOn+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);
  const schedule=doc.kind?effectiveNotificationSettings(workspace,doc.branchId):settings;
  const first=documentReminderDays(schedule), second=schedule.documentSecondReminderDays;
  if(!Number.isFinite(days)||days>first)return [];
  const mode=Number.isInteger(second)&&second>=0&&second<first&&days<=second
   ? schedule.documentSecondAlertMode : settings.documentAlertMode;
  return [{id:doc.id,name:doc.name,expiresOn:doc.expiresOn,days,...(doc.kind?{kind:doc.kind}:{}),mode:mode==='prominent'?'prominent':'normal'}];
 });
}
export const documentNoticeDue=(alerts,lastShown,now)=>alerts.some(a=>a.mode==='prominent')&&
 (lastShown==null||now-lastShown>=86400000);
