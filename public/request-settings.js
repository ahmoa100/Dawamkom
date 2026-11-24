export const standardEmployeeRequests = ['Missed punch','Attendance excuse','Leave cancellation','Loan request','Shift change'];
export const legacySickLeave = type =>
  /^(?:إجاز(?:ة|ات) مرضي(?:ة|ه)\s*[-–—]?\s*قديم(?:ة|ه)|old sick leave|sick leave\s*[-–—]?\s*old)$/iu.test(String(type ?? '').trim());

export function displayLeaveType(type) {
  if (legacySickLeave(type) || /^(?:مرضية|إجازة مرضية)$/u.test(type)) return 'Sick leave';
  if (/^(?:سنوية|إجازة سنوية)$/u.test(type)) return 'Annual leave';
  return type;
}
export function employeeRequestTypes(workspace) {
 return [...new Set([...(workspace.leaveTypes??[]),...standardEmployeeRequests])];
}
export function employeeRequestEnabled(workspace, person, type) {
 if(type==='Device change')return true;
 const global = workspace.requestPreferences?.[type] ?? workspace.leaveSettings?.[type]?.active ?? true;
 const allowed=requestContractTypes(workspace,type,person?.branchId);
 return global !== false && workspace.branchRequestPreferences?.[person?.branchId]?.[type] !== false && (!person?.id || allowed===null || allowed.includes(person.contractType));
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

export function requestContractTypes(workspace,type,branchId) {
 return workspace.branchRequestContracts?.[branchId]?.[type] ?? workspace.requestContracts?.[type] ?? null;
}

export function correctionMonthlyLimit(workspace, branchId) {
 const overrides=workspace.branchCorrectionMonthlyLimits;
 return overrides && Object.hasOwn(overrides,branchId) ? overrides[branchId] : workspace.correctionMonthlyLimit??null;
}

export function reachedCorrectionMonthlyLimit(workspace,person,day) {
 const limit=correctionMonthlyLimit(workspace,person.branchId);
 if(limit===null)return false;
 const month=day.slice(0,7);
 return workspace.requests.filter(request=>request.staffId===person.id&&request.type==='Missed punch'&&
  request.status==='Approved'&&request.date?.slice(0,7)===month).length>=limit;
}
