import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';

test('release assets cache and compress while HTML and account responses remain fresh',async()=>{
 const root=path.resolve(import.meta.dirname,'..');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dawamkom-assets-'));
 for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.mjs')))fs.copyFileSync(path.join(root,file),path.join(dir,file));
 fs.cpSync(path.join(root,'public'),path.join(dir,'public'),{recursive:true});
 const env={...process.env,PORT:'0',DAWAMAK_HOST:'127.0.0.1'};
 for(const key of ['DAWAMAK_STORAGE_BUCKET','DAWAMAK_MAIL_WEBHOOK','DAWAMAK_SES_FROM','DAWAMAK_PORT'])delete env[key];
 const child=spawn(process.execPath,['server.mjs'],{cwd:dir,env,stdio:['ignore','pipe','pipe']});
 try{
 const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server timeout')),10000);child.stdout.on('data',chunk=>{const match=String(chunk).match(/port (\d+)/);if(match){clearTimeout(timer);resolve(match[1]);}});child.on('exit',code=>{clearTimeout(timer);reject(Error('Server exit '+code));});});
 const base='http://127.0.0.1:'+port;
 const versionResponse=await fetch(base+'/api/version');const {version}=await versionResponse.json();assert.equal(versionResponse.headers.get('cache-control'),'no-store');
 const html=await fetch(base+'/employee');assert.equal(html.headers.get('cache-control'),'no-store');assert.match(await html.text(),new RegExp('/employee.js\\?v='+version));
 const plain=await fetch(base+'/employee.js',{headers:{'Accept-Encoding':'identity'}});const text=await plain.text();assert.equal(plain.headers.get('cache-control'),'public, no-cache');assert.equal(plain.headers.get('content-encoding'),null);
 assert.ok(text.includes("from './punch-feedback.js?v="+version+"'"));
 const cached=await fetch(base+'/employee.js',{headers:{'If-None-Match':plain.headers.get('etag')}});assert.equal(cached.status,304);assert.equal(await cached.text(),'');
 const compressed=await fetch(base+'/employee.js?v='+version,{headers:{'Accept-Encoding':'gzip'}});assert.equal(compressed.headers.get('content-encoding'),'gzip');assert.equal(compressed.headers.get('vary'),'Accept-Encoding');assert.equal(compressed.headers.get('cache-control'),'public, max-age=31536000, immutable');assert.equal(await compressed.text(),text);
 const disabled=await fetch(base+'/employee.js',{headers:{'Accept-Encoding':'gzip;q=0'}});assert.equal(disabled.headers.get('content-encoding'),null);
 const worker=await fetch(base+'/employee-notifications-sw.js');assert.equal(worker.headers.get('cache-control'),'no-store');
 const css=await fetch(base+'/style.css');const styles=await css.text();assert.ok(!styles.includes('fonts.googleapis.com'));assert.match(styles,/font-tajawal-arabic/);
 const font=await fetch(base+'/font-inter-latin-400-800.woff2');assert.equal(font.status,200);assert.match(font.headers.get('content-type'),/font\/woff2/);
 const session=await fetch(base+'/api/employee/session');assert.equal(session.headers.get('cache-control'),'no-store');
 }finally{child.kill();await new Promise(resolve=>child.once('exit',resolve));fs.rmSync(dir,{recursive:true,force:true});}
});
