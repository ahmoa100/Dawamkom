import test from 'node:test';
import assert from 'node:assert/strict';
import {documentAlertPresenter} from '../public/document-alert-popup.js';

test('document modal opens on entry, waits for other dialogs, repeats at 24h, and clears on logout/resolution',()=>{
 const originalDocument=globalThis.document,originalInterval=globalThis.setInterval,originalNow=Date.now;
 let now=100000000,blocked=false;const timers=[],listeners={},roots=[];
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.open=false;}
  setAttribute(k,v){this.attributes[k]=v;}
  append(...items){this.children.push(...items);}
  showModal(){this.open=true;}
  close(){this.open=false;this.onclose?.();}
  remove(){const i=roots.indexOf(this);if(i>=0)roots.splice(i,1);}
 }
 const document={hidden:false,createElement:tag=>new Element(tag),body:{append:e=>roots.push(e)},
  querySelector:()=>blocked?{}:roots.find(e=>e.open),addEventListener:(name,fn)=>listeners[name]=fn};
 globalThis.document=document;globalThis.setInterval=fn=>timers.push(fn);Date.now=()=>now;
 const alerts=[{name:'Fictional licence',expiresOn:'2026-11-25',days:4,mode:'prominent'}];
 try{
  const presenter=documentAlertPresenter(()=> 'ar');
  presenter.update([{...alerts[0],mode:'normal'}],'owner');assert.equal(roots.length,0);
  blocked=true;presenter.update(alerts,'owner');assert.equal(roots.length,0);
  blocked=false;timers[0]();assert.equal(roots.length,1);assert.equal(roots[0].open,true);
  roots[0].close();presenter.update(alerts,'owner');assert.equal(roots.length,0);
  now+=86400000-1;timers[0]();assert.equal(roots.length,0);
  now++;timers[0]();assert.equal(roots.length,1);
  roots[0].close();document.hidden=true;listeners.visibilitychange();assert.equal(roots.length,0);
  document.hidden=false;listeners.visibilitychange();assert.equal(roots.length,1,'foreground opening presents the outstanding notice again');
  presenter.update([],null);assert.equal(roots.length,0,'logout removes sensitive document notices');
  presenter.update(alerts,'another-user');assert.equal(roots.length,1);
  presenter.update([{...alerts[0],mode:'normal'}],'another-user');assert.equal(roots.length,0);
 }finally{globalThis.document=originalDocument;globalThis.setInterval=originalInterval;Date.now=originalNow;}
});
