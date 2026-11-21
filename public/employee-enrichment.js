export const enrichmentKeys=['nameAr','nameEn','email','phone','identityNumber','nationality','birthDate','joinDate','gender','salary','allowances','jobTitle','branchId','contractType','contractTerm','annualLeave','probation','iban','residencyExpiryDate'];
const empty=v=>v===undefined||v===null||String(v).trim()==='';
const digits=v=>String(v??'').trim().replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[\s-]/g,'');
const email=v=>String(v??'').trim().toLowerCase();
export function employeeField(person,key){
 if(key==='salary')return person.salary?.monthlyBase;
 if(key==='allowances')return person.salary?.monthlyAllowances;
 if(key==='annualLeave')return person.annualLeaveDays;
 if(key==='probation')return person.probationDays;
 if(key==='iban')return person.iban||person.bankPayment?.account;
 return person[key];
}
export function enrichmentPlan(staff,source){
 const id=digits(source.identityNumber),mail=email(source.email),people=staff.filter(p=>p.status!=='Removed');
 const matches=people.filter(p=>id&&digits(p.identityNumber)===id||mail&&email(p.email)===mail);
 if(!matches.length)return {status:'unmatched',changes:{}};
 if(matches.length!==1)return {status:'ambiguous',changes:{}};
 const person=matches[0];
 if(id&&!empty(person.identityNumber)&&digits(person.identityNumber)!==id||mail&&!empty(person.email)&&email(person.email)!==mail)return {status:'conflict',changes:{}};
 const changes={};
 for(const key of enrichmentKeys){
  const value=source[key];if(empty(value)||!empty(employeeField(person,key)))continue;
  changes[key]=['annualLeave','probation'].includes(key)?Number(value):String(value).trim();
 }
 return {status:Object.keys(changes).length?'matched':'unchanged',staffId:person.id,changes};
}
export function enrichmentPatch(staff,{staffId,source,fields}){
 if(!source||typeof source!=='object'||Array.isArray(source)||Object.keys(source).some(k=>!enrichmentKeys.includes(k)||typeof source[k]!=='string'&&typeof source[k]!=='number'||String(source[k]).length>254)||!Array.isArray(fields)||!fields.length||new Set(fields).size!==fields.length||fields.some(k=>!enrichmentKeys.includes(k)))throw Error('Choose valid additional employee data.');
 const plan=enrichmentPlan(staff,source);
 if(!['matched','unchanged'].includes(plan.status)||plan.staffId!==staffId)throw Error('Employee match is missing, ambiguous or conflicting. Review the file.');
 if(fields.some(k=>!Object.hasOwn(plan.changes,k)))throw Error('Employee data changed. Preview the missing fields again.');
 return {staffId,...Object.fromEntries(fields.map(k=>[k,plan.changes[k]]))};
}
