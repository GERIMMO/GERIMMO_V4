import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EXTENSIONS, type MimeAccepte } from "./file-type";
import { pageErreurFichier } from "./page-erreur-fichier";

const DUREE_LIEN = 60;
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
}): Promise<Response> {
  const mime = Object.hasOwn(EXTENSIONS, options.mime ?? "") ? options.mime as MimeAccepte : null;
  const ext = mime ? EXTENSIONS[mime] : "bin";
  const titre = (options.titre || "document").replace(/[\u0000-\u001f\u007f/\\]/g," ").slice(0,180);
  const nom = titre.endsWith(`.${ext}`) ? titre : `${titre}.${ext}`;
  const telechargement = options.mode === "telechargement" || !mime;
  const { data, error } = await db.storage.from("documents").createSignedUrl(options.path, DUREE_LIEN,
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
  if (telechargement || (options.apercuImage && (mime === "image/png" || mime === "image/jpeg"))) return new Response(null,{status:303,headers:{...entetes,Location:url.toString()}});
  const nonce = randomBytes(18).toString("base64");
  const parametres = JSON.stringify({url:url.toString(),mime,nom}).replaceAll("<","\\u003c");
  const contenu = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${echapper(nom)} — Gerimmo</title>
<style nonce="${nonce}">*{box-sizing:border-box}body{margin:0;background:#f5f6fa;color:#17324f;font:16px/1.5 system-ui}header{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:12px 18px;background:white;border-bottom:1px solid #dce3eb}header strong{flex:1;overflow-wrap:anywhere}button,a{font:inherit;border:1px solid #c9d5e4;border-radius:8px;padding:9px 13px;color:#17324f;background:white;text-decoration:none;cursor:pointer}#apercu{height:100%}main{height:calc(100dvh - 80px);min-height:400px}#etat{padding:24px;text-align:center}iframe{border:0;width:100%;height:100%}img{display:block;max-width:100%;height:auto;margin:auto}[hidden]{display:none!important}#aide-pdf{padding:16px;text-align:center}@media(max-width:767px){iframe{display:none}}</style></head>
<body><header><strong>${echapper(nom)}</strong><button id="reprendre" type="button">Actualiser</button><a id="ouvrir" target="_blank" rel="noopener noreferrer" hidden>Ouvrir le PDF en plein écran</a><a id="telecharger" hidden>Télécharger</a></header><main><p id="etat" role="status">Ouverture de votre document…</p><p id="aide-pdf" hidden>Sur téléphone, utilisez « Ouvrir le PDF en plein écran » pour parcourir toutes les pages.</p><div id="apercu"></div></main><noscript>Activez JavaScript pour consulter ce document, ou utilisez le téléchargement depuis votre dossier.</noscript>
<script nonce="${nonce}">const documentSigne=${parametres};
const etat=document.getElementById('etat');const bouton=document.getElementById('reprendre');
bouton.addEventListener('click',()=>location.reload());let objet;
(async()=>{try{const reponse=await fetch(documentSigne.url,{cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});if(!reponse.ok)throw Error();
const donnees=await reponse.arrayBuffer();if(donnees.byteLength===0||donnees.byteLength>50*1024*1024)throw Error();
objet=URL.createObjectURL(new Blob([donnees],{type:documentSigne.mime}));
const lien=document.getElementById('telecharger');lien.href=objet;lien.download=documentSigne.nom;lien.hidden=false;
if(documentSigne.mime==='application/pdf'){const ouvrir=document.getElementById('ouvrir');ouvrir.href=objet;ouvrir.hidden=false;document.getElementById('aide-pdf').hidden=false;}
const apercu=document.createElement(documentSigne.mime==='application/pdf'?'iframe':'img');apercu.src=objet;apercu.title=documentSigne.nom;if(apercu.tagName==='IMG')apercu.alt=documentSigne.nom;
document.getElementById('apercu').append(apercu);etat.hidden=true;
}catch{etat.textContent='Le document n’a pas pu être chargé. Appuyez sur Actualiser pour réessayer ; votre fichier reste conservé.';}})();
addEventListener('pagehide',()=>{if(objet)URL.revokeObjectURL(objet)});
</script></body></html>`;
  return new Response(contenu,{headers:{...entetes,"Content-Type":"text/html; charset=utf-8",
    "Content-Security-Policy":`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src ${url.origin}; img-src blob:; frame-src blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`}});
}
