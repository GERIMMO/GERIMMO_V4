import { createCipheriv, createDecipheriv, createHash } from "node:crypto";

/** Contrat officiel vérifié le 28/10/2026 : https://developers.ar24.fr/doc/ .
 * Transport uniquement. L’appelant doit réserver une commande durable avant POST /mail ;
 * ref_dossier est une référence de rapprochement, PAS une clé d’idempotence AR24. */
export type ConfigurationAr24 = { baseUrl: "https://sandbox.ar24.fr/api" | "https://app.ar24.fr/api"; token: string; clePrivee: string };
export function configurationAr24(env: Record<string, string | undefined> = process.env): ConfigurationAr24 | null {
  if (!env.AR24_TOKEN?.trim() || !env.AR24_PRIVATE_KEY?.trim()) return null;
  if (env.AR24_ENVIRONMENT !== "sandbox" && env.AR24_ENVIRONMENT !== "production") return null;
  return { baseUrl: env.AR24_ENVIRONMENT === "production" ? "https://app.ar24.fr/api" : "https://sandbox.ar24.fr/api", token: env.AR24_TOKEN.trim(), clePrivee: env.AR24_PRIVATE_KEY.trim() };
}
const h = (v: string) => createHash("sha256").update(v).digest("hex");
const iv = (secret: string) => Buffer.from(h(h(secret)).slice(0,16));
export function signatureAr24(date: string, secret: string) {
  const c = createCipheriv("aes-256-cbc", Buffer.from(h(secret).slice(0,32)), iv(secret));
  return Buffer.concat([c.update(date, "utf8"), c.final()]).toString("base64");
}
export function dechiffrerAr24(texte: string, date: string, secret: string): string {
  const c = createDecipheriv("aes-256-cbc", Buffer.from(h(date+secret).slice(0,32)), iv(secret));
  return Buffer.concat([c.update(texte, "base64"), c.final()]).toString("utf8");
}
export function dateAr24(maintenant = new Date()) {
  const parties = new Intl.DateTimeFormat("fr-FR", { timeZone:"Europe/Paris", year:"numeric", month:"2-digit", day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23" }).formatToParts(maintenant);
  const p = Object.fromEntries(parties.map(p=>[p.type,p.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}
export class EnvoiAr24Incertain extends Error {
  constructor() { super("La réponse d’AR24 n’a pas pu être confirmée. Vérifiez le suivi avant tout nouvel envoi ; ce courrier peut déjà avoir été accepté."); }
}
type ReponseAr24 = { status?: string; result?: Record<string,unknown>; slug?: string };
async function appelAr24(config: ConfigurationAr24, methode: "GET" | "POST", route: "/mail" | "/user/mail", valeurs: Record<string,string>, transport: typeof fetch = fetch): Promise<Record<string,unknown>> {
  if (!["https://sandbox.ar24.fr/api","https://app.ar24.fr/api"].includes(config.baseUrl)) throw new Error("Adresse AR24 non autorisée.");
  const date = dateAr24();
  const donnees = new URLSearchParams({ ...valeurs, token:config.token, date });
  const url = `${config.baseUrl}${route}${methode === "GET" ? `?${donnees.toString()}` : ""}`;
  let reponse: Response;
  try {
    reponse = await transport(url, { method:methode, headers:{ signature:signatureAr24(date,config.clePrivee), ...(methode === "POST" ? {"Content-Type":"application/x-www-form-urlencoded"} : {}) }, ...(methode === "POST" ? {body:donnees.toString()} : {}), redirect:"error", cache:"no-store", signal:AbortSignal.timeout(60000) });
  } catch { if (methode === "POST") throw new EnvoiAr24Incertain(); throw new Error("Le suivi AR24 est temporairement indisponible."); }
  let resultat: ReponseAr24;
  try {
    const texte = await reponse.text();
    if (texte.length > 2_000_000) throw new Error("Réponse trop grande");
    // Les erreurs sont du JSON lisible ; les succès sont chiffrés.
    resultat = (texte.trim().startsWith("{") ? JSON.parse(texte) : JSON.parse(dechiffrerAr24(texte.trim(),date,config.clePrivee))) as ReponseAr24;
  } catch { if(methode === "POST") throw new EnvoiAr24Incertain(); throw new Error("Le suivi AR24 n’a pas pu être vérifié."); }
  if (!reponse.ok || resultat.status !== "SUCCESS" || !resultat.result) {
    // Aucun secret, adresse ni contenu prestataire renvoyé dans le message d’erreur.
    if (resultat.status === "maintenance") throw new Error("AR24 est en maintenance. Aucun succès d’envoi confirmé.");
    throw new Error("AR24 n’a pas confirmé cette opération. Vérifiez la connexion, l’identité de l’expéditeur et son moyen de paiement.");
  }
  return resultat.result;
}
export type CourrierAr24 = {
  reference: string; expediteurId: number; destinataire: { email:string; prenom:string; nom:string };
  contenu: string; piecesJointes: number[];
  consentement: { accepte:boolean; email:string };
  tarifTtcCentimes: number; tarifConfirmeCentimes:number; destinataireConfirme:string; empreinteConfirmee:string;
  otp?:string; authentificationOtp?:string;
};
export function empreinteCourrierAr24(c: Pick<CourrierAr24,"reference"|"expediteurId"|"destinataire"|"contenu"|"piecesJointes"|"tarifTtcCentimes">) {
  return h(JSON.stringify({reference:c.reference,expediteurId:c.expediteurId,destinataire:c.destinataire,contenu:c.contenu,piecesJointes:c.piecesJointes,tarifTtcCentimes:c.tarifTtcCentimes}));
}
export type SuiviAr24 = { id:number; reference:string; etat:"a_authentifier"|"en_attente"|"envoye"|"recu"|"refuse"|"non_reclame"|"echec"|"a_verifier"; preuves: { type:"depot"|"envoi"|"reception"|"refus"|"negligence"; url:string }[] };
function suivre(config: ConfigurationAr24, r: Record<string,unknown>): SuiviAr24 {
  if (!Number.isSafeInteger(r.id) || Number(r.id)<=0 || r.is_eidas !== true) throw new Error("Le recommandé qualifié AR24 n’a pas pu être vérifié.");
  // Une preuve de transmission prime sur un signal d'échec contradictoire. `send_fail` seul
  // ne permet pas de conclure qu'une nouvelle expédition serait sans doublon.
  const etat = r.refused_date ? "refuse" : r.negligence_date ? "non_reclame" : r.view_date ? "recu" : r.ts_ev_date || r.proof_ev_url ? "envoye" : r.send_fail === true ? "echec" : r.status === "to_valid" ? "a_authentifier" : r.status === "waiting" ? "en_attente" : "a_verifier";
  const preuves: SuiviAr24["preuves"] = [];
  for (const [cle,type] of [["proof_dp_url","depot"],["proof_ev_url","envoi"],["proof_ar_url","reception"],["proof_rf_url","refus"],["proof_ng_url","negligence"]] as const) {
    if (typeof r[cle] !== "string" || !r[cle]) continue;
    const u = new URL(r[cle]);
    if (u.origin !== new URL(config.baseUrl).origin || u.username || u.password || !u.pathname.includes("/get/proof/")) throw new Error("Une preuve AR24 pointe vers une adresse inattendue.");
    preuves.push({type,url:u.toString()});
  }
  return {id:Number(r.id),reference:String(r.ref_dossier ?? ""),etat,preuves};
}
export async function envoyerRecommandeAr24(config: ConfigurationAr24, c: CourrierAr24, transport: typeof fetch = fetch): Promise<SuiviAr24> {
  if (!c.consentement.accepte || c.consentement.email.trim().toLowerCase() !== c.destinataire.email.trim().toLowerCase()) throw new Error("L’accord du destinataire pour les recommandés électroniques est nécessaire.");
  if (!Number.isSafeInteger(c.tarifTtcCentimes) || c.tarifTtcCentimes<0 || c.tarifConfirmeCentimes!==c.tarifTtcCentimes || c.destinataireConfirme!==c.destinataire.email || c.empreinteConfirmee!==empreinteCourrierAr24(c)) throw new Error("Relisez le destinataire, le courrier et son coût avant de confirmer.");
  if (!c.reference || !Number.isSafeInteger(c.expediteurId) || c.expediteurId<=0 || !c.destinataire.nom.trim() || !c.destinataire.prenom.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.destinataire.email) || (!c.contenu.trim() && !c.piecesJointes.length) || c.piecesJointes.some(id=>!Number.isSafeInteger(id)||id<=0)) throw new Error("Le recommandé est incomplet.");
  if (!c.otp && !c.authentificationOtp) throw new Error("L’expéditeur doit s’authentifier auprès d’AR24 avant l’envoi.");
  const valeurs: Record<string,string> = { id_user:String(c.expediteurId),eidas:"1",to_lastname:c.destinataire.nom,to_firstname:c.destinataire.prenom,to_email:c.destinataire.email,dest_statut:"particulier",content:c.contenu,ref_dossier:c.reference, ...(c.otp ? {otp:c.otp} : {auth_otp_hash:c.authentificationOtp!}) };
  c.piecesJointes.forEach((id,i)=>{valeurs[`attachment[${i}]`]=String(id)});
  const r = await appelAr24(config,"POST","/mail",valeurs,transport);
  if (r.ref_dossier!==c.reference || r.to_email!==c.destinataire.email || Number(r.id_sender)!==c.expediteurId) throw new EnvoiAr24Incertain();
  return suivre(config,r);
}
export async function lireRecommandeAr24(config: ConfigurationAr24, id:number, reference:string, transport: typeof fetch = fetch): Promise<SuiviAr24> {
  if(!Number.isSafeInteger(id)||id<=0) throw new Error("Référence AR24 invalide.");
  const r=await appelAr24(config,"GET","/mail",{id:String(id)},transport);
  if(Number(r.id)!==id || r.ref_dossier!==reference) throw new Error("Ce courrier AR24 ne correspond pas au dossier.");
  return suivre(config,r);
}

/** Après une réponse perdue, rapprochement en lecture seule par référence. Une absence ou plusieurs
 * résultats restent incertains : on ne réexpédie jamais automatiquement. */
export async function retrouverRecommandeAr24(config:ConfigurationAr24,reference:string,expediteurId:number,email:string,transport:typeof fetch=fetch):Promise<SuiviAr24|null> {
 if(!reference||!Number.isSafeInteger(expediteurId)||expediteurId<=0) throw new Error("Référence AR24 invalide.");
 const resultat=await appelAr24(config,"GET","/user/mail",{id_user:String(expediteurId),ref_dossier:reference,to_email:email,paging_start:"0",paging_max:"2",logic:"AND",team:"0"},transport);
 if(!Array.isArray(resultat)) throw new Error("Le rapprochement AR24 n’a pas pu être vérifié.");
 if(resultat.length===0) return null;
 if(resultat.length!==1) throw new Error("Plusieurs courriers AR24 correspondent à cette référence. Faites vérifier le dossier.");
 const r=resultat[0];
 if(!r||r.ref_dossier!==reference||Number(r.id_sender)!==expediteurId||r.to_email!==email) throw new Error("Le courrier AR24 ne correspond pas au dossier.");
 return suivre(config,r);
}
