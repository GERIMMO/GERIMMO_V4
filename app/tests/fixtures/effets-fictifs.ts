// Les tests utilisent des transports injectés. Un oubli de mock ne doit jamais envoyer.
process.env.GERIMMO_MODE='simulation';
const reseau=globalThis.fetch;
globalThis.fetch=(...args:Parameters<typeof fetch>)=>{
 const value=args[0];const url=new URL(typeof value==='string'?value:value instanceof URL?value.href:value.url);
 if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Réseau externe interdit dans les tests : injectez un fournisseur fictif');
 return reseau(...args);
};
