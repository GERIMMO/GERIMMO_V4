import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import type { DemandeSignatureLue, SignataireSignature } from "./signature-types";
import { expressionSaisieMentionCaution, noteMentionCaution } from "./mention-caution";

/** Compte européen uniquement. Le mode test Zoho utilise la même API, avec testing=true. */
export type ConfigurationZohoSign = {
  prestataire: "zoho"; environnement: "sandbox" | "production";
  clientId: string; clientSecret: string; refreshToken: string;
};
export function configurationZohoSign(env: Record<string, string | undefined> = process.env): ConfigurationZohoSign | null {
  const clientId = env.ZOHO_SIGN_CLIENT_ID?.trim(), clientSecret = env.ZOHO_SIGN_CLIENT_SECRET?.trim(), refreshToken = env.ZOHO_SIGN_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken || ![undefined, "", "sandbox", "production"].includes(env.ZOHO_SIGN_ENV)) return null;
  return { prestataire: "zoho", clientId, clientSecret, refreshToken, environnement: env.ZOHO_SIGN_ENV === "production" ? "production" : "sandbox" };
}

const BASE = "https://sign.zoho.eu/api/v1";
let cache: { cle: string; valeur?: string; expiration?: number; attente?: Promise<string> } | undefined;
async function jeton(config: ConfigurationZohoSign): Promise<string> {
  const cle = createHash("sha256").update(JSON.stringify([config.clientId, config.clientSecret, config.refreshToken])).digest("hex");
  if (cache?.cle === cle && cache.valeur && (cache.expiration ?? 0) > Date.now() + 60_000) return cache.valeur;
  if (cache?.cle === cle && cache.attente) return cache.attente;
  const entree: NonNullable<typeof cache> = { cle }; cache = entree;
  entree.attente = (async () => {
    const response = await fetch("https://accounts.zoho.eu/oauth/v2/token", {
      method: "POST", body: new URLSearchParams({ grant_type: "refresh_token", client_id: config.clientId, client_secret: config.clientSecret, refresh_token: config.refreshToken }),
      signal: AbortSignal.timeout(25_000), cache: "no-store", redirect: "error",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || typeof body?.access_token !== "string" || !body.access_token || !Number.isFinite(body.expires_in) || body.expires_in <= 60) {
      throw new Error("La connexion à Zoho Sign doit être réautorisée dans les paramètres sécurisés.");
    }
    entree.valeur = body.access_token; entree.expiration = Date.now() + body.expires_in * 1000;
    return body.access_token as string;
  })();
  try { return await entree.attente; } finally { entree.attente = undefined; }
}

async function appel(config: ConfigurationZohoSign, chemin: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Zoho-oauthtoken ${await jeton(config)}`);
  // Aucune relance automatique d'une mutation : une réponse perdue peut masquer un envoi réussi.
  const response = await fetch(`${BASE}${chemin}`, { ...init, headers, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(25_000) });
  if (response.status === 401) cache = undefined;
  if (!response.ok) {
    const erreur = await response.json().catch(() => null);
    verifierCompteConfirme(erreur?.code);
    throw new Error(`Zoho Sign n’a pas confirmé l’opération (HTTP ${response.status}). Actualisez le suivi avant de réessayer.`);
  }
  return response;
}
function verifierCompteConfirme(code: unknown) {
  // Message connu uniquement : ne jamais restituer le corps fournisseur ou une adresse privée.
  if (code === 8044) throw new Error("L’administrateur Gerimmo doit confirmer l’adresse e-mail du compte Zoho Sign avant de pouvoir créer une demande de signature.");
}
type ChampZoho = { field_id?: string; field_name?: string; field_type_name: string; field_value?: unknown; default_value?: unknown; is_mandatory?: boolean; validation?: {validation_type?: string; validation_regex?: string} };
type Action = { private_notes?: string; action_id: string; action_type: string; recipient_email: string; recipient_name: string; signing_order: number; action_status: string; verify_recipient: boolean; verification_type: string; recipient_countrycode_iso: string; recipient_phonenumber: string; fields?: ChampZoho[] };
type DocumentZoho = { document_id: string; document_name: string; document_order: string | number; total_pages: number };
type Demande = { notes?: string; request_id: string; description: string; request_status: string; is_deleted?: boolean; is_sequential: boolean; actions: Action[]; document_ids: DocumentZoho[] };
async function json(config: ConfigurationZohoSign, chemin: string, init?: RequestInit): Promise<{ requests?: Demande }> {
  const body = await (await appel(config, chemin, init)).json();
  verifierCompteConfirme(body?.code);
  if (body?.code !== 0 || body.status === "failure") throw new Error("Zoho Sign a refusé l’opération. Vérifiez la connexion, les crédits et le suivi avant de réessayer.");
  return body;
}
function idValide(id: string) {
  if (!/^\d{1,30}$/.test(id)) throw new Error("Référence Zoho Sign invalide.");
  return id;
}
async function details(config: ConfigurationZohoSign, id: string) {
  const body = await json(config, `/requests/${idValide(id)}`);
  if (!body.requests || body.requests.request_id !== id || !Array.isArray(body.requests.actions)) throw new Error("La réponse Zoho Sign est incomplète.");
  return body.requests;
}
function formulaire(config: ConfigurationZohoSign, data?: unknown) {
  const form = new FormData();
  form.append("testing", String(config.environnement === "sandbox"));
  if (data) form.append("data", JSON.stringify({ requests: data }));
  return form;
}
// Zoho exige le pays ISO (FR, BE...), y compris pour les indicatifs partagés.
export function telephoneZoho(telephone?: string | null) {
  if (!/^\+[1-9]\d{7,14}$/.test(telephone ?? "")) throw new Error("Vérifiez le téléphone international de chaque signataire.");
  const numero = parsePhoneNumberFromString(telephone!, { extract: false });
  if (!numero?.country || !numero.isPossible()) throw new Error("Vérifiez le pays et le téléphone international du signataire avant l’envoi du code SMS.");
  return { recipient_countrycode_iso: numero.country, recipient_phonenumber: numero.nationalNumber };
}
type Preparation = {
  config: ConfigurationZohoSign; pdf: Uint8Array; nomFichier: string; titre: string; referenceExterne: string; expiration: string;
  signataires: SignataireSignature[]; annexes?: { pdf: Uint8Array; nomFichier: string }[]; demandeCreee: (id: string) => Promise<void>;
};
export async function preparerCircuitZoho(params: Preparation) {
  if (params.signataires.length < 1 || params.signataires.length > 25) throw new Error("Vérifiez les parties au contrat.");
  const actions = params.signataires.map((s, i) => {
    if (!s.prenom.trim() || !s.nom.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email)) throw new Error("Vérifiez les coordonnées des signataires.");
    return { action_type: "SIGN", recipient_name: `${s.prenom} ${s.nom}`, recipient_email: s.email, signing_order: i, verify_recipient: true, verification_type: "SMS", delivery_mode: "EMAIL", language: "fr", ...telephoneZoho(s.telephone) };
  });
  const jours = Math.floor((new Date(`${params.expiration}T00:00:00Z`).getTime() - Date.now()) / 86_400_000);
  if (!Number.isFinite(jours) || jours < 1 || jours > 30) throw new Error("La préparation du contrat doit être renouvelée.");
  const form = formulaire(params.config, { request_name: params.titre.slice(0, 100), description: `gerimmo:circuit:${params.referenceExterne}`, is_sequential: true, expiration_days: jours, email_reminders: false, actions });
  form.append("file", new Blob([Uint8Array.from(params.pdf).buffer], { type: "application/pdf" }), params.nomFichier);
  for (const a of params.annexes ?? []) form.append("file", new Blob([Uint8Array.from(a.pdf).buffer], { type: "application/pdf" }), a.nomFichier);
  const body = await json(params.config, "/requests", { method: "POST", body: form });
  if (!body.requests?.request_id) throw new Error("La création Zoho Sign doit être rapprochée manuellement avant tout nouvel envoi.");
  const req = body.requests;
  await params.demandeCreee(idValide(req.request_id));
  const documents = [...(req.document_ids ?? [])].sort((a, b) => Number(a.document_order) - Number(b.document_order));
  const personnes = [...(req.actions ?? [])].sort((a, b) => a.signing_order - b.signing_order);
  // Zoho retire l’extension .pdf du nom affiché lors de l’import.
  const nomDocument = documents[0]?.document_name?.replace(/\.pdf$/i, "");
  if (req.request_status !== "draft" || req.description !== `gerimmo:circuit:${params.referenceExterne}` || !req.is_sequential || documents.length !== 1 + (params.annexes?.length ?? 0) || nomDocument !== params.nomFichier.replace(/\.pdf$/i, "") || personnes.length !== actions.length) throw new Error("La préparation Zoho Sign doit être vérifiée avant l’envoi.");
  personnes.forEach((s, i) => {
    if (s.signing_order !== i || s.action_type !== "SIGN" || s.recipient_email.toLowerCase() !== actions[i].recipient_email.toLowerCase() || !s.verify_recipient || s.verification_type !== "SMS") throw new Error("Les signataires Zoho Sign ne correspondent pas au dossier.");
    idValide(s.action_id);
  });
  return { demandeId: req.request_id, documentId: idValide(documents[0].document_id), signataireIds: personnes.map(s => s.action_id) };
}

export const INSTRUCTIONS_CAUTION_MOBILE = "Garant : avant de commencer sur téléphone, lisez puis copiez le paragraphe du Message privé de cet e-mail. Collez-le vous-même dans le champ Mention personnelle de Zoho. Propriétaire : vous n’avez aucun texte à recopier, vérifiez la mention du garant avant de signer.";
type CircuitAttendu = { modele?: string; id: string; external_document_id: string | null; signataires: { externalId?: string; email: string; telephone: string; qualite?: string; mentionCaution?: string }[]; annexes: unknown[] };
/** Construction commune à l'envoi et à la recette fournisseur sans invitation. */
export function actionsSignatureZoho(req: Demande, attendu: CircuitAttendu) {
  if (req.description !== `gerimmo:circuit:${attendu.id}` || req.request_status !== "draft" || !req.is_sequential || req.actions.length !== attendu.signataires.length || req.document_ids?.length !== attendu.annexes.length + 1) throw new Error("Le brouillon Zoho Sign a changé. Aucun envoi n’a été demandé.");
  const doc = req.document_ids.find(d => d.document_id === attendu.external_document_id);
  if (!doc || Number(doc.document_order) !== 0 || !Number.isInteger(doc.total_pages) || doc.total_pages <= req.actions.length) throw new Error("Les pages de signature du bail doivent être vérifiées.");
  return attendu.signataires.map((s, i) => {
    const a = req.actions.find(a => a.action_id === s.externalId);
    const phone = telephoneZoho(s.telephone);
    if (!a || a.signing_order !== i || a.action_type !== "SIGN" || a.recipient_email.toLowerCase() !== s.email.toLowerCase() || !a.verify_recipient || a.verification_type !== "SMS" || a.recipient_phonenumber !== phone.recipient_phonenumber || a.recipient_countrycode_iso !== phone.recipient_countrycode_iso) throw new Error("Les coordonnées des signataires Zoho Sign ont changé.");
    // Les pages individuelles sont toujours les N dernières pages du PDF généré.
    // Lors de la recette mobile, Zoho a conservé la hauteur et étendu la largeur
    // selon les proportions du paraphe. 30 pt garde les deux apparences observées
    // dans la zone de 190 pt, contrairement à la hauteur initiale de 80 pt.
    return { action_id: a.action_id, action_type: "SIGN", recipient_email: a.recipient_email, recipient_name: a.recipient_name, signing_order: i, verify_recipient: true, verification_type: "SMS", ...phone, ...(attendu.modele === "cautionnement" && s.qualite === "Garant" ? {private_notes:noteMentionCaution(s.mentionCaution ?? "")} : {}), fields: [
      ...(attendu.modele === "cautionnement" && s.qualite === "Garant" ? [{ field_type_name:"Textfield", field_name:`Mention personnelle ${i+1}`, field_label:"Collez le texte du Message privé de votre e-mail", description_tooltip:"Sur téléphone, copiez le paragraphe de votre e-mail, puis collez-le ici vous-même.", is_mandatory:true, document_id:doc.document_id, page_no:doc.total_pages-attendu.signataires.length+i, x_coord:54, y_coord:480, abs_width:480, abs_height:190, text_property:{font:"Arial",font_size:9,font_color:"000000",is_bold:false,is_italic:false,max_field_length:2048}, validation:{validation_type:"CUSTOM",validation_regex:expressionSaisieMentionCaution(s.mentionCaution ?? ""),validation_error_message:"Reprenez toute la mention de votre e-mail, montant compris. OK ne suffit pas."} }] : []),
      { field_type_name: "Signature", field_name: `Signature ${i + 1}`, field_label: "Signature du document", is_mandatory: true, document_id: doc.document_id, page_no: doc.total_pages - attendu.signataires.length + i, x_coord: 54, y_coord: attendu.modele === "cautionnement" && s.qualite === "Garant" ? 700 : 330, abs_width: 190, abs_height: 30 }
    ] };
  });
}
/** Zoho ajoute un champ sans field_id, même quand le nom est déjà présent. */
function reutiliserChampsZoho(actions: ReturnType<typeof actionsSignatureZoho>, req: Demande, obligatoires = false) {
  return actions.map(a => {
    const existants = req.actions.find(r => r.action_id === a.action_id)?.fields ?? [];
    if (existants.length && existants.length !== a.fields.length) throw new Error("Les champs Zoho doivent être vérifiés avant l’envoi.");
    return {...a, fields:a.fields.map(f => {
      const matches = existants.filter(e => e.field_name === f.field_name && e.field_type_name === f.field_type_name);
      if (matches.length === 0 && !existants.length && !obligatoires) return f;
      if (matches.length !== 1 || !matches[0].field_id) throw new Error("Les champs Zoho doivent être vérifiés avant l’envoi.");
      return {...f, field_id:idValide(matches[0].field_id)};
    })};
  });
}
export async function activerDemandeZoho(config: ConfigurationZohoSign, id: string, attendu: CircuitAttendu) {
  const req = await details(config, id);
  let actions = actionsSignatureZoho(req, attendu);
  const notes = attendu.modele === "cautionnement" ? {notes:INSTRUCTIONS_CAUTION_MOBILE} : {};
  if (attendu.modele === "cautionnement") {
    if (attendu.signataires.filter(s=>s.qualite === "Garant").length !== 1) throw new Error("Un acte de caution doit concerner exactement un garant.");
    actions = reutiliserChampsZoho(actions, req);
    // Vérifier que le prestataire conserve la règle AVANT d'envoyer une invitation.
    await json(config, `/requests/${idValide(id)}`, {method:"PUT",body:formulaire(config,{actions,...notes})});
    const controle = await details(config,id);
    actionsSignatureZoho(controle,attendu);
    for (const s of attendu.signataires.filter(s=>s.qualite === "Garant")) {
      const champs = controle.actions.find(a=>a.action_id===s.externalId)?.fields?.filter(f=>f.field_type_name==="Textfield") ?? [];
      const f = champs[0];
      if (champs.length !== 1 || !f.is_mandatory || f.default_value || f.field_value || f.validation?.validation_type!=="CUSTOM" || f.validation.validation_regex!==expressionSaisieMentionCaution(s.mentionCaution ?? "")) throw new Error("Zoho n’a pas confirmé le contrôle de la mention. Aucune invitation n’a été envoyée.");
    }
    const garant = attendu.signataires.find(s => s.qualite === "Garant")!;
    if (controle.notes !== INSTRUCTIONS_CAUTION_MOBILE || controle.actions.find(a => a.action_id === garant.externalId)?.private_notes !== noteMentionCaution(garant.mentionCaution ?? "")) throw new Error("Zoho n’a pas conservé le texte à copier dans l’invitation. Aucun envoi n’a été demandé.");
    // Réutiliser les identifiants reçus après PUT : aucun nouveau champ au submit.
    actions = reutiliserChampsZoho(actions, controle, true);
  }
  await json(config, `/requests/${idValide(id)}/submit`, { method: "POST", body: formulaire(config, { actions, ...notes }) });
}
const ETATS: Record<string, string> = { draft: "draft", inprogress: "ongoing", completed: "done", recalled: "canceled", expired: "expired", declined: "declined", rejected: "rejected" };
const ETATS_PERSONNES: Record<string, string> = { NOACTION: "initiated", UNOPENED: "notified", VIEWED: "notified", SIGNED: "signed", REJECTED: "declined" };
export async function lireDemandeZoho(config: ConfigurationZohoSign, id: string): Promise<DemandeSignatureLue & { signers: { id: string; status: string; email: string; mentions: unknown[] }[] }> {
  const req = await details(config, id);
  if (!ETATS[req.request_status]) throw new Error("L’état Zoho Sign doit être vérifié avant de poursuivre.");
  return { id: req.request_id, external_id: req.description?.replace(/^gerimmo:circuit:/, ""), status: req.is_deleted ? "deleted" : ETATS[req.request_status], signers: req.actions.map(a => ({ id: a.action_id, status: ETATS_PERSONNES[a.action_status] ?? "error", email: a.recipient_email, mentions:(a.fields ?? []).filter(f=>f.field_type_name==="Textfield").map(f=>f.field_value) })) };
}
export async function annulerDemandeZoho(config: ConfigurationZohoSign, id: string) {
  await json(config, `/requests/${idValide(id)}/recall`, { method: "POST" });
}
export async function supprimerBrouillonZoho(config: ConfigurationZohoSign, id: string) {
  const req = await details(config, id);
  if (req.request_status !== "draft") throw new Error("Ce dossier Zoho Sign n’est plus un brouillon.");
  await json(config, `/requests/${idValide(id)}/delete`, { method: "PUT" });
}
async function pdf(config: ConfigurationZohoSign, chemin: string) {
  const response = await appel(config, chemin); const limite = 10_485_760;
  if (Number(response.headers.get("content-length")) > limite) throw new Error("Archive trop volumineuse.");
  const reader = response.body?.getReader(); if (!reader) throw new Error("Archive vide.");
  const morceaux: Uint8Array[] = []; let taille = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; taille += value.byteLength; if (taille > limite) throw new Error("Archive trop volumineuse."); morceaux.push(value); } } finally { await reader.cancel(); }
  const contenu = Buffer.concat(morceaux);
  if (contenu.subarray(0, 5).toString() !== "%PDF-") throw new Error("Zoho Sign n’a pas retourné un PDF.");
  return new Uint8Array(contenu);
}
export const telechargerDocumentSigneZoho = (config: ConfigurationZohoSign, id: string, document: string) => pdf(config, `/requests/${idValide(id)}/documents/${idValide(document)}/pdf`);
export const telechargerDossierSigneZoho = (config: ConfigurationZohoSign, id: string) => pdf(config, `/requests/${idValide(id)}/pdf?with_coc=true&merge=true`);
export const telechargerPreuveZoho = (config: ConfigurationZohoSign, id: string) => pdf(config, `/requests/${idValide(id)}/completioncertificate`);
export function webhookZohoValide(corps: string, signature: string | null, secret: string) {
  if (!signature || !secret) return false;
  const recu = Buffer.from(signature, "utf8"), attendu = Buffer.from(createHmac("sha256", secret).update(corps).digest("base64"));
  return recu.length === attendu.length && timingSafeEqual(recu, attendu);
}
