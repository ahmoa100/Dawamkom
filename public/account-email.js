const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function accountEmail({title,name,text,url,button='إعادة تعيين كلمة المرور',note='',language='ar'}) {
  if(url && new URL(url).protocol!=='https:' && !url.startsWith('http://127.0.0.1:')) throw Error('Invalid account mail link');
  const english=language==='en', lang=english?'en':'ar', dir=english?'ltr':'rtl';
  return '<!doctype html><html lang="'+lang+'" dir="'+dir+'"><body style="margin:0;background:#edf1ee;color:#233f38;font-family:Tahoma,Arial,sans-serif;direction:'+dir+'">'+
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 16px"><table role="presentation" align="center" width="600" style="width:100%;max-width:600px;background:#fff;border:1px solid #d4dfd8;border-radius:18px;overflow:hidden" cellpadding="0" cellspacing="0">'+
    '<tr><td style="background:#173f43;padding:28px 32px;border-top:5px solid #80c8ac"><table role="presentation" dir="'+dir+'" width="100%" cellpadding="0" cellspacing="0"><tr><td align="right" valign="middle"><h1 style="margin:0;color:#f2faf5;font-size:25px;line-height:1.7">'+escape(title)+'</h1></td><td align="left" valign="middle" width="64" style="padding-right:18px"><img src="https://www.dawamkom.net/app-icon-192.png" alt="'+(english?'Dawamkom logo':'شعار دوامكم')+'" width="64" height="64" style="display:block;border:0;border-radius:14px"></td></tr></table></td></tr>'+
    '<tr><td style="padding:30px 32px;font-size:16px;line-height:2"><p>'+(english?'Hello ':'أهلًا ')+escape(name)+(english?',':'،')+'</p><p>'+escape(text).replace(/\n/g,'<br>')+'</p>'+
    (url?'<p style="text-align:center;padding:12px 0"><a href="'+escape(url)+'" style="display:inline-block;padding:12px 28px;background:#28725f;color:#fff;text-decoration:none;font-weight:bold;border-radius:10px">'+escape(button)+'</a></p>':'')+
    '<p style="color:#637c6f;font-size:13px">'+escape(note)+'</p><p>'+(english?'Support: ':'للمساعدة: ')+'<a href="mailto:info@dawamkom.net" style="color:#28725f">info@dawamkom.net</a></p><strong>'+(english?'The Dawamkom team':'فريق دوامكم')+'</strong></td></tr></table></td></tr></table></body></html>';
}
export function followUpAssignmentEmail({name, number, task, dueOn, url}) {
  const subject = 'مهمة جديدة مسندة إليك في دوامكم' + (number ? ' · ' + number : '');
  const details = [
    'أُسندت إليك مهمة في مركز المتابعة.',
    task ? 'المهمة: ' + task : '',
    dueOn ? 'موعد الإنجاز: ' + dueOn.split('-').reverse().join('/') : '',
    'سجّل الدخول إلى دوامكم للاطلاع على المهمة.',
  ].filter(Boolean);
  return {
    subject,
    text: [...details, url].filter(Boolean).join('\n\n'),
    html: accountEmail({title: subject, name, text: details.join('\n'), url, button: 'فتح مركز المتابعة'}),
  };
}
export function activationEmailSent(account,email) {
  const receipt=account?.activationEmail;
  return Boolean(!account?.passwordHash && account?.activationHash && receipt?.status==='sent' && receipt.hash===account.activationHash && receipt.email===String(email).trim().toLowerCase());
}
export function recordActivationEmail(account,email,now=new Date().toISOString()) {
  if(!account?.activationHash || account.passwordHash) return false;
  account.activationEmail={status:'sent',hash:account.activationHash,email:String(email).trim().toLowerCase(),sentAt:now};
  return true;
}

export function payrollApprovedEmail({month, person, url}) {
  const language=person.account?.notificationLanguage==='en' ? 'en' : 'ar';
  const english=language==='en';
  const subject=(english?'Payroll approved | ':'تم اعتماد مسير الرواتب | ')+month;
  const message=english?'Payroll for '+month+' has been approved.' : 'تم اعتماد مسير الرواتب لشهر '+month+'.';
  const text=message+(url ? (english?' Sign in to Dawamkom to view it.':' سجّل الدخول إلى دوامكم للاطلاع عليه.') : '');
  const name=(english?person.nameEn:person.nameAr)||person.name;
  return {subject,text:url?text+'\n'+url:text,html:accountEmail({title:subject,name,text,url,language,
    button:english?'Open payroll':'فتح مسير الرواتب'})};
}
