import {loanRequestTerms} from './public/request-settings.js';
import {withLoanRepayments} from './public/payroll-model.js';
export function scheduleApprovedLoan(workspace, request, today) {
 if(request.type!=='Loan request'||request.status!=='Approved')return;
 const schedules=workspace.loanSchedules??=[];
 if(schedules.some(item=>item.requestId===request.id))return;
 const {loanAmount,repaymentInstallments}=loanRequestTerms(request);
 const total=Math.round(loanAmount*100),base=Math.floor(total/repaymentInstallments),remainder=total%repaymentInstallments;
 const cursor=new Date(today.slice(0,7)+'-01T00:00:00Z'), installments=[];
 for(let index=0;index<repaymentInstallments;index++) {
  while(workspace.payrollRuns?.some(run=>run.month===cursor.toISOString().slice(0,7)&&run.status==='Approved'))cursor.setUTCMonth(cursor.getUTCMonth()+1);
  const month=cursor.toISOString().slice(0,7);
  installments.push({id:request.id+':repayment:'+(index+1),month,amount:(base+(index<remainder?1:0))/100,number:index+1});
  cursor.setUTCMonth(cursor.getUTCMonth()+1);
 }
 const schedule={requestId:request.id,staffId:request.staffId,amount:loanAmount,createdAt:request.decidedAt,installments};
 schedules.push(schedule);
 for(const run of workspace.payrollRuns??[])if(run.status!=='Approved') {
  const oldCount=run.entries.reduce((count,entry)=>count+entry.adjustments.length,0);
  run.entries=withLoanRepayments(run.entries,schedules,run.month);
  if(run.entries.reduce((count,entry)=>count+entry.adjustments.length,0)!==oldCount)run.version=(run.version??0)+1;
 }
}
