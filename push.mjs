const { DAWAMAK_PUSH_PUBLIC_KEY: publicKey, DAWAMAK_PUSH_PRIVATE_KEY: privateKey } = process.env;
export const pushPublicKey = publicKey && privateKey ? publicKey : null;

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
