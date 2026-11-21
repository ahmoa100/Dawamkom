let photo = '';
const arabic = () => document.documentElement.lang !== 'en';
export function displayProfileAvatar(value) {
  photo = value || '';
  for (const avatar of document.querySelectorAll('[data-profile-avatar]')) {
    avatar.setAttribute('aria-label', arabic() ? 'تغيير الصورة الشخصية' : 'Change profile photo');
    avatar.title = avatar.getAttribute('aria-label');
    if (photo) {
      const image = document.createElement('img'); image.alt = '';
      image.src = photo; avatar.replaceChildren(image);
    }
  }
}
const photoText = (ar, en) => arabic() ? ar : en;
function photoStatus(message, tone = 'pending') {
  document.dispatchEvent(new CustomEvent('profile-photo-status', {detail:{message,tone}}));
  if (document.querySelector('#employee-toast')) return;
  let notice = document.querySelector('#profile-photo-status');
  if (!notice) {
    notice = document.createElement('p'); notice.id = 'profile-photo-status';
    notice.setAttribute('role','status'); notice.className = 'toast';
    document.body.append(notice);
  }
  notice.textContent = message; notice.classList.toggle('error', tone === 'error');
  clearTimeout(photoStatus.timer);
  photoStatus.timer = setTimeout(() => notice.remove(), tone === 'pending' ? 60000 : 6000);
}
async function decodeProfilePhoto(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file); } catch { /* WKWebView can require the image decoder. */ }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve,reject) => {
      const image = new Image();
      const timer = setTimeout(() => { image.src = ''; reject(Error('decode')); }, 30000);
      image.onload = () => { clearTimeout(timer); resolve(image); };
      image.onerror = () => { clearTimeout(timer); reject(Error('decode')); };
      image.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
}
export async function prepareProfilePhoto(file) {
  // Camera originals can exceed 5 MB; only the small JPEG is transmitted.
  const supported = /^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) ||
    (!file.type && /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name));
  if (!supported || file.size > 25*1024*1024)
    throw Error(photoText('اختر صورة JPG أو PNG أو WebP أو HEIC بحد أقصى 25 ميجابايت.','Choose a JPG, PNG, WebP or HEIC photo up to 25 MB.'));
  let image;
  try { image = await decodeProfilePhoto(file); }
  catch { throw Error(photoText('تعذّرت قراءة الصورة. جرّب اختيار صورة JPG أو PNG من مكتبة الصور.','Could not read the photo. Try choosing a JPG or PNG from your photo library.')); }
  try {
    const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
    if (!width || !height) throw Error('Invalid image dimensions');
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 320;
    const context = canvas.getContext('2d');
    if (!context) throw Error('Image processing unavailable');
    context.fillStyle = '#e8e5dc'; context.fillRect(0,0,320,320);
    const side = Math.min(width,height);
    context.drawImage(image,(width-side)/2,(height-side)/2,side,side,0,0,320,320);
    const value = canvas.toDataURL('image/jpeg',.86);
    if (!value.startsWith('data:image/jpeg;base64,') || value.length > 665000) throw Error('Image processing failed');
    return value;
  } finally { image.close?.(); }
}
document.addEventListener('click', event => {
  const avatar = event.target.closest('[data-profile-avatar]');
  if (!avatar) return;
  event.preventDefault(); event.stopPropagation();
  if (avatar.getAttribute('aria-busy') === 'true' || document.querySelector('#profile-photo-picker')) return;
  const input = document.createElement('input');
  input.id = 'profile-photo-picker'; input.type = 'file';
  input.accept = 'image/jpeg,image/png,image/webp,image/heic,image/heif';
  input.hidden = true;
  // Keep the input alive while the native camera/photo picker is open.
  document.body.append(input);
  input.oncancel = () => input.remove();
  input.onchange = async () => {
    const file = input.files?.[0]; if (!file) { input.remove(); return; }
    avatar.setAttribute('aria-busy','true');
    photoStatus(photoText('جارٍ حفظ الصورة الشخصية…','Saving profile photo…'));
    try {
      const value = await prepareProfilePhoto(file);
      const prefix = location.pathname.match(/^\/company\/[^/]+/)?.[0] || '';
      const endpoint = /\/employee\/?$/.test(location.pathname) ? '/api/employee/avatar' : '/api/account/avatar';
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(),30000);
      let response, result;
      try {
        response = await fetch(prefix+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({photo:value}),signal:controller.signal});
        result = await response.json();
      } finally { clearTimeout(timer); }
      if (!response.ok || result.saved !== true || !result.photo) throw Error(result.error || photoText('لم يتم حفظ الصورة. أعد المحاولة.','Photo was not saved. Please try again.'));
      displayProfileAvatar(result.photo);
      document.dispatchEvent(new CustomEvent('profile-avatar-updated',{detail:result.photo}));
      photoStatus(photoText('تم حفظ الصورة الشخصية.','Profile photo saved.'),'success');
    } catch(error) {
      photoStatus(error.name === 'AbortError' || error instanceof TypeError
        ? photoText('تعذّر تأكيد حفظ الصورة. تحقق من الاتصال وأعد المحاولة.','Could not confirm the photo was saved. Check your connection and retry.')
        : error.message,'error');
    } finally { avatar.removeAttribute('aria-busy'); input.remove(); }
  };
  input.click();
});
