export const PUBLICS_VEILLE={artisan:'Artisans',bailleur:'Propriétaires bailleurs',agence:'Agences et agents immobiliers',locataire:'Locataires'} as const;
export const FLUX_VEILLE=[
 {nom:'Service Public — Particuliers',url:'https://www.service-public.gouv.fr/abonnements/rss/actu-actualites-particuliers.rss'},
 {nom:'Service Public — Entreprises',url:'https://www.service-public.gouv.fr/abonnements/rss/actu-actu-pro.rss'},
];
export function sourceVeille(v:string){try{const u=new URL(v);if(u.protocol!=='https:'||u.username||u.password||u.port||!['www.service-public.gouv.fr','entreprendre.service-public.gouv.fr','www.anil.org','www.legifrance.gouv.fr','www.economie.gouv.fr','www.impots.gouv.fr','www.urssaf.fr'].includes(u.hostname))return null;u.search='';u.hash='';return u.href;}catch{return null;}}
function texte(v:string){return v.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,'').replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g,x=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '}[x]!)).replace(/\s+/g,' ').trim();}
export function lireFluxVeille(xml:string,source:string){
 if(xml.length>1000000||/<!DOCTYPE|<!ENTITY/i.test(xml)||!/<rss\b/.test(xml)||!/<\/rss>/.test(xml))throw new Error('Le flux officiel n’a pas pu être lu.');
 const trouves=[];
 for(const bloc of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)){
  const champ=(tag:string)=>texte(bloc[1].match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1]??'');
  const titre=champ('title'),url=sourceVeille(champ('link')),date=champ('dc:date')||champ('pubDate');
  if(!url||titre.length<5||titre.length>300||!/(logement|locat|bail|loyer|immobili|artisan|bâtiment|batiment|dpe|décennal|decennal|rénovat|renovat|factur|devis|tva|cotisation|micro.entrepr|copropri|rge\b)/i.test(titre+' '+champ('description')))continue;
  trouves.push({source_url:url,titre,source_nom:source,publie_source_le:Number.isFinite(Date.parse(date))?new Date(date).toISOString():null});
 }
 return [...new Map(trouves.map(x=>[x.source_url,x])).values()];
}
export async function chargerFluxVeille(url:string){
 if(!FLUX_VEILLE.some(f=>f.url===url))throw new Error('Source inconnue.');
 const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(12000),cache:'no-store'});
 if(!r.ok||!r.body)throw new Error('Source indisponible.');
 const reader=r.body.getReader();const blocs:Uint8Array[]=[];let taille=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;taille+=value.length;if(taille>1000000)throw new Error('Flux trop volumineux.');blocs.push(value);}}finally{await reader.cancel();}
 return Buffer.concat(blocs).toString('utf8');
}
