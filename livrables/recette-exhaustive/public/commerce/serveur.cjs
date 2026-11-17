// Le lanceur du banc fournit uniquement les accès PostgREST et la messagerie fictifs.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{tmpdir}=require('node:os');
if(!/^http:\/\/127\.0\.0\.1:54183$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL)||!process.env.SUPALOCAL_DB?.includes('@127.0.0.1:56817/gerimmo_ci_'))throw Error('Réservé au banc des portails fictifs');
const ledger=path.join(tmpdir(),'gerimmo-342-transport-contractuel-fictif.json'),all=new Map();
const log=[];const save=()=>fs.writeFileSync(ledger,JSON.stringify(log));
function invoice(o){return {id:'in_'+o.key,number:'RECETTE-'+o.key.slice(-6),created:o.start,object:'invoice',customer:'cus_'+o.key,currency:'eur',status:'paid',amount_paid:599,amount_due:599,amount_remaining:0,total:599,post_payment_credit_notes_amount:0,pre_payment_credit_notes_amount:0,parent:{subscription_details:{subscription:'sub_'+o.key}},payments:{object:'list',data:[{status:'paid',amount_paid:599,payment:{type:'payment_intent',payment_intent:'pi_'+o.key}}]}};}
function sub(o){return {id:'sub_'+o.key,object:'subscription',customer:'cus_'+o.key,created:o.start,status:o.status,cancel_at_period_end:o.cancel,metadata:{organization_id:o.org},schedule:null,current_period_start:o.start,current_period_end:o.end,items:{data:[{id:'si_'+o.key,quantity:1,current_period_start:o.start,current_period_end:o.end,price:{unit_amount:599,currency:'eur',recurring:{interval:'month'}}}]}};}
const server=http.createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;const u=new URL(req.url,'http://127.0.0.1:56682'),p=u.pathname,params=new URLSearchParams(body),out=(code,data)=>{res.writeHead(code,{'content-type':'application/json'});res.end(JSON.stringify(data));};
 if(p==='/fictif'&&req.method==='POST'){const d=JSON.parse(body);if(!/^loc[0-9a-f]{32}$/.test(d.key)||!/^[-0-9a-f]{36}$/.test(d.org))return out(400,{});all.set(d.key,{...d,status:d.status??'active',cancel:false,refund:null});return out(200,{ok:true});}
 const ident=(p.split('/').at(-1)+' '+u.search+' '+body).match(/(?:sub|cus|in|pi|ch)_(loc[0-9a-f]{32})/);const o=all.get(ident?.[1]);if(!o)return out(404,{error:{message:'Référence de fixture inconnue.'}});
 log.push({heure:new Date().toISOString(),organisation:o.org,methode:req.method,operation:p.replace(/loc[0-9a-f]{32}/g,'[fictif]')});save();
 if(p.startsWith('/v1/subscriptions/')){if(req.method==='POST')o.cancel=params.get('cancel_at_period_end')==='true';if(req.method==='DELETE')o.status='canceled';return out(200,sub(o));}
 if(p==='/v1/invoices'&&req.method==='GET')return out(200,{object:'list',data:u.searchParams.get('status')==='open'?[]:[invoice(o)],has_more:false});
 if(p.startsWith('/v1/invoices/'))return out(200,invoice(o));
 if(p.startsWith('/v1/customers/'))return out(200,{id:'cus_'+o.key,metadata:{organization_id:o.org},object:'customer',livemode:false});
 if(p==='/v1/refunds'&&req.method==='GET')return out(200,{object:'list',has_more:false,data:o.refund?[o.refund]:[]});
 if(p==='/v1/refunds'&&req.method==='POST'){if(!o.refund)o.refund={object:'refund',id:'re_'+o.key,status:'succeeded',amount:599,metadata:{gerimmo_retractation:params.get('metadata[gerimmo_retractation]')}};return out(200,o.refund);}
 if(p.startsWith('/v1/payment_intents/'))return out(200,{object:'payment_intent',id:'pi_'+o.key,status:'succeeded',amount:599,amount_received:599,latest_charge:'ch_'+o.key});
 out(400,{error:{message:'Route de simulation non modélisée.'}});
});
server.listen(56682,'127.0.0.1',()=>{const env={...process.env,NODE_ENV:'test',GERIMMO_MODE:'simulation',NEXT_PUBLIC_SITE_URL:'http://127.0.0.1:59412',STRIPE_SECRET_KEY:'sk_test_local_commerce_fictif',STRIPE_WEBHOOK_SECRET:'whsec_recette_fictive',STRIPE_PRIX_BIEN:'price_recette_fictive',STRIPE_PRODUIT_PROPRIETAIRE:'prod_recette_fictive',NODE_OPTIONS:'--require='+JSON.stringify(path.join(__dirname,'reseau.cjs'))};const next=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','59412'],{env,stdio:'inherit'});next.on('exit',c=>{server.close();process.exitCode=c||0;});process.on('SIGTERM',()=>next.kill());});
