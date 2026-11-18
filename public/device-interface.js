// Screen width alone must not turn a desktop manager into the mobile interface.
export function isMobileDevice(device = navigator) {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(device.userAgent ?? '') ||
    ((device.platform === 'MacIntel' || /Macintosh/.test(device.userAgent ?? '')) && device.maxTouchPoints > 1);
}
