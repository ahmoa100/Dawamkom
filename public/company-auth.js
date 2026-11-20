const form = document.querySelector('#company-auth');
const status = form.querySelector('[role="status"]');
const unified = form.dataset.action === 'access';
const change = document.querySelector('#company-access-change');
const recoveryLink=document.querySelector('[data-company-forgot]');
const recoveryCompany=location.pathname.match(/^\/company\/([a-f0-9-]{36})\//)?.[1];
if(recoveryLink&&recoveryCompany)recoveryLink.href='/forgot-password?company='+recoveryCompany+'&kind='+(unified?'all':'company');
if (unified) {
  try {
    const key = 'dawamkom-login-email:' + location.pathname;
    form.elements.email.value = sessionStorage.getItem(key) ?? '';
    document.querySelector('#company-access-email').hidden = Boolean(form.elements.email.value);
  } catch {}
}
async function submit(button, requestChange = false) {
  button.disabled = true;
  const body = Object.fromEntries(new FormData(form));
  body.token = new URLSearchParams(location.hash.slice(1)).get('activate');
  const remember = path => {
    try {
      if (body.remember === 'on') localStorage.setItem('dawamkom-remembered-workspace', path);
      else localStorage.removeItem('dawamkom-remembered-workspace');
    } catch {}
  };
  try {
    const post = (url, data) => fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const prefix = location.pathname.replace(/\/access$/, '');
    let response = requestChange ? null : await post(location.pathname, body);
    if (unified && (requestChange || response.status === 401)) {
      response = await post(prefix + '/api/employee/login', { ...body, requestChange });
      const employee = await response.json();
      if (employee.changeRequired) {
        change.hidden = false;
        status.textContent = 'هذا المتصفح غير معتمد. قدّم طلب تغيير المتصفح.';
        return;
      }
      if (!response.ok) throw new Error(employee.error);
      if (employee.approved) remember(prefix + '/employee');
      location.replace(prefix + '/employee');
      return;
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    remember(result.url);
    location.replace(result.url);
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}
form.addEventListener('submit', event => {
  event.preventDefault();
  submit(event.submitter);
});
if (change) change.onclick = () => submit(change, true);

if(form.dataset.action!=='activate'){
  const switchAccount=document.createElement('a');
  switchAccount.href='/?signed-out=1';
  switchAccount.className='button secondary compact';
  switchAccount.textContent='تغيير الحساب أو الشركة / Change account or company';
  form.append(switchAccount);
}
