import {createRequire} from 'node:module';
const app='/Users/easycash/Documents/Gerimmo V3/work/ux-accueil-proprietaire-20261118/app';
const require=createRequire(app+'/package.json');
const {createServer}=await import(require.resolve('vite'));
const tailwind=require('@tailwindcss/postcss');
const root=decodeURIComponent(new URL('.',import.meta.url).pathname);
const server=await createServer({configFile:false,root,resolve:{alias:[{find:'@/app/actions/erreurs',replacement:root+'signaler.ts'},{find:'next/navigation',replacement:root+'navigation.ts'},{find:'@',replacement:app+'/src'},{find:'react-dom',replacement:app+'/node_modules/react-dom'},{find:'react',replacement:app+'/node_modules/react'}]},css:{postcss:{plugins:[tailwind({base:app})]}},server:{host:'127.0.0.1',port:3182,strictPort:true,fs:{allow:[app,root]}},optimizeDeps:{include:['react','react-dom/client']}});
await server.listen();console.log('Banc de composants local : 3182');
