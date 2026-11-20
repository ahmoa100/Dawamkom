const $=id=>document.getElementById(id);
const resetting=location.pathname==='/reset-password';
const token=new URLSearchParams(location.hash.slice(1)).get('reset');
if(resetting)history.replaceState(null,'',location.pathname+location.search);
let language='ar',busy=false,finished=false;
try{if(localStorage.getItem('dawamak-language')==='en')language='en';}catch{}
const copy={ar:{title:resetting?'تعيين كلمة مرور جديدة':'نسيت كلمة المرور؟',intro:resetting?'الرابط صالح لمدة ساعة واحدة ويُستخدم مرة واحدة.':'أدخل بريدك الإلكتروني لنرسل لك رابط إعادة تعيين كلمة المرور.',email:'البريد الإلكتروني',password:'كلمة المرور الجديدة',confirm:'تأكيد كلمة المرور',send:'إرسال رابط الاستعادة',save:'حفظ كلمة المرور',rules:'من 10 إلى 128 حرفًا، مع حرف إنجليزي كبير وصغير ورقم ورمز.',back:'العودة إلى تسجيل الدخول',new:'طلب رابط جديد',generic:'إذا كان البريد مرتبطًا بحساب مفعّل، ستصلك رسالة برابط إعادة تعيين كلمة المرور.',success:'تم تغيير كلمة المرور. سجّل الدخول بكلمة المرور الجديدة.',invalid:'رابط إعادة التعيين غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا.',error:'تعذّر إكمال الطلب. حاول مرة أخرى.'},en:{title:resetting?'Set a new password':'Forgot your password?',intro:resetting?'This link expires after one hour and can be used once.':'Enter your email address to request a password reset link.',email:'Email address',password:'New password',confirm:'Confirm password',send:'Send reset link',save:'Save password',rules:'Use 10–128 characters with an uppercase letter, lowercase letter, number and symbol.',back:'Back to sign in',new:'Request a new link',generic:'If the email belongs to an active account, we will send a password reset link.',success:'Password changed. Sign in with your new password.',invalid:'This reset link is invalid or expired. Request a new link.',error:'We could not complete the request. Please try again.'}};
function render(){const c=copy[language];document.documentElement.lang=language;document.documentElement.dir=language==='ar'?'rtl':'ltr';document.title=c.title+' | دوامكم';for(const [id,key] of Object.entries({'recovery-title':'title','recovery-intro':'intro','recovery-email-label':'email','recovery-password-label':'password','recovery-confirm-label':'confirm','recovery-send':'send','recovery-save':'save','recovery-rules':'rules','recovery-back':'back','recovery-new':'new'}))$(id).textContent=c[key];$('recovery-language').textContent=language==='ar'?'English':'العربية';}
$('recovery-language').onclick=()=>{language=language==='ar'?'en':'ar';render();};
$('recovery-request').hidden=resetting;
$('recovery-reset').hidden=!resetting;
$('recovery-back').href='/?signed-out=1';
if(resetting&&!/^[a-f0-9]{64}$/.test(token??'')){$('recovery-reset').hidden=true;$('recovery-new').hidden=false;}
async function submit(event,reset){
 event.preventDefault();if(busy||finished)return;busy=true;const button=event.submitter;button.disabled=true;$('recovery-status').textContent='';
 try{
  const body=Object.fromEntries(new FormData(event.target));if(reset)body.token=token;
  const response=await fetch(reset?'/api/password-reset':'/api/password-recovery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const result=await response.json();if(!response.ok)throw Error(result.error||copy[language].error);
  $('recovery-status').textContent=copy[language][reset?'success':'generic'];
  if(reset){finished=true;event.target.reset();event.target.hidden=true;}else button.disabled=false;
 }catch(error){$('recovery-status').textContent=error.message;$('recovery-new').hidden=!reset;}
 finally{busy=false;if(!finished)button.disabled=false;}
}
$('recovery-request').onsubmit=event=>submit(event,false);
$('recovery-reset').onsubmit=event=>submit(event,true);
render();if(resetting&&!/^[a-f0-9]{64}$/.test(token??''))$('recovery-status').textContent=copy[language].invalid;
