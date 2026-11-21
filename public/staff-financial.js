// Keep values in the draft when switching contracts; hidden fields are not sent.
export function updateStaffFinancialFields(form){
 const hidden=form.elements.contractType.value==='Tamheer';
 const group=form.querySelector('[data-staff-financial]');
 group.hidden=hidden;
 for(const field of group.querySelectorAll('input,select')){
  if(!field.hasAttribute('data-financial-required'))field.dataset.financialRequired=String(field.required);
  field.disabled=hidden;
  field.required=!hidden&&field.dataset.financialRequired==='true';
 }
 return hidden;
}
