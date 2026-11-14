import { randomBytes, createHash } from 'node:crypto';

const adminEmail = 'ahmoa100@gmail.com';
const clientId = process.env.DAWAMAK_GOOGLE_CLIENT_ID;
const clientSecret = process.env.DAWAMAK_GOOGLE_CLIENT_SECRET;
const origin = process.env.DAWAMAK_PUBLIC_ORIGIN;
const callback = clientId && clientSecret && origin?.startsWith('https://')
  ? new URL('/admin/google/callback', origin).href : null;
const loginOrigin = callback ? new URL(callback).origin : null;
const alternateLoginHosts = new Set([
  'www.dawamkom.net',
  'dawamak-test.3yex7eer5s79c.us-east-1.cs.amazonlightsail.com',
]);
const sessions = new Map();
const flows = new Map();
const token = () => randomBytes(32).toString('base64url');
const readCookie = (req, name) => req.headers.cookie?.split(';').map(part => part.trim())
  .find(part => part.startsWith(name + '='))?.slice(name.length + 1);
const cookie = (name, value, age) => `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;

function remember(map, key, details, seconds) {
  const now = Date.now();
  for (const [id, entry] of map) {
    if (entry.expires <= now) map.delete(id);
  }
  if (map.size >= 512) map.delete(map.keys().next().value);
  map.set(key, { ...details, expires: now + seconds * 1000 });
}

export function isAdmin(req) {
  return Boolean(callback && sessions.get(readCookie(req, 'dawamkom_admin'))?.expires > Date.now());
}

export async function handleAdmin(req, res, url) {
  const redirect = (location, cookies) => {
    res.writeHead(303, { Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
      ...(cookies ? { 'Set-Cookie': cookies } : {}) });
    res.end();
  };
  const page = (status, content) => {
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    res.end(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>إدارة dawamkom</title><link rel="stylesheet" href="/style.css"><main class="preview-access"><h1>إدارة dawamkom</h1>${content}</main></html>`);
  };
  if (req.method === 'POST' && url.pathname === '/admin/logout') {
    sessions.delete(readCookie(req, 'dawamkom_admin'));
    return redirect('/', cookie('dawamkom_admin', '', 0));
  }
  if (req.method !== 'GET') return page(405, '<p>الطريقة غير مدعومة.</p>');
  if (!callback) return page(503, '<p>تسجيل دخول الإدارة غير مفعّل حاليًا.</p>');
  if (url.pathname === '/admin') {
    const requestHost = req.headers.host?.toLowerCase();
    if (alternateLoginHosts.has(requestHost) && requestHost !== new URL(loginOrigin).host) {
      const login = new URL('/admin', loginOrigin);
      if (url.searchParams.get('next') === 'super-admin') login.searchParams.set('next', 'super-admin');
      return redirect(login.href);
    }
    const next = url.searchParams.get('next') === 'super-admin' ? '/super-admin' : '/demo#staff';
    if (isAdmin(req)) return redirect(next);
    const state = token(), verifier = token();
    remember(flows, state, { verifier, next }, 600);
    const authorization = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authorization.search = new URLSearchParams({
      client_id: clientId, redirect_uri: callback, response_type: 'code', scope: 'openid email',
      state, code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256', login_hint: adminEmail, prompt: 'select_account',
    });
    return redirect(authorization.href, cookie('dawamkom_oauth', state, 600));
  }
  if (url.pathname !== '/admin/google/callback') return page(404, '<p>الصفحة غير موجودة.</p>');
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  const flow = flows.get(state);
  const retry = flow?.next === '/demo#staff' ? '/admin' : '/admin?next=super-admin';
  const denied = () => page(403, '<p>تعذّر دخول الإدارة. حاول مرة أخرى واختر حساب الإدارة المعتمد.</p><a href="' + retry + '">حاول مرة أخرى</a>');
  if (!code || state !== readCookie(req, 'dawamkom_oauth') || !flow || flow.expires <= Date.now()) return denied();
  flows.delete(state);
  try {
    const exchange = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: callback, grant_type: 'authorization_code', code_verifier: flow.verifier }),
    });
    if (!exchange.ok) return denied();
    const { access_token: accessToken } = await exchange.json();
    if (!accessToken) return denied();
    const userinfo = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: 'Bearer ' + accessToken }, redirect: 'error', signal: AbortSignal.timeout(8000),
    });
    if (!userinfo.ok) return denied();
    const identity = await userinfo.json();
    if (identity.email_verified !== true || identity.email?.toLowerCase() !== adminEmail) return denied();
    const session = token();
    sessions.delete(readCookie(req, 'dawamkom_admin'));
    remember(sessions, session, {}, 8 * 60 * 60);
    return redirect(flow.next, [cookie('dawamkom_admin', session, 8 * 60 * 60), cookie('dawamkom_oauth', '', 0)]);
  } catch {
    return page(502, '<p>تعذّر الاتصال بخدمة Google.</p><a href="' + retry + '">حاول مرة أخرى</a>');
  }
}
