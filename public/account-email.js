const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function accountEmail({title,name,text,url,button='إعادة تعيين كلمة المرور',note=''}) {
  if(url && new URL(url).protocol!=='https:' && !url.startsWith('http://127.0.0.1:')) throw Error('Invalid account mail link');
  return '<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#edf1ee;color:#233f38;font-family:Tahoma,Arial,sans-serif;direction:rtl">'+
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 16px"><table role="presentation" align="center" width="600" style="width:100%;max-width:600px;background:#fff;border:1px solid #d4dfd8;border-radius:18px;overflow:hidden" cellpadding="0" cellspacing="0">'+
    '<tr><td style="background:#173f43;padding:28px 32px;border-top:5px solid #80c8ac"><table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0"><tr><td align="right" valign="middle"><h1 style="margin:0;color:#f2faf5;font-size:25px;line-height:1.7">'+escape(title)+'</h1></td><td align="left" valign="middle" width="64" style="padding-right:18px"><img src="https://www.dawamkom.net/app-icon-192.png" alt="شعار دوامكم" width="64" height="64" style="display:block;border:0;border-radius:14px"></td></tr></table></td></tr>'+
    '<tr><td style="padding:30px 32px;font-size:16px;line-height:2"><p>أهلًا '+escape(name)+'،</p><p>'+escape(text)+'</p>'+
    (url?'<p style="text-align:center;padding:12px 0"><a href="'+escape(url)+'" style="display:inline-block;padding:12px 28px;background:#28725f;color:#fff;text-decoration:none;font-weight:bold;border-radius:10px">'+escape(button)+'</a></p>':'')+
    '<p style="color:#637c6f;font-size:13px">'+escape(note)+'</p><p>للمساعدة: <a href="mailto:info@dawamkom.net" style="color:#28725f">info@dawamkom.net</a></p><strong>فريق دوامكم</strong></td></tr></table></td></tr></table></body></html>';
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
