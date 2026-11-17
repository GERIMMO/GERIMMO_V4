// Véritable composant du produit rendu d'abord côté serveur, puis hydraté avec React dans Chromium.
const path=require('node:path'),http=require('node:http'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../../../app'), app=require('node:module').createRequire(path.join(root,'package.json'));
const esbuild=app('esbuild'),React=app('react'),{renderToString}=app('react-dom/server');
async function main(){
 const options={tsconfig:path.join(root,'tsconfig.json'),bundle:true,write:false,jsx:'automatic',
  define:{'process.env.NODE_ENV':'"production"'}};
 const code="import {CartesOffresPubliques} from './src/components/cartes-offres-publiques';";
 const ssr=await esbuild.build({...options,platform:'node',format:'cjs',external:['react','react/*','react-dom','next/*'],stdin:{contents:code+'export default CartesOffresPubliques;',resolveDir:root,loader:'tsx'}});
 const mod={exports:{}};new Function('require','module','exports',ssr.outputFiles[0].text)(app,mod,mod.exports);
 const html=renderToString(React.createElement(mod.exports.default));
 const client=await esbuild.build({...options,platform:'browser',define:{...options.define,'process.env':'{}','process.browser':'true'},stdin:{contents:code+"import React from 'react';import {hydrateRoot} from 'react-dom/client'; hydrateRoot(document.querySelector('main'),<CartesOffresPubliques/>);",resolveDir:root,loader:'tsx'}});
 const serveur=http.createServer((req,res)=>{
  if(req.url==='/tarifs'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<!doctype html><html lang=fr><meta name=viewport content="width=device-width,initial-scale=1"><main>'+html+'</main><script src="/calcul.js"></script></html>');}
  else if(req.url==='/calcul.js'){res.setHeader('Content-Type','application/javascript');res.end(client.outputFiles[0].contents);}
  else{res.writeHead(404);res.end();}
 });
 serveur.listen(0,'127.0.0.1',()=>{
   const p=spawn(process.execPath,[path.join(__dirname,'tarifs-chargement.cjs'),'apres'],{stdio:'inherit',env:{...process.env,RECETTE_URL:'http://127.0.0.1:'+serveur.address().port}});
   p.on('exit',code=>{serveur.close();process.exitCode=code??1});
 });
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
