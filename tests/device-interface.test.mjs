import test from 'node:test';
import assert from 'node:assert/strict';
import { isMobileDevice } from '../public/device-interface.js';

test('iPhone and Android managers use the mobile interface', () => {
  assert.equal(isMobileDevice({userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148', maxTouchPoints: 5}), true);
  assert.equal(isMobileDevice({userAgent: 'Mozilla/5.0 (Linux; Android 17) Chrome/140.0 Mobile Safari/537.36', maxTouchPoints: 5}), true);
});
test('desktop and touch-enabled Windows computers keep the full interface', () => {
  assert.equal(isMobileDevice({userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/140.0', maxTouchPoints: 10}), false);
  assert.equal(isMobileDevice({userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)', platform: 'MacIntel', maxTouchPoints: 0}), false);
});
test('iPads requesting desktop websites still use the mobile interface', () => {
  assert.equal(isMobileDevice({userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 5}), true);
});
