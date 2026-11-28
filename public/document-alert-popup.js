import {employeeText} from './employee-chinese.js';
import {documentNoticeDue} from './document-alerts.js';
import {dateText} from './date-format.js';
// Per opening: first display immediately, then repeat after 24h while still open.
export function documentAlertPresenter(language){
 let alerts=[],lastShown=null,dialog=null,identity;
 const attempt=()=>{
  if(document.hidden||!documentNoticeDue(alerts,lastShown,Date.now())||document.querySelector('dialog[open]'))return;
  const L = (ar, en) => employeeText(language(), ar, en);dialog=document.createElement('dialog');dialog.className='catalog-dialog document-expiry-notice';
  dialog.setAttribute('aria-labelledby','document-expiry-notice-title');
  const header=document.createElement('header'),title=document.createElement('h2'),close=document.createElement('button');
  title.id='document-expiry-notice-title';title.textContent=L('تنبيه مستندات تحتاج متابعة','Documents need attention');
  close.type='button';close.className='button secondary compact';close.textContent='×';close.setAttribute('aria-label',L('إغلاق','Close'));close.onclick=()=>dialog.close();header.append(title,close);
  const list=document.createElement('ul');
  for(const alert of alerts.filter(a=>a.mode==='prominent')){const row=document.createElement('li');row.textContent=(alert.kind?(alert.kind==='residence'?(L('الإقامة: ','Residence permit: ')):(L('رخصة العمل: ','Work permit: '))):'')+alert.name+' · '+dateText(alert.expiresOn)+' · '+(alert.days<0?L('منتهي','Expired'):L('قريب الانتهاء','Expiring soon'));list.append(row);}
  const okay=document.createElement('button');okay.type='button';okay.className='button primary';okay.textContent=L('حسنًا','Got it');okay.onclick=()=>dialog.close();
  dialog.append(header,list,okay);const view=dialog;dialog.onclose=()=>{view.remove();if(dialog===view)dialog=null;};document.body.append(dialog);dialog.showModal();lastShown=Date.now();
 };
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){lastShown=null;attempt();}});
 setInterval(attempt,30000);
 return {update(next,key){if(key!==identity){identity=key;lastShown=null;if(dialog)dialog.close();}alerts=next??[];if(!alerts.some(a=>a.mode==='prominent')&&dialog)dialog.close();attempt();}};
}
