import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/profile-avatar.js',import.meta.url),'utf8').replace(/export /g,'');
function harness({bitmapFails=false,decodeFails=false}={}) {
 const listeners={},events=[],draws=[],revoked=[];let clicked=false;
 const avatar={attrs:{},getAttribute(k){return this.attrs[k]},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},replaceChildren(){}};
 const elements=new Map();
 const document={documentElement:{lang:'en'},querySelector(s){return s==='#employee-toast'?{}:elements.get(s)||null},querySelectorAll(){return [avatar]},addEventListener(k,fn){listeners[k]=fn},body:{append(el){elements.set('#'+el.id,el)}},createElement(tag){if(tag==='canvas')return {getContext(){return {fillRect(){},drawImage(...args){draws.push(args)}}},toDataURL(){return 'data:image/jpeg;base64,/9j/AA=='}};return {remove(){elements.delete('#'+this.id)},click(){clicked=true}}}};
 class Image{set src(v){if(v)queueMicrotask(()=>decodeFails?this.onerror():this.onload())}naturalWidth=4032;naturalHeight=3024;}
 const context={document,Image,URL:{createObjectURL(){return 'blob:photo'},revokeObjectURL(u){revoked.push(u)}},createImageBitmap:async()=>{if(bitmapFails)throw Error('unsupported');return {width:4032,height:3024,close(){}}},CustomEvent:class{constructor(type,opts){this.type=type;this.detail=opts.detail}},location:{pathname:'/company/demo/employee/'},AbortController,TypeError,setTimeout,clearTimeout,queueMicrotask,fetch:async(url,opts)=>{context.sent={url,body:JSON.parse(opts.body)};return {ok:true,json:async()=>({saved:true,photo:context.sent.body.photo})}}};
 document.dispatchEvent=e=>events.push(e);vm.createContext(context);vm.runInContext(source,context);
 return {context,draws,revoked,events,elements,avatar,click(){listeners.click({target:{closest:()=>avatar},preventDefault(){},stopPropagation(){}});assert.ok(clicked)}};
}
test('large iPhone HEIC camera photo is cropped and resized before upload',async()=>{
 const h=harness({bitmapFails:true});const value=await h.context.prepareProfilePhoto({type:'image/heic',size:9*1024*1024,name:'IMG.HEIC'});
 assert.match(value,/^data:image\/jpeg;base64,/);assert.deepEqual(h.draws[0].slice(1),[504,0,3024,3024,0,0,320,320]);assert.deepEqual(h.revoked,['blob:photo']);
});
test('native picker stays attached until confirmed upload and employee trailing slash uses employee endpoint',async()=>{
 const h=harness();h.click();const input=h.elements.get('#profile-photo-picker');assert.ok(input);input.files=[{type:'image/jpeg',size:8*1024*1024}];await input.onchange();
 assert.equal(h.context.sent.url,'/company/demo/api/employee/avatar');assert.equal(h.elements.has('#profile-photo-picker'),false);assert.equal(h.avatar.attrs['aria-busy'],undefined);assert.equal(h.events.find(e=>e.type==='profile-avatar-updated').detail,h.context.sent.body.photo);assert.equal(h.events.at(-1).detail.tone,'success');
});
test('failed decode releases object URL and gives actionable error without an upload',async()=>{
 const h=harness({bitmapFails:true,decodeFails:true});await assert.rejects(h.context.prepareProfilePhoto({type:'image/heif',size:100}),/Could not read/);assert.deepEqual(h.revoked,['blob:photo']);assert.equal(h.context.sent,undefined);
});
test('failed server confirmation never announces success or replaces the avatar',async()=>{
 const h=harness();h.context.fetch=async()=>({ok:false,json:async()=>({error:'Upload denied'})});h.click();h.elements.get('#profile-photo-picker').files=[{type:'image/png',size:100}];await h.elements.get('#profile-photo-picker').onchange();assert.equal(h.events.some(e=>e.type==='profile-avatar-updated'),false);assert.equal(h.events.at(-1).detail.tone,'error');assert.equal(h.events.at(-1).detail.message,'Upload denied');
});
test('unsafe and oversized originals are rejected before decoding',async()=>{
 const h=harness();await assert.rejects(h.context.prepareProfilePhoto({type:'image/svg+xml',size:100}),/Choose/);await assert.rejects(h.context.prepareProfilePhoto({type:'image/jpeg',size:26*1024*1024}),/25 MB/);
});
