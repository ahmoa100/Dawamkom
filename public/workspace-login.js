const messages = {
  ar: {
    email: 'تسجيل الدخول بالبريد الإلكتروني', submit: 'متابعة', select: 'اختر المؤسسة',
    empty: 'لم نجد مؤسسة مفعّلة تطابق البيانات المدخلة.', error: 'تعذّر البحث. حاول مرة أخرى.',
    admin: 'مسؤول الشركة', employee: 'موظف', title: 'تسجيل الدخول | دوامكم',
  },
  en: {
    email: 'Sign in by email', submit: 'Continue', select: 'Choose your organization',
    empty: 'No active organization matches your search.', error: 'Search failed. Please try again.',
    admin: 'Company administrator', employee: 'Employee', title: 'Sign in | Dawamkom',
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
  for (const match of matches) {
    const link = document.createElement('a');
    link.className = 'button secondary';
    link.href = match.url;
    link.textContent = match.name + ' · ' + copy[match.role];
    if (match.role === 'employee') link.addEventListener('click', () => {
      try { sessionStorage.setItem('dawamkom-login-email:' + match.url, searchedEmail); } catch {}
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
