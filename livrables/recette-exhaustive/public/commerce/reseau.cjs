// Chargé uniquement dans le processus Next local : les deux prestataires restent en boucle locale.
const http=require('node:http'),https=require('node:https'),{syncBuiltinESMExports}=require('node:module');
if(process.env.GERIMMO_MODE!=='simulation'||process.env.STRIPE_SECRET_KEY!=='sk_test_local_commerce_fictif'||!/^http:\/\/127\.0\.0\.1:54183$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL)||process.env.VERCEL_ENV)throw Error('Banc local exclusif');
https.request=(options,callback)=>{
 if(options?.host!=='api.stripe.com'||options.headers?.Authorization?.startsWith('Bearer sk_live'))throw Error('Appel non local interdit');
 const req=http.request({hostname:'127.0.0.1',port:56682,path:options.path,method:options.method,headers:{'content-type':'application/x-www-form-urlencoded','idempotency-key':options.headers?.['Idempotency-Key']||''}},callback);
 req.on('socket',s=>{if(s.connecting)s.once('connect',()=>s.emit('secureConnect'));});return req;
};
const natif=globalThis.fetch;
globalThis.fetch=(input,init)=>{const u=new URL(typeof input==='string'?input:input.url??String(input));if(u.hostname==='api.stripe.com')return natif('http://127.0.0.1:56682'+u.pathname+u.search,init);if(u.hostname==='api.resend.com')return natif('http://127.0.0.1:55520'+u.pathname,init);if(!['localhost','127.0.0.1'].includes(u.hostname))throw Error('Prestataire externe interdit');return natif(input,init);};
syncBuiltinESMExports();
