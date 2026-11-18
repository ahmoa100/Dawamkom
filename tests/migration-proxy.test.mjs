import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {once} from 'node:events';
import {PassThrough} from 'node:stream';
import {createMigrationProxy,destinationHost} from '../ops/aws-consolidation/migration-proxy.mjs';

test('DNS bridge streams writes, cookies and redirects to a pinned TLS destination', async()=>{
  const received=[];
  const upstream=createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    received.push({method:req.method,path:req.url,body:Buffer.concat(chunks).toString(),headers:req.headers});
    res.writeHead(303, {'set-cookie':['a=1; HttpOnly; Secure','b=2; SameSite=Strict'],
      location:'/company/example/',connection:'close'});res.end('saved');
  });
  upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
  const forwarded=[];
  const proxy=createMigrationProxy((options,callback)=>{
    forwarded.push(options);
    return request({...options,protocol:'http:',hostname:'127.0.0.1',port:upstream.address().port},callback);
  });
  proxy.listen(0,'127.0.0.1');await once(proxy,'listening');
  try{
    const response=await new Promise((resolve,reject)=>{
      const req=request({host:'127.0.0.1',port:proxy.address().port,path:'/api/punch?x=1',method:'POST',
        headers:{'content-type':'application/json',cookie:'session=example',host:'www.dawamkom.net',
          connection:'x-remove','x-remove':'private-hop'}},resolve);
      req.on('error',reject);req.end('{"punch":"in"}');
    });
    let body='';for await(const chunk of response)body+=chunk;
    assert.equal(response.statusCode,303);assert.equal(body,'saved');
    assert.deepEqual(response.headers['set-cookie'],['a=1; HttpOnly; Secure','b=2; SameSite=Strict']);
    assert.equal(response.headers.location,'/company/example/');
    assert.equal(response.headers['x-dawamkom-migration-bridge'],'1');
    assert.equal(received[0].body,'{"punch":"in"}');assert.equal(received[0].path,'/api/punch?x=1');
    assert.equal(received[0].headers.cookie,'session=example');
    assert.equal(received[0].headers.host,destinationHost);assert.equal(received[0].headers['x-remove'],undefined);
    assert.equal(forwarded[0].hostname,destinationHost);assert.equal(forwarded[0].rejectUnauthorized,true);
    const health=await fetch('http://127.0.0.1:'+proxy.address().port+'/health');
    assert.equal(health.headers.get('x-dawamkom-mode'),'proxy');assert.equal(received.length,1);
  }finally{proxy.closeAllConnections();upstream.closeAllConnections();await Promise.all([new Promise(r=>proxy.close(r)),new Promise(r=>upstream.close(r))]);}
});

test('bridge fails closed without exposing upstream errors or accepting absolute URLs', async()=>{
  let calls=0;
  const proxy=createMigrationProxy(()=>{
    calls++;const stream=new PassThrough();
    setImmediate(()=>stream.destroy(new Error('private-provider-detail')));return stream;
  });
  proxy.listen(0,'127.0.0.1');await once(proxy,'listening');
  try{
    const response=await fetch('http://127.0.0.1:'+proxy.address().port+'/api/punch',{method:'POST',body:'test'});
    assert.equal(response.status,503);assert.equal(response.headers.get('retry-after'),'15');
    assert.doesNotMatch(await response.text(),/private-provider-detail/);
    const absolute=await new Promise((resolve,reject)=>{
      const req=request({host:'127.0.0.1',port:proxy.address().port,path:'https://untrusted.example/steal'},resolve);
      req.on('error',reject);req.end();
    });
    absolute.resume();assert.equal(absolute.statusCode,400);assert.equal(calls,1);
  }finally{proxy.closeAllConnections();await new Promise(r=>proxy.close(r));}
});
