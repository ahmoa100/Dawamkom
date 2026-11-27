import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {nativeAppearance,nativeThemeMessage} from '../dawamkom-ios/appearance.js';
const code=readFileSync(new URL('../public/theme.js',import.meta.url),'utf8');
function page(saved,blocked=false){
  const listeners={},pickers=[{value:''}],root={dataset:{},style:{}},metas={color:{},scheme:{}};
  const document={documentElement:root,querySelector:selector=>selector.includes('theme-color')?metas.color:metas.scheme,querySelectorAll:selector=>selector==='[data-theme-picker]'?pickers:[],addEventListener:(name,fn)=>listeners[name]=fn};
  const storage=new Map(saved===undefined?[]:[['dawamkom-appearance',saved]]);
  const window={addEventListener:(name,fn)=>listeners[name]=fn};
  runInNewContext(code,{window,document,localStorage:{getItem:key=>{if(blocked)throw Error('Blocked');return storage.get(key);},setItem:(key,value)=>{if(blocked)throw Error('Blocked');storage.set(key,value);}}});
  return {window,root,listeners,pickers,storage,metas};
}
test('appearance defaults to dark, rejects invalid saved values, and applies saved light before rendering',()=>{
  assert.equal(page().root.dataset.theme,'dark');assert.equal(page('unexpected').root.dataset.theme,'dark');
  const light=page('light');assert.equal(light.root.dataset.theme,'light');assert.equal(light.root.style.colorScheme,'light');assert.equal(light.metas.color.content,'#e8e5dc');
});
test('theme choice persists per device and other tabs follow storage events',()=>{
  const current=page();current.window.dawamkomTheme.set('light');assert.equal(current.storage.get('dawamkom-appearance'),'light');assert.equal(current.pickers[0].value,'light');
  current.listeners.storage({key:'dawamkom-appearance',newValue:'dark'});assert.equal(current.root.dataset.theme,'dark');
  assert.equal(page(current.storage.get('dawamkom-appearance')).root.dataset.theme,'light');
});
test('blocked browser storage does not prevent switching appearance',()=>{
  const current=page(undefined,true);current.window.dawamkomTheme.set('light');assert.equal(current.root.dataset.theme,'light');
});

test('native frame follows trusted appearance messages and rejects other origins or values',()=>{
  assert.equal(nativeThemeMessage('https://www.dawamkom.net/company/test/employee',{type:'appearance',theme:'light'}),'light');
  assert.equal(nativeThemeMessage('https://www.dawamkom.net/support',{type:'appearance',theme:'dark'}),'dark');
  for(const url of ['https://www.dawamkom.net.evil.test/','https://evil.test/','invalid','http://www.dawamkom.net/']) assert.equal(nativeThemeMessage(url,{type:'appearance',theme:'light'}),null);
  assert.equal(nativeThemeMessage('https://www.dawamkom.net/',{type:'appearance',theme:'invalid'}),null);
  assert.equal(nativeAppearance.light.barStyle,'dark-content');
  const current=page('light'),messages=[];
  assert.equal(current.root.dataset.dawamkomApp, undefined);
  current.window.ReactNativeWebView={postMessage:message=>messages.push(JSON.parse(message))};
  current.window.dawamkomTheme.set('dark');current.window.dawamkomTheme.set('light');
  assert.equal(current.root.dataset.dawamkomApp, 'true');
  assert.deepEqual(messages,[{type:'appearance',theme:'dark'},{type:'appearance',theme:'light'}]);
});

test('medium is website-only and retired white preferences fall back to light',()=>{
  assert.equal(page('white').window.dawamkomTheme.get(),'light');
  const web=page('medium');
  assert.equal(web.root.dataset.theme,'light');
  assert.equal(web.root.dataset.appearance,'medium');
  assert.equal(web.metas.color.content,'#899e9c');
  const messages=[];
  web.window.ReactNativeWebView={postMessage:message=>messages.push(JSON.parse(message))};
  web.window.dawamkomTheme.set('medium');
  assert.equal(web.window.dawamkomTheme.get(),'light');
  assert.equal(web.root.dataset.appearance,'light');
  assert.equal(messages[0].theme,'light');
});
