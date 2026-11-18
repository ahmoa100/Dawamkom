import test from 'node:test';
import assert from 'node:assert/strict';
import {notificationDisplay,validateNotificationDisplay,newNotificationIds} from '../public/notification-display.js';
test('notification display defaults and bounded duration',()=>{
 assert.deepEqual(notificationDisplay(),{mode:'popup',seconds:5});
 for(const seconds of [2,5,60])assert.deepEqual(validateNotificationDisplay({mode:'badge',seconds}),{mode:'badge',seconds});
 for(const seconds of [0,1,61,2.5,NaN])assert.throws(()=>validateNotificationDisplay({mode:'popup',seconds}));
 assert.throws(()=>validateNotificationDisplay({mode:'invalid',seconds:5}));
});
test('new alerts show once per session and distinct approval stages remain distinct',()=>{
 const seen=new Set(),first=[{id:'request-r-manager1'},{id:'document-d-2026-01-01'}];
 assert.equal(newNotificationIds(first,seen).length,2);
 assert.equal(newNotificationIds(first,seen).length,0);
 assert.deepEqual(newNotificationIds([{id:'request-r-manager2'}],seen),[{id:'request-r-manager2'}]);
});
