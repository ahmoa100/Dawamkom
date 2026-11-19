import {randomBytes,createHash,scryptSync,timingSafeEqual} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
export const recoveryMessage='إذا كان البريد مرتبطًا بحساب مفعّل، ستصلك رسالة برابط إعادة تعيين كلمة المرور.';
export const recoveryError='رابط إعادة التعيين غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا.';
const normalize=value=>String(value??'').trim().toLowerCase();
function accounts(partners,{companyId,kind='all'}={}) {
  const result=[];
  for(const company of partners){
    if(company.suspended || !company.account?.passwordHash || companyId && company.id!==companyId)continue;
    if(kind!=='employee')result.push({company,record:company,kind:'company'});
    if(kind!=='company')for(const person of company.workspace?.staff??[])if(person.status==='Active' && person.account?.passwordHash)result.push({company,record:person,kind:'employee'});
  }
  return result;
}
export function requestRecovery(partners,{email,companyId,kind='all'},{origin,now=Date.now(),tokenFactory=()=>randomBytes(32).toString('hex')}={}) {
  const jobs=[];
  for(const target of accounts(partners,{companyId,kind})){
    const {record,company}=target,account=record.account;
    if(normalize(record.email)!==normalize(email))continue;
    const recent=(account.passwordRecoveryRequests??[]).filter(time=>Number.isFinite(time)&&now-time<3600000);
    if(recent.length>=3 || recent.some(time=>now-time<300000))continue;
    const token=tokenFactory();
    if(!/^[a-f0-9]{64}$/.test(token))throw Error('Invalid reset token');
    account.passwordRecovery={hash:hash(token),expires:now+3600000,email:normalize(record.email),passwordHash:account.passwordHash};
    account.passwordRecoveryRequests=[...recent,now];
    const url=new URL('/reset-password',origin);url.hash='reset='+token;
    jobs.push({email:record.email,name:record.nameAr||record.contactName||record.name,company:company.workspace?.company||company.name,kind:target.kind,url:url.href});
  }
  return jobs;
}
export function consumeRecovery(partners,{token,password,confirmation},{now=Date.now()}={}) {
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw Error(recoveryError);
  const tokenHash=hash(token);
  const target=accounts(partners).find(({record})=>{
    const proof=record.account.passwordRecovery;
    return proof && /^[a-f0-9]{64}$/.test(proof.hash) && timingSafeEqual(Buffer.from(proof.hash,'hex'),Buffer.from(tokenHash,'hex')) && proof.expires>now && proof.email===normalize(record.email) && proof.passwordHash===record.account.passwordHash;
  });
  if(!target)throw Error(recoveryError);
  if(typeof password!=='string'||password.length<10||password.length>128||!/[A-Z]/.test(password)||!/[a-z]/.test(password)||!/[0-9]/.test(password)||!/[\p{P}\p{S}]/u.test(password))throw Error('استخدم من 10 إلى 128 حرفًا، مع حرف إنجليزي كبير وحرف صغير ورقم ورمز.');
  if(password!==confirmation)throw Error('كلمتا المرور غير متطابقتين.');
  const account=target.record.account,salt=randomBytes(32).toString('hex');
  account.salt=salt;account.passwordHash=scryptSync(password,salt,64).toString('hex');
  for(const key of ['sessionHash','sessionExpires','employeeSessionExpires','managerSessionExpirations','passwordRecovery'])delete account[key];
  // Undefined enables the legacy browser-only session path; null explicitly revokes it.
  account.sessionHash=null;
  account.managerSessions=[];account.nativePushTokens=[];account.pushSubscriptions=[];
  account.passwordChangedAt=new Date(now).toISOString();
  return {email:target.record.email,name:target.record.nameAr||target.record.contactName||target.record.name,company:target.company.workspace?.company||target.company.name,kind:target.kind};
}
export class RecoveryThrottle {
  buckets=new Map();
  allow(key,now=Date.now()){
    for(const [id,bucket] of this.buckets)if(now-bucket.start>=900000)this.buckets.delete(id);
    let bucket=this.buckets.get(key);
    if(!bucket){if(this.buckets.size>=10000)return false;bucket={start:now,count:0};this.buckets.set(key,bucket);}
    return ++bucket.count<=10;
  }
}
