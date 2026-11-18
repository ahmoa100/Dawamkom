// Temporary bridge for clients caching the old DNS. No storage or app workers.
import {createServer} from 'node:http';
import {request as httpsRequest} from 'node:https';
import {pathToFileURL} from 'node:url';

export const destinationHost = 'dawamkom-production.ybgzybtz57bge.us-east-1.cs.amazonlightsail.com';
const hopHeaders = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade']);
function forwardHeaders(input) {
  const excluded = new Set([...hopHeaders, ...(input.connection || '').toLowerCase().split(',').map(x=>x.trim())]);
  return Object.fromEntries(Object.entries(input).filter(([name])=>!excluded.has(name.toLowerCase())));
}

export function createMigrationProxy(makeRequest = httpsRequest) {
  return createServer((req, res)=>{
    if (req.url === '/health' && ['GET','HEAD'].includes(req.method)) {
      res.writeHead(200, {'Content-Type':'application/json', 'X-Dawamkom-Mode':'proxy', 'Cache-Control':'no-store'});
      return res.end(req.method === 'HEAD' ? undefined : '{"ok":true,"mode":"proxy"}');
    }
    if (!req.url?.startsWith('/')) { res.writeHead(400); return res.end(); }
    const headers = forwardHeaders(req.headers);
    headers.host = destinationHost;
    headers['x-forwarded-proto'] = 'https';
    headers['x-forwarded-host'] = 'www.dawamkom.net';
    const upstream = makeRequest({protocol:'https:', hostname:destinationHost, port:443,
      method:req.method, path:req.url, headers, rejectUnauthorized:true, timeout:120000}, reply=>{
      const output = forwardHeaders(reply.headers);
      output['x-dawamkom-migration-bridge'] = '1';
      res.writeHead(reply.statusCode, output);
      reply.on('error', ()=>res.destroy());
      reply.pipe(res);
    });
    upstream.on('timeout', ()=>upstream.destroy(new Error('Upstream timeout')));
    upstream.on('error', ()=>{
      if (res.headersSent) return res.destroy();
      res.writeHead(503, {'Content-Type':'text/plain; charset=utf-8', 'Retry-After':'15', 'Cache-Control':'no-store'});
      res.end('يجري تحديث الخدمة. يرجى المحاولة بعد قليل.');
    });
    req.on('aborted', ()=>upstream.destroy());
    res.on('close', ()=>{ if (!res.writableFinished) upstream.destroy(); });
    req.pipe(upstream);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createMigrationProxy().listen(Number(process.env.PORT || 8080), '0.0.0.0', ()=>
    console.log('Dawamkom temporary DNS bridge listening.'));
}
