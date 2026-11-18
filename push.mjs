import {runtime} from './runtime-mode.mjs';
const { DAWAMAK_PUSH_PUBLIC_KEY: publicKey, DAWAMAK_PUSH_PRIVATE_KEY: privateKey } = process.env;
export const pushPublicKey = publicKey && privateKey ? publicKey : null;

export const validExpoPushToken = token => typeof token === 'string' && /^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]{10,200}\]$/.test(token);

export async function notifyAttendance(account, companyPrefix, event) {
  if (!runtime.delivery) return;
  const title = language => language === 'en' ? 'Dawamkom' : 'دوامكم';
  const body = language => language === 'en' ? event.bodyEn : event.bodyAr;
  const url = event.url ?? companyPrefix + '/employee#attendance';
  const tasks = [];
  if (pushPublicKey && account.pushSubscriptions?.length) tasks.push((async () => {
    const {default: webpush} = await import('web-push');
    await Promise.all(account.pushSubscriptions.map(({language, ...subscription}) => webpush.sendNotification(subscription,
      JSON.stringify({title: title(language), body: body(language), url, tag: 'attendance-' + event.id}), {
        TTL: 90, timeout: 5000, vapidDetails: {subject: 'mailto:info@dawamkom.net', publicKey, privateKey},
      }).catch(error => { if (![404,410].includes(error.statusCode)) console.error('Attendance web push unavailable:', error.statusCode ?? error.name); })));
  })());
  const tokens = (account.nativePushTokens ?? []).filter(item => validExpoPushToken(item.token));
  if (tokens.length) tasks.push((async () => {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST', headers: {'Content-Type': 'application/json', ...(process.env.DAWAMAK_EXPO_ACCESS_TOKEN ?
        {Authorization: 'Bearer ' + process.env.DAWAMAK_EXPO_ACCESS_TOKEN} : {})},
      body: JSON.stringify(tokens.map(item => ({to: item.token, title: title(item.language), body: body(item.language),
        sound: 'default', channelId: 'attendance', ttl: 90, data: {url, reminderId: event.id}}))),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('Expo push HTTP ' + response.status);
    const result = await response.json();
    for (const ticket of result.data ?? []) if (ticket.status === 'error') console.error('Attendance native push unavailable:', ticket.details?.error ?? 'Unknown');
  })());
  const results = await Promise.allSettled(tasks);
  for (const result of results) if (result.status === 'rejected') console.error('Attendance delivery unavailable:', result.reason?.message ?? 'Unknown');
}

export function pushSubscription(value, language) {
  try {
    const { endpoint, keys } = value;
    const url = new URL(endpoint);
    const supportedHost = ['fcm.googleapis.com', 'updates.push.services.mozilla.com'].includes(url.hostname) ||
      url.hostname.endsWith('.push.apple.com') || url.hostname.endsWith('.notify.windows.com');
    if (url.protocol !== 'https:' || !supportedHost || url.port || url.username || url.password ||
        endpoint.length > 2048 || !/^[\w-]{87}$/.test(keys.p256dh) || !/^[\w-]{22}$/.test(keys.auth)) return null;
    return { endpoint: url.href, keys: { p256dh: keys.p256dh, auth: keys.auth }, language: language === 'en' ? 'en' : 'ar' };
  } catch {
    return null;
  }
}

export async function notifyApproval(account, companyPrefix, id) {
  if (!runtime.delivery) return;
  if (account?.nativePushTokens?.length) void notifyAttendance({nativePushTokens: account.nativePushTokens}, companyPrefix, {
    id: 'approval-' + id, bodyAr: 'تم اعتماد طلبك.', bodyEn: 'Your request was approved.', url: companyPrefix + '/employee#requests',
  });
  if (!pushPublicKey || !account?.pushSubscriptions?.length) return;
  try {
    const { default: webpush } = await import('web-push');
    await Promise.all(account.pushSubscriptions.map(({ language, ...subscription }) =>
      webpush.sendNotification(subscription, JSON.stringify({
        title: language === 'en' ? 'Dawamkom' : 'دوامكم',
        body: language === 'en' ? 'Your request was approved.' : 'تم اعتماد طلبك.',
        url: companyPrefix + '/employee#requests',
        tag: 'approval-' + id,
      }), {
        TTL: 86400, timeout: 5000,
        vapidDetails: { subject: 'mailto:info@dawamkom.net', publicKey, privateKey },
      }).catch(error => {
        if (![404, 410].includes(error.statusCode)) console.error('Push delivery unavailable:', error.statusCode ?? error.name);
      })));
  } catch (error) {
    console.error('Push configuration unavailable:', error.name);
  }
}
