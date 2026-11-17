/* Rejeu supplémentaire du composant client corrigé. Les classes CSS du build initial sont réutilisées,
   seule la transformation Next des polices est remplacée. Cette preuve n'est pas le déploiement du candidat.
   Le serveur se ferme à la fin du dernier scénario sans laisser de service persistant. */
const path=require('node:path'),fs=require('node:fs'),http=require('node:http'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../../../app'),app=require('node:module').createRequire(path.join(root,'package.json'));
const esbuild=app('esbuild');
(async()=>{
 const produit=await esbuild.build({stdin:{contents:"import {createRoot} from 'react-dom/client'; import {GenerateurQuittance} from './src/app/outils/quittance-de-loyer/generateur-quittance'; import React from 'react'; createRoot(document.querySelector('main')).render(<GenerateurQuittance/>);",resolveDir:root,loader:'tsx'},tsconfig:path.join(root,'tsconfig.json'),bundle:true,write:false,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},
  plugins:[{name:'police-next',setup(build){build.onResolve({filter:/^next\/font\/local$/},()=>({namespace:'locale',path:'police'}));build.onLoad({filter:/.*/,namespace:'locale'},()=>({contents:"export default function(){return {className:'',variable:'',style:{fontFamily:'Georgia,serif'}}}"}));}}]});
 const staticDir=path.join(root,'.next/static');const cssDir=path.join(staticDir,'css');
 const css=fs.existsSync(cssDir)?fs.readdirSync(cssDir).filter(s=>s.endsWith('.css')).map(s=>'<link rel="stylesheet" href="/_next/static/css/'+encodeURIComponent(s)+'">').join(''):'';
 const serveur=http.createServer((req,res)=>{
  const q=new URL(req.url,'http://127.0.0.1').pathname;
  if(q==='/outils/quittance-de-loyer'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!DOCTYPE html><html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1">'+css+'</head><body><main class="max-w-6xl mx-auto"></main><script src="/produit.js"></script></body></html>');}
  else if(q==='/produit.js'){res.setHeader('Content-Type','application/javascript');res.end(produit.outputFiles[0].contents);}
  else if(/^\/_next\/static\/(css|media)\/[a-zA-Z0-9._-]+$/.test(q)){
   const f=path.join(staticDir,q.replace('/_next/static/',''));if(!fs.existsSync(f)){res.writeHead(404);res.end();return;}
   if(q.endsWith('.css'))res.setHeader('Content-Type','text/css');else if(q.endsWith('.woff2'))res.setHeader('Content-Type','font/woff2');fs.createReadStream(f).pipe(res);
  }else{res.writeHead(404);res.end();}
 });
 serveur.listen(0,'127.0.0.1',()=>{
  const p=spawn(process.execPath,[path.join(__dirname,'reproduire-quittance.cjs'),'apres'],{stdio:'inherit',env:{...process.env,RECETTE_URL:'http://127.0.0.1:'+serveur.address().port}});
  p.on('exit',code=>{serveur.close();process.exitCode=code??1});
 });
})().catch(e=>{console.error(e.message);process.exitCode=1});
