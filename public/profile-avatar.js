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
document.addEventListener('click', event => {
  const avatar = event.target.closest('[data-profile-avatar]');
  if (!avatar) return;
  event.preventDefault(); event.stopPropagation();
  if (avatar.getAttribute('aria-busy') === 'true') return;
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp';
  input.onchange = async () => {
    const file = input.files?.[0]; if (!file) return;
    let notice = document.querySelector('#profile-photo-status');
    if (!notice) { notice = document.createElement('p'); notice.id = 'profile-photo-status'; notice.setAttribute('role','status'); notice.className='hint'; document.querySelector('#main, [data-employee-view="profile"]')?.prepend(notice); }
    try {
      if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 5*1024*1024) throw Error(arabic()?'اختر صورة PNG أو JPG أو WebP بحد أقصى 5 ميجابايت.':'Choose a PNG, JPG or WebP image up to 5 MB.');
      avatar.setAttribute('aria-busy','true');
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas'); canvas.width=canvas.height=320;
      const context = canvas.getContext('2d'); context.fillStyle='#e8e5dc';context.fillRect(0,0,320,320);
      const side=Math.min(bitmap.width,bitmap.height);
      context.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,320,320);bitmap.close();
      const value=canvas.toDataURL('image/jpeg',.86);
      const prefix=location.pathname.match(/^\/company\/[^/]+/)?.[0] || '';
      const endpoint=location.pathname.endsWith('/employee')?'/api/employee/avatar':'/api/account/avatar';
      const response=await fetch(prefix+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({photo:value})});
      const result=await response.json();if(!response.ok)throw Error(result.error);
      displayProfileAvatar(result.photo);
      document.dispatchEvent(new CustomEvent('profile-avatar-updated',{detail:result.photo}));
      if(notice)notice.textContent=arabic()?'تم حفظ الصورة الشخصية.':'Profile photo saved.';
    } catch(error) { if(notice)notice.textContent=error.message; else window.alert(error.message); }
    finally { avatar.removeAttribute('aria-busy'); }
  };
  input.click();
});
