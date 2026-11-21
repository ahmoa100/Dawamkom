// Never report an uncertain delivery as either a saved or a rejected punch.
export const punchMessages = {
  locating: ['جارٍ تحديد موقعك…', 'Finding your location…'],
  sending: ['جارٍ إرسال البصمة، انتظر التأكيد…', 'Sending your punch. Please wait for confirmation…'],
  offline: ['لم تُرسل البصمة: لا يوجد اتصال بالإنترنت. اتصل ثم حاول مجددًا.', 'Punch not sent: you are offline. Reconnect and try again.'],
  locationDenied: ['لم تُرسل البصمة: اسمح بالوصول إلى الموقع من إعدادات الجهاز أو المتصفح.', 'Punch not sent: allow location access in your device or browser settings.'],
  locationTimeout: ['لم تُرسل البصمة: انتهت مهلة تحديد الموقع. حاول مجددًا في مكان أوضح.', 'Punch not sent: location timed out. Try again with a clearer GPS signal.'],
  locationUnavailable: ['لم تُرسل البصمة: تعذّر تحديد موقعك. تأكد من تشغيل خدمة الموقع وحاول مجددًا.', 'Punch not sent: your location is unavailable. Turn on location services and try again.'],
  noLocation: ['لم تُرسل البصمة: لم تحدد الإدارة موقعًا مسموحًا للحضور. تواصل مع مديرك.', 'Punch not sent: your employer has not configured an attendance location. Contact your manager.'],
  outside: ['لم تُسجل البصمة: الوقت خارج نافذة تسجيل البصمة المسموح بها. يمكنك تقديم طلب تصحيح بصمة.', 'Punch not recorded: outside the allowed time window. You can submit a punch correction request.'],
  missingIn: ['لم تُسجل بصمة الانصراف: لا توجد بصمة دخول سابقة. قدّم طلب تصحيح بصمة إذا حضرت.', 'Clock-out not recorded: there is no prior clock-in. Submit a punch correction if you attended.'],
  cooldown: ['لم تُسجل البصمة: انتظر قليلًا قبل تسجيل بصمة أخرى.', 'Punch not recorded: wait before recording another punch.'],
  uncertain: ['تعذّر تأكيد وصول البصمة بسبب مشكلة في الاتصال أو الخادم. راجع سجل الحضور قبل إعادة المحاولة؛ قد تكون وصلت.', 'Could not confirm your punch because of a connection or server problem. Check your attendance record before retrying; it may have arrived.'],
  savedIn: ['تم حفظ بصمة الحضور بنجاح.', 'Your clock-in was saved successfully.'],
  savedOut: ['تم حفظ بصمة الانصراف بنجاح.', 'Your clock-out was saved successfully.'],
  savedOutMissingIn: ['تم حفظ بصمة الانصراف. بصمة الدخول مفقودة؛ يمكنك تقديم طلب تصحيح بصمة دخول.', 'Your clock-out was saved. Your clock-in is missing; you can submit a clock-in correction request.'],
};
const rejectionMessages = {
  'Outside the punch time window.': 'outside',
  'Clock in before clocking out.': 'missingIn',
  'Wait before recording another punch.': 'cooldown',
  'You have already clocked out.': ['لم تُسجل بصمة جديدة: لديك بصمة انصراف مسجلة لهذه الفترة. راجع سجل الحضور.', 'No new punch recorded: you have already clocked out for this shift. Check your attendance record.'],
  'You are outside the approved workplace area.': ['لم تُسجل البصمة: أنت خارج موقع العمل المسموح.', 'Punch not recorded: you are outside the approved workplace area.'],
  'Location accuracy is too low. Move closer to the workplace centre and try again.': ['لم تُسجل البصمة: دقة الموقع غير كافية. اقترب من مركز موقع العمل وحاول مجددًا.', 'Punch not recorded: location accuracy is too low. Move closer to the workplace centre and try again.'],
  'You have already clocked in.': ['لم تُسجل بصمة جديدة: لديك بصمة حضور مسجلة مسبقًا. راجع سجل الحضور.', 'No new punch recorded: you have already clocked in. Check your attendance record.'],
};
export async function submitPunch({timing, nextPunch, hasLocations, anywhere, online, locate, send, feedback}) {
  const report = (key, tone='error') => feedback(punchMessages[key] ?? key, key === 'cooldown' ? 'notice' : tone);
  if (!online) { report('offline'); return; }
  if (timing.cooldown) { report('cooldown'); return; }
  if (!timing.allowed) { report('outside'); return; }
  if (!anywhere && !hasLocations) { report('noLocation'); return; }
  let coords = {};
  if (!anywhere) {
    report('locating','pending');
    try { ({coords} = await locate()); }
    catch(error) { report(error?.code === 1 ? 'locationDenied' : error?.code === 3 ? 'locationTimeout' : 'locationUnavailable'); return; }
  }
  report('sending','pending');
  let result;
  try { result = await send({latitude:coords.latitude,longitude:coords.longitude,accuracy:coords.accuracy,kind:timing.kind}); }
  catch { report('uncertain'); return; }
  if (!result.ok) {
    if (result.httpStatus >= 500) report('uncertain');
    else if ([401,403].includes(result.httpStatus) && !rejectionMessages[result.error])
      report(['لم تُسجل البصمة: تعذّر التحقق من صلاحية الدخول. حدّث الصفحة وسجّل الدخول مجددًا إذا طُلب منك.', 'Punch not recorded: your access could not be verified. Refresh and sign in again if prompted.']);
    else if (['You have already clocked in.', 'You have already clocked out.'].includes(result.error)) report(rejectionMessages[result.error], 'notice');
    else report(rejectionMessages[result.error] ?? [
      'لم تُسجل البصمة: ' + (result.error || 'رفض الخادم الطلب. تواصل مع مديرك.'),
      'Punch not recorded: ' + (result.error || 'The server rejected the request. Contact your manager.'),
    ]);
    return;
  }
  if (result.saved !== true) { report('uncertain'); return; }
  report(timing.kind === 'in' ? 'savedIn' : nextPunch !== 'out' ? 'savedOutMissingIn' : 'savedOut','success');
  return result;
}
