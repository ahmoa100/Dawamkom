import {automaticInsurance} from './payroll-model.js';
import {isAdministrator,managesBranch} from './branch-roles.js';
export function followUpItems(workspace,today,viewer=null){
 if(viewer&&!isAdministrator(viewer))return [];
 const now=Date.parse(today+'T00:00:00Z'),items=[];
 const add=(kind,id,name,expiresOn,branchId,staffId)=>{
  const days=Math.round((Date.parse(expiresOn+'T00:00:00Z')-now)/86400000);
  if(!Number.isFinite(days)||days>30)return;
  items.push({id:kind+':'+id+':'+expiresOn,kind,name,expiresOn,days,branchId,staffId,category:days<=7?'urgent':'soon'});
 };
 // Company documents are visible to account administrators only, matching the wallet permissions.
 if(!viewer)for(const document of workspace.documents??[]){
  if(document.expiresOn)add('document',document.id,document.name,document.expiresOn,null,null);
  else items.push({id:'document:'+document.id+':missing',kind:'document',name:document.name,category:'missing',fields:['expiry'],branchId:null});
 }
 for(const person of workspace.staff??[]){
  if(person.status==='Removed'||(viewer&&!managesBranch(viewer,person.branchId)))continue;
  const foreign=person.nationality&&person.nationality!=='SA';
  if(foreign&&person.residencyExpiryDate)add('residence',person.id,person.nameAr||person.name,person.residencyExpiryDate,person.branchId,person.id);
  const fields=['email','phone','identityNumber','nationality','joinDate','jobTitle','iban'].filter(key=>!String(person[key]??'').trim());
  if(foreign&&!person.residencyExpiryDate)fields.push('residencyExpiryDate');
  if(automaticInsurance(person,today.slice(0,7)).insuranceNeedsSetup)fields.push('gosi');
  if(fields.length)items.push({id:'staff:'+person.id+':missing',kind:'staff',name:person.nameAr||person.name,staffId:person.id,branchId:person.branchId,category:'missing',fields});
 }
 const order={urgent:0,soon:1,missing:2};
 return items.map(item=>({...item,assignment:(workspace.followUpAssignments??[]).find(record=>record.itemId===item.id)??null})).sort((a,b)=>order[a.category]-order[b.category]||(a.days??0)-(b.days??0));
}
export function assignFollowUp(workspace,{itemId,assigneeId},viewer=null,today,now=new Date().toISOString()){
 const item=followUpItems(workspace,today,viewer).find(item=>item.id===itemId);
 if(!item)throw Error('Follow-up item not found or outside your branch permissions.');
 const person=(workspace.staff??[]).find(person=>person.id===assigneeId&&person.status==='Active'&&isAdministrator(person)&&
  (!item.branchId||managesBranch(person,item.branchId))&&(!viewer||managesBranch(viewer,item.branchId)));
 if(assigneeId!==null&&!person)throw Error('Choose an active administrator authorized for this branch.');
 const records=workspace.followUpAssignments??=[],previous=records.find(record=>record.itemId===itemId);
 const record={itemId,assigneeId,assignedAt:now,assignedBy:viewer?.id??'account-administrator',history:[...(previous?.history??[]),...(previous?[{assigneeId:previous.assigneeId,assignedAt:previous.assignedAt,assignedBy:previous.assignedBy}]:[])]};
 workspace.followUpAssignments=[...records.filter(record=>record.itemId!==itemId),record];return record;
}
