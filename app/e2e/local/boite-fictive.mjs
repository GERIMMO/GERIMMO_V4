import http from 'node:http';
import crypto from 'node:crypto';
const messages=[],keys=new Map();
http.createServer(async(req,res)=>{
 res.setHeader('Content-Type','application/json');
 if(req.method==='GET'&&req.url==='/messages'){res.end(JSON.stringify(messages));return;}
 if(req.method==='POST'&&req.url==='/emails'){
 let b='';for await(const x of req)b+=x;
 const m=JSON.parse(b),key=req.headers['idempotency-key'];
 if(!m.to.every(a=>a.endsWith('@example.invalid')||a.endsWith('@example.com'))){res.statusCode=400;res.end('{"error":"Destinataire non fictif"}');return;}
 const id=keys.get(key)??'mail-fictif-'+crypto.randomUUID();
 if(!key||!keys.has(key)){messages.push({...m,id});if(key)keys.set(key,id);}
 res.end(JSON.stringify({id}));return;
 }
 res.statusCode=404;res.end('{}');
}).listen(55520,'127.0.0.1');
