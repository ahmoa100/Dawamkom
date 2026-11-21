import {employeeRequestTypes} from './request-settings.js';
import {approvalStepMembers} from './role-permissions.js';
import {managesBranch} from './branch-roles.js';
export const browserChangeType='Device change';
export const approvalRequestTypes=workspace=>[...new Set([...employeeRequestTypes(workspace),browserChangeType])];
export function browserApprovalRequest(person){
 return {staffId:person.id,approvalSteps:person.account?.pendingApprovalSteps??[person.managerId].filter(Boolean),approvalIndex:person.account?.pendingApprovalIndex??0};
}
export function browserApprovalMembers(workspace,person){
 return approvalStepMembers(workspace,browserApprovalRequest(person)).filter(id=>{const actor=workspace.staff.find(p=>p.id===id);return !person.branchId||managesBranch(actor,person.branchId);});
}
export function beginBrowserApproval(workspace,person,steps){
 if(!steps?.length)throw Error('No eligible browser-change approver is configured.');
 const request={staffId:person.id,approvalSteps:steps};
 if(steps.some((step,i)=>!approvalStepMembers(workspace,{...request,approvalIndex:i}).some(id=>!person.branchId||managesBranch(workspace.staff.find(p=>p.id===id),person.branchId))))throw Error('An approver is unavailable. Check the approval chain.');
 person.account.pendingApprovalSteps=[...steps];person.account.pendingApprovalIndex=0;person.account.pendingApprovalHistory=[];
}
export function decideBrowserApproval(workspace,person,actor,decision,owner=false,now=new Date().toISOString()){
 const members=browserApprovalMembers(workspace,person);
 if(!owner&&(!actor||!members.includes(actor.id)))throw Error('This browser-change request is assigned to the current approval step.');
 const request=browserApprovalRequest(person),index=request.approvalIndex;
 const entry={approverId:owner?'account-administrator':actor.id,stepIndex:index,status:decision==='approve'?'Approved':'Declined',at:now};
 person.account.pendingApprovalHistory=[...(person.account.pendingApprovalHistory??[]),entry];
 if(decision==='approve'&&!owner&&index<request.approvalSteps.length-1){person.account.pendingApprovalIndex=index+1;return {forwarded:true,approverId:actor.id};}
 return {forwarded:false,approverId:owner?members[0]:actor.id,approvalHistory:person.account.pendingApprovalHistory};
}
