export const standardEmployeeRequests = ['Missed punch','Attendance excuse','Leave cancellation','Loan request'];
export function employeeRequestTypes(workspace) {
 return [...new Set([...(workspace.leaveTypes??[]),...standardEmployeeRequests])];
}
export function employeeRequestEnabled(workspace, person, type) {
 if(type==='Device change')return true;
 const global = workspace.requestPreferences?.[type] ?? workspace.leaveSettings?.[type]?.active ?? true;
 return global !== false && workspace.branchRequestPreferences?.[person?.branchId]?.[type] !== false;
}
export function effectiveRequestPreferences(workspace, branchId) {
 return Object.fromEntries(employeeRequestTypes(workspace).map(type=>[type,employeeRequestEnabled(workspace,{branchId},type)]));
}
export function loanRequestTerms(body) {
 const amount=Number(body.loanAmount), installments=Number(body.repaymentInstallments);
 if(!Number.isFinite(amount)||amount<=0||amount>100000000||Math.abs(amount*100-Math.round(amount*100))>1e-5||
   !Number.isInteger(installments)||installments<1||installments>4||Math.round(amount*100)<installments)
   throw new Error('Enter a valid loan amount and choose one to four repayments.');
 return {loanAmount:Math.round(amount*100)/100,repaymentInstallments:installments};
}
