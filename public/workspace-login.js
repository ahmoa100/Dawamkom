const messages = {
  ar: {
    email: 'تسجيل الدخول بالبريد الإلكتروني', submit: 'متابعة', select: 'اختر المؤسسة',
    empty: 'لم نجد مؤسسة مفعّلة تطابق البيانات المدخلة.', error: 'تعذّر البحث. حاول مرة أخرى.',
    title: 'تسجيل الدخول | دوامكم',
  },
  en: {
    email: 'Sign in by email', submit: 'Continue', select: 'Choose your organization',
    empty: 'No active organization matches your search.', error: 'Search failed. Please try again.',
    title: 'Sign in | Dawamkom',
  },
};
const $ = id => document.getElementById(id);
const form = $('workspace-search');
const input = $('search-input');
const submit = $('search-submit');
const status = $('search-status');
const results = $('search-results');
let language = 'ar';
let matches = [];
let message = '';
let searchedEmail = '';
let search;

function renderResults() {
  const copy = messages[language];
  status.textContent = copy[message] ?? '';
  results.replaceChildren();
  const companies = new Map(matches.map(match => [match.url.replace(/\/(login|employee)$/, ''), match.name]));
  for (const [prefix, name] of companies) {
    const link = document.createElement('a');
    link.className = 'button secondary';
    link.href = prefix + '/access';
    link.textContent = name;
    link.addEventListener('click', () => {
      try { sessionStorage.setItem('dawamkom-login-email:' + prefix + '/access', searchedEmail); } catch {}
    });
    results.append(link);
  }
}

function render() {
  const copy = messages[language];
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  document.title = copy.title;
  $('login-brand').textContent = language === 'ar' ? 'دوامكم' : 'Dawamkom';
  $('login-language').textContent = language === 'ar' ? '◎ EN' : '◎ العربية';
  $('login-language').lang = language === 'ar' ? 'en' : 'ar';
  $('search-label').textContent = copy.email;
  submit.textContent = copy.submit;
  $('workspace-forgot').textContent=language==='ar'?'نسيت كلمة المرور؟':'Forgot your password?';
  renderResults();
}

$('login-language').onclick = () => {
  language = language === 'ar' ? 'en' : 'ar';
  render();
};
function resetSearch() {
  search?.abort();
  search = undefined;
  submit.disabled = false;
  matches = [];
  message = '';
  renderResults();
}
input.addEventListener('input', resetSearch);
function pastedEmail(text) {
  const addresses = text?.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+/gi);
  return addresses?.length === 1 && addresses[0].length <= input.maxLength ? addresses[0] : null;
}
input.addEventListener('paste', event => {
  const email = pastedEmail(event.clipboardData?.getData('text/plain'));
  if (!email) return;
  event.preventDefault();
  input.value = email;
  resetSearch();
});
input.addEventListener('input', event => {
  if (event.inputType !== 'insertFromPaste' || input.validity.valid) return;
  const email = pastedEmail(input.value);
  if (email) input.value = email;
});
form.onsubmit = async event => {
  event.preventDefault();
  resetSearch();
  const request = new AbortController();
  search = request;
  const value = input.value.trim();
  submit.disabled = true;
  try {
    const response = await fetch('/api/workspace-lookup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: value }), signal: request.signal,
    });
    if (!response.ok) throw new Error('Search failed');
    const data = await response.json();
    if (search !== request) return;
    searchedEmail = value;
    matches = data.matches;
    message = matches.length ? 'select' : 'empty';
  } catch {
    if (search === request) message = 'error';
  } finally {
    if (search === request) {
      submit.disabled = false;
      renderResults();
      results.querySelector('a')?.focus();
    }
  }
};
render();
async function resumeWorkspace() {
  let redirecting = false;
  try {
    if (new URLSearchParams(location.search).get('signed-out') === '1') {
      localStorage.removeItem('dawamkom-remembered-workspace');
      return;
    }
    const path = localStorage.getItem('dawamkom-remembered-workspace');
    const match = path?.match(/^(\/company\/[a-f0-9-]{36})\/(employee)?$/);
    if (!match) return;
    if (match[2]) { redirecting = true; location.replace(path); return; }
    const endpoint = match[2] ? '/api/employee/session' : '/api/company-session';
    const response = await fetch(match[1] + endpoint, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (response.ok && !input.value && !search) { redirecting = true; location.replace(path); return; }
    if ([401, 403, 404].includes(response.status)) localStorage.removeItem('dawamkom-remembered-workspace');
  } catch {}
  finally { if (!redirecting) document.documentElement.classList.remove('session-restoring'); }
}
void resumeWorkspace();
