import {hasAdministration} from './role-permissions.js';
import {automaticInsurance} from './payroll-model.js';
import {isAdministrator,managesBranch} from './branch-roles.js';
function currentItems(workspace,today,viewer=null){
 if(viewer&&!hasAdministration(workspace,viewer))return [];
 const now=Date.parse(today+'T00:00:00Z'),items=[];
 const add=(kind,id,name,expiresOn,branchId,staffId)=>{
  const days=Math.round((Date.parse(expiresOn+'T00:00:00Z')-now)/86400000);
  if(!Number.isFinite(days)||days>30)return;
  items.push({id:kind+':'+id+':'+expiresOn,sourceId:id,kind,name,expiresOn,days,branchId,staffId,category:days<=7?'urgent':'soon'});
 };
 // Company documents are visible to account administrators only, matching the wallet permissions.
 for(const document of [...(workspace.documents??[]),...(workspace.followUpDocuments??[])].filter((d,i,all)=>all.findIndex(x=>x.id===d.id)===i).filter(d=>!viewer||(workspace.followUpAssignments??[]).some(r=>r.snapshot?.sourceId===d.id&&r.snapshot?.kind==='document'&&r.assigneeId===viewer.id))){
  if(document.expiresOn)add('document',document.id,document.name,document.expiresOn,null,null);
  else items.push({id:'document:'+document.id+':missing',kind:'document',sourceId:document.id,name:document.name,category:'missing',fields:['expiry'],branchId:null});
 }
 for(const person of workspace.staff??[]){
  if(person.status==='Removed'||(viewer&&!managesBranch(viewer,person.branchId)))continue;
  const foreign=person.nationality&&person.nationality!=='SA';
  if(foreign&&person.residencyExpiryDate)add('residence',person.id,person.nameAr||person.name,person.residencyExpiryDate,person.branchId,person.id);
  if(foreign&&person.workPermitExpiryDate)add('work-permit',person.id,person.nameAr||person.name,person.workPermitExpiryDate,person.branchId,person.id);
  const fields=['email','phone','identityNumber','nationality','joinDate','jobTitle','iban'].filter(key=>!String(person[key]??'').trim());
  if(foreign&&!person.residencyExpiryDate)fields.push('residencyExpiryDate');
  if(automaticInsurance(person,today.slice(0,7)).insuranceNeedsSetup)fields.push('gosi');
  if(fields.length)items.push({id:'staff:'+person.id+':missing',kind:'staff',name:person.nameAr||person.name,staffId:person.id,branchId:person.branchId,category:'missing',fields});
 }
 return items;
}
const visibleItem=(workspace,item,viewer)=>!viewer||(hasAdministration(workspace,viewer)&&(item.kind==='document'?(workspace.followUpAssignments??[]).some(r=>r.itemId===item.id&&r.assigneeId===viewer.id):workspace.staff.some(p=>p.id===item.staffId&&p.status!=='Removed'&&managesBranch(viewer,p.branchId))));
export function followUpItems(workspace,today,viewer=null){
 const current=currentItems(workspace,today,viewer),records=workspace.followUpAssignments??[];
 const items=current.map(item=>({...item,assignment:records.find(r=>r.itemId===item.id)??null}));
 for(const record of records){
  if(items.some(item=>item.id===record.itemId)||!record.snapshot||!visibleItem(workspace,record.snapshot,viewer))continue;
  // Only archive when the source condition is actually resolved, not merely hidden or removed.
  const old=record.snapshot,person=workspace.staff.find(p=>p.id===old.staffId&&p.status!=='Removed');
  const document=[...(workspace.documents??[]),...(workspace.followUpDocuments??[])].find(d=>d.id===old.sourceId);
  const resolved=old.kind==='document'?!!document&&(old.expiresOn?!!document.expiresOn&&document.expiresOn!==old.expiresOn:!!document.expiresOn):
   !!person&&(old.kind==='residence'?!!person.residencyExpiryDate&&person.residencyExpiryDate!==old.expiresOn:old.kind==='work-permit'?!!person.workPermitExpiryDate&&person.workPermitExpiryDate!==old.expiresOn:!current.some(i=>i.id===old.id));
  if(resolved)items.push({...old,assignment:record,autoCompleted:true});
 }
 const order={urgent:0,soon:1,missing:2};
 return items.map(item=>{
  const status=item.autoCompleted?'completed':item.assignment?.status??'new',dueOn=item.assignment?.dueOn??null;
  return {...item,status,dueOn,overdue:status!=='completed'&&!!(dueOn?dueOn<today:item.expiresOn&&item.expiresOn<today)};
 }).sort((a,b)=>Number(a.status==='completed')-Number(b.status==='completed')||Number(b.overdue)-Number(a.overdue)||(order[a.category]??3)-(order[b.category]??3)||(a.days??0)-(b.days??0));
}
export function publicFollowUpRecords(records=[]){return records.map(r=>({...r,comments:(r.comments??[]).map(c=>({...c,...(c.attachment?{attachment:{name:c.attachment.name,mime:c.attachment.mime}}:{})}))}));}
export function updateFollowUp(workspace,body,viewer=null,today,now=new Date().toISOString()){
 const item=followUpItems(workspace,today,viewer).find(i=>i.id===body.itemId);
 if(!item)throw Error('Follow-up item not found or outside your branch permissions.');
 const records=workspace.followUpAssignments??[],old=records.find(r=>r.itemId===item.id);
 if(body.expectedVersion!==undefined&&body.expectedVersion!==(old?.version??0))throw Error('Follow-up changed. Refresh and try again.');
 if(item.autoCompleted)throw Error('This follow-up was completed automatically after its source was updated.');
 const record={...old,itemId:item.id,snapshot:old?.snapshot??Object.fromEntries(Object.entries(item).filter(([key])=>!['assignment','status','dueOn','overdue'].includes(key))),version:(old?.version??0)+1,status:old?.status??'new',comments:[...(old?.comments??[])],events:[...(old?.events??[])]};
 const actor=viewer?.id??'account-administrator',event={at:now,by:actor};
 if(body.operation==='details'){
  if(body.assigneeId&&old?.assigneeId!==body.assigneeId&&body.status!=='completed')body={...body,status:'new'};
  if(viewer&&item.kind==='document'&&body.assigneeId!==viewer.id)throw Error('Only the account administrator can reassign company document follow-ups.');
  if(!['new','in-progress','completed'].includes(body.status))throw Error('Choose a valid follow-up status.');
  if(body.dueOn!==null&&(!/^\d{4}-\d{2}-\d{2}$/.test(body.dueOn??'')||!Number.isFinite(Date.parse(body.dueOn))||new Date(body.dueOn).toISOString().slice(0,10)!==body.dueOn))throw Error('Choose a valid due date.');
  const person=workspace.staff.find(p=>p.id===body.assigneeId&&p.status==='Active'&&isAdministrator(p,workspace)&&(!item.branchId||managesBranch(p,item.branchId)));
  if(body.assigneeId!==null&&!person)throw Error('Choose an active administrator authorized for this branch.');
  if(old?.assigneeId!==body.assigneeId){record.assignedAt=now;record.assignedBy=actor;delete record.receivedAt;delete record.receivedBy;record.history=[...(old?.history??[]),...(old?[{assigneeId:old.assigneeId,assignedAt:old.assignedAt,assignedBy:old.assignedBy}]:[])];}
  Object.assign(record,{assigneeId:body.assigneeId,dueOn:body.dueOn,status:body.status});
  record.completedAt=body.status==='completed'?(old?.completedAt??now):null;
  record.events.push({...event,type:'details',from:{assigneeId:old?.assigneeId??null,dueOn:old?.dueOn??null,status:old?.status??'new'},to:{assigneeId:record.assigneeId,dueOn:record.dueOn,status:record.status}});
 }else if(body.operation==='comment'){
  const text=typeof body.text==='string'?body.text.trim():'';
  if(text.length>2000||(!text&&!body.attachment))throw Error('Enter a comment up to 2000 characters or attach a file.');
  if(record.comments.length>=100)throw Error('The comment limit for this follow-up has been reached.');
  const file=body.attachment;
  if(file){
   const signatures={'application/pdf':'25504446','image/png':'89504e470d0a1a0a','image/jpeg':'ffd8ff'};
   const bytes=typeof file.data==='string'&&/^[A-Za-z0-9+/]+={0,2}$/.test(file.data)?Buffer.from(file.data,'base64'):null;
   if(typeof file.name!=='string'||!file.name.trim()||file.name.length>180||!signatures[file.mime]||!bytes||bytes.length>2*1024*1024||!bytes.length||bytes.subarray(0,signatures[file.mime].length/2).toString('hex')!==signatures[file.mime])throw Error('Choose a PDF, PNG or JPEG up to 2 MB.');
  }
  record.comments.push({...event,id:record.version+'-'+now,text,...(file?{attachment:{name:file.name,mime:file.mime,data:file.data}}:{})});
  record.events.push({...event,type:'comment'});
 }else throw Error('Choose a valid follow-up operation.');
 workspace.followUpAssignments=[...records.filter(r=>r.itemId!==item.id),record];return record;
}
export function assignFollowUp(workspace,{itemId,assigneeId},viewer=null,today,now=new Date().toISOString()){
 const old=(workspace.followUpAssignments??[]).find(r=>r.itemId===itemId);
 return updateFollowUp(workspace,{itemId,assigneeId,operation:'details',status:old?.status??'new',dueOn:old?.dueOn??null},viewer,today,now);
}
export function receiveFollowUp(workspace,{itemId,expectedVersion},viewer,today,now=new Date().toISOString()){
 const item=viewer&&hasAdministration(workspace,viewer)&&followUpItems(workspace,today,viewer).find(i=>i.id===itemId);
 if(!item||item.assignment?.assigneeId!==viewer.id)throw Error('Only the assigned administrator can receive this task.');
 if(item.status==='completed')throw Error('This task is already completed.');
 if(item.status==='in-progress'&&item.assignment.receivedAt)return item.assignment;
 if(!Number.isSafeInteger(expectedVersion)||expectedVersion!==item.assignment.version)throw Error('Follow-up changed. Refresh and try again.');
 const record=updateFollowUp(workspace,{itemId,expectedVersion,operation:'details',assigneeId:viewer.id,status:'in-progress',dueOn:item.dueOn??null},viewer,today,now);
 record.receivedAt=now;record.receivedBy=viewer.id;record.events.at(-1).type='received';return record;
}
export function assignFollowUpBatch(workspace,{items,assigneeId},viewer=null,today,now=new Date().toISOString()){
 if(!Array.isArray(items)||!items.length||items.length>1000||typeof assigneeId!=='string'||!assigneeId||items.some(i=>!i||typeof i.itemId!=='string'||!Number.isSafeInteger(i.expectedVersion)||i.expectedVersion<0)||new Set(items.map(i=>i.itemId)).size!==items.length)throw Error('Choose valid follow-ups and an administrator.');
 const draft=structuredClone(workspace),visible=followUpItems(draft,today,viewer);
 for(const entry of items){
  const item=visible.find(i=>i.id===entry.itemId);
  if(!item||item.status==='completed')throw Error('A follow-up is completed, unavailable or outside your branch permissions. Refresh and try again.');
  updateFollowUp(draft,{...entry,assigneeId,operation:'details',status:item.status,dueOn:item.dueOn??null},viewer,today,now);
 }
 workspace.followUpAssignments=draft.followUpAssignments;
 return items.length;
}

export const pendingFollowUpCount=(workspace,today,viewer=null)=>followUpItems(workspace,today,viewer).filter(item=>item.status!=='completed').length;
