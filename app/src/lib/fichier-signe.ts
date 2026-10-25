import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EXTENSIONS, type MimeAccepte } from "./file-type";
import { pageErreurFichier } from "./page-erreur-fichier";

const DUREE_LIEN = 60;
/** Marge sous la limite de réponse de l’hébergement pour les anciennes routes PDF. */
export const TAILLE_MAX_REPONSE_FICHIER = 4 * 1024 * 1024;
const entetes = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
const echapper = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
/** À appeler seulement après contrôle métier et journalisation de l'accès.
 * Le navigateur charge les octets depuis Storage ; l'URL Gerimmo de consultation
 * reste stable et son actualisation revérifie les droits. Aucun fichier ne transite
 * dans la réponse de la fonction d'hébergement (limite de 4,5 Mo).
 */
export async function servirFichierSigne(db: SupabaseClient, options: {
  path: string; mime: string | null | undefined; titre: string | null;
  mode?: "consultation" | "telechargement"; retour: string; apercuImage?: boolean;
  compartiment?: "documents" | "devis-preparations" | "artisan-prive";
  sha256?: string;
  /** Titre de lecture issu de l’état métier ; le nom de fichier archivé est conservé. */
  libelle?: string;
}): Promise<Response> {
  const compartiment = options.compartiment ?? "documents";
  if (!["documents", "devis-preparations", "artisan-prive"].includes(compartiment) ||
      (options.sha256 !== undefined && !/^[a-f0-9]{64}$/.test(options.sha256))) {
    return pageErreurFichier(502,"Fichier indisponible","Le document ne peut pas être vérifié pour l’instant.",options.retour);
  }
  const mime = Object.hasOwn(EXTENSIONS, options.mime ?? "") ? options.mime as MimeAccepte : null;
  const ext = mime ? EXTENSIONS[mime] : "bin";
  const titre = (options.titre || "document").replace(/[\u0000-\u001f\u007f/\\]/g," ").slice(0,180);
  const nom = titre.endsWith(`.${ext}`) ? titre : `${titre}.${ext}`;
  const libelle = options.libelle || nom;
  const telechargement = options.mode === "telechargement" || !mime;
  const { data, error } = await db.storage.from(compartiment).createSignedUrl(options.path, DUREE_LIEN,
    telechargement ? { download: nom } : undefined).catch(() => ({data:null,error:true}));
  if (error || !data?.signedUrl) return pageErreurFichier(502, "Fichier indisponible",
    "Le document ne peut pas être ouvert pour l’instant. Réessayez depuis votre dossier.", options.retour);
  let url: URL;
  try {
    url = new URL(data.signedUrl);
    const stockage = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "https://absent.invalid");
    if (url.origin !== stockage.origin || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost","127.0.0.1"].includes(url.hostname)))) throw Error();
    if (url.username || url.password) throw Error();
  } catch { return pageErreurFichier(502,"Fichier indisponible","Le lien du document ne peut pas être ouvert. Réessayez.",options.retour); }
  // Une archive contrôlée doit être vérifiée une nouvelle fois sur les octets
  // réellement reçus : aucun lien de téléchargement ne contourne cette empreinte.
  if (!options.sha256 && (telechargement || (options.apercuImage && (mime === "image/png" || mime === "image/jpeg")))) return new Response(null,{status:303,headers:{...entetes,Location:url.toString()}});
  const nonce = randomBytes(18).toString("base64");
  const parametres = JSON.stringify({url:url.toString(),mime:mime ?? "application/octet-stream",nom,sha256:options.sha256}).replaceAll("<","\\u003c");
  const contenu = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${echapper(libelle)} — Gerimmo</title>
<style nonce="${nonce}">*{box-sizing:border-box}body{margin:0;height:100dvh;display:grid;grid-template-rows:auto minmax(0,1fr);background:#f5f6fa;color:#17324f;font:16px/1.5 system-ui}header{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:12px 18px;background:white;border-bottom:1px solid #dce3eb}header strong{flex:1 1 100%;min-width:0;overflow-wrap:anywhere}header a,header button{flex:0 1 auto;min-height:44px;max-width:100%}@media(min-width:768px){header strong{flex:1 1 20rem}}button,a{font:inherit;border:1px solid #c9d5e4;border-radius:8px;padding:9px 13px;color:#17324f;background:white;text-decoration:none;cursor:pointer}#apercu{height:100%}main{min-height:0}#etat{padding:24px;text-align:center}iframe{border:0;width:100%;height:100%}img{display:block;max-width:100%;height:auto;margin:auto}[hidden]{display:none!important}#aide-pdf{padding:16px;text-align:center}html.incorpore #aide-pdf{display:none!important}@media(max-width:767px){html:not(.incorpore) iframe{display:none}}</style></head>
<body><header><strong>${echapper(libelle)}</strong><button id="reprendre" type="button">Actualiser</button><a id="ouvrir" target="_blank" rel="noopener noreferrer" hidden>Ouvrir le PDF en plein écran</a><a id="telecharger" hidden>Télécharger</a></header><main><p id="etat" role="status">Ouverture de votre document…</p><p id="aide-pdf" hidden>Sur téléphone, utilisez « Ouvrir le PDF en plein écran » pour parcourir toutes les pages.</p><div id="apercu"></div></main><noscript>Activez JavaScript pour consulter ce document, ou utilisez le téléchargement depuis votre dossier.</noscript>
<script nonce="${nonce}">const documentSigne=${parametres};
if(window.top!==window)document.documentElement.classList.add('incorpore');
const etat=document.getElementById('etat');const bouton=document.getElementById('reprendre');
bouton.addEventListener('click',()=>location.reload());let objet;
(async()=>{try{const reponse=await fetch(documentSigne.url,{cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});if(!reponse.ok)throw Error();
const limite=50*1024*1024;if(Number(reponse.headers.get('content-length'))>limite){await reponse.body?.cancel();throw Error();}
const lecteur=reponse.body?.getReader();if(!lecteur)throw Error();const morceaux=[];let taille=0;
try{for(;;){const {done,value}=await lecteur.read();if(done)break;taille+=value.byteLength;if(taille>limite){await lecteur.cancel();throw Error();}morceaux.push(value);}}finally{lecteur.releaseLock();}
if(taille===0)throw Error();const donnees=new Uint8Array(taille);let position=0;for(const morceau of morceaux){donnees.set(morceau,position);position+=morceau.byteLength;}
if(documentSigne.sha256){const empreinte=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',donnees)),octet=>octet.toString(16).padStart(2,'0')).join('');if(empreinte!==documentSigne.sha256)throw Error();}
objet=URL.createObjectURL(new Blob([donnees],{type:documentSigne.mime}));
const lien=document.getElementById('telecharger');lien.href=objet;lien.download=documentSigne.nom;lien.hidden=false;
if(documentSigne.mime==='application/pdf'){const ouvrir=document.getElementById('ouvrir');ouvrir.href=objet;ouvrir.hidden=false;document.getElementById('aide-pdf').hidden=false;}
if(['application/pdf','image/png','image/jpeg'].includes(documentSigne.mime)){const apercu=document.createElement(documentSigne.mime==='application/pdf'?'iframe':'img');apercu.src=objet;apercu.title=documentSigne.nom;if(apercu.tagName==='IMG')apercu.alt=documentSigne.nom;document.getElementById('apercu').append(apercu);etat.hidden=true;}else{etat.textContent='Document vérifié. Vous pouvez le télécharger.';}
}catch{etat.textContent='Le document n’a pas pu être chargé. Appuyez sur Actualiser pour réessayer ; votre fichier reste conservé.';}})();
addEventListener('pagehide',()=>{if(objet)URL.revokeObjectURL(objet)});
</script></body></html>`;
  return new Response(contenu,{headers:{...entetes,"Content-Type":"text/html; charset=utf-8","X-Frame-Options":"SAMEORIGIN",
    "Content-Security-Policy":`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src ${url.origin}; img-src blob:; frame-src blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`}});
}
