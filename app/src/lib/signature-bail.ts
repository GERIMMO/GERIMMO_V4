import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chargerContexteBail, type ContexteBail, type PersonneDocument } from "@/lib/documents/modeles/communs";
import { MODELES } from "@/lib/documents/modeles";
import { echapper, type DocumentAssemble } from "@/lib/documents/gabarit";
import { refusDocumentIncomplet } from "@/lib/documents/completude";
import { configurationYoutrust } from "@/lib/youtrust";
import { configurationZohoSign } from "@/lib/zoho-sign";
import { prestataireSignature, type ConfigurationSignature, type PrestataireSignature } from "@/lib/signature-prestataire";
import { aujourdhuiParis } from "@/lib/ged";
import { marquerDocumentEssai, signatureEnEssai } from "@/lib/signature-essai";
import type { ModeleSignature } from "./politique-signature";

export type SignataireBail = {
  personId: string; qualite: "Locataire" | "Colocataire" | "Garant" | "Propriétaire";
  nom: string; prenom: string; email: string; telephone: string;
  externalId?: string; statut?: string; preuveDocumentId?: string;
  mentionCaution?: string;
};
export type CircuitBail = {
  essai?: boolean; modele?: ModeleSignature; cible_id?: string; options?: Record<string,string>;
  id: string; prestataire: PrestataireSignature; organization_id: string; bail_id: string | null; document_id: string;
  etat: "pret" | "preparation" | "en_cours" | "a_verifier" | "termine" | "annule" | "refuse" | "expire";
  environnement: "sandbox" | "production"; empreinte: string; pdf_hash: string; signataires: SignataireBail[];
  external_request_id: string | null; external_document_id: string | null;
  annexes: AnnexeSignature[];
  document_signe: string | null; erreur: string | null; created_at: string; expire_le: string;
};
export type AnnexeSignature = { id:string; titre:string; storage_path:string; empreinte:string };

export async function annexesSignatureBail(db:SupabaseClient,org:string,bail:string,ctx:ContexteBail) {
  const champs="id,titre,type,storage_path,empreinte,mime_type,purged_at,created_at";
  const [contrat,diagnostics,liens]=await Promise.all([
    db.from("baux").select("reglement_copropriete").eq("id",bail).eq("organization_id",org).single(),
    db.from("diagnostics").select("id,type,date_realisation,date_expiration,document_id,lot_id").eq("organization_id",org).is("archived_at",null)
      .or(`lot_id.eq.${ctx.lot.id},and(bien_id.eq.${ctx.bien.id},lot_id.is.null)`).order("date_realisation",{ascending:false}),
    db.from("document_liens").select("document_id").eq("organization_id",org).eq("entite","bail").eq("entite_id",bail),
  ]);
  if (contrat.error || diagnostics.error || liens.error) throw new Error("Les annexes du bail ne peuvent pas être vérifiées.");
  const idsLies = [...new Set((liens.data??[]).map(l=>l.document_id))];
  const notices = idsLies.length ? await db.from("documents").select(champs).eq("organization_id",org)
    .eq("type","courrier").eq("titre","Notice d'information (annexe au bail)").in("id",idsLies).is("purged_at",null).order("created_at",{ascending:false}).limit(1) : {data:[],error:null};
  if(notices.error)throw new Error("La notice jointe au bail ne peut pas être vérifiée.");
  const notice = notices.data?.[0];
  const manquants:string[]=[];
  if (!notice) manquants.push("Générez la notice d’information à l’étape Documents.");
  if (ctx.bien.copropriete && !contrat.data?.reglement_copropriete) manquants.push("Joignez les extraits du règlement de copropriété à l’étape Documents.");
  const ids=new Set<string>(); if(notice)ids.add(notice.id); if(contrat.data?.reglement_copropriete)ids.add(contrat.data.reglement_copropriete);
  const types=new Set<string>();
  const aujourd = aujourdhuiParis();
  if (!(diagnostics.data??[]).some(d=>d.type==='erp')) manquants.push("Joignez le diagnostic ERP à l’étape Documents.");
  for(const d of diagnostics.data??[]) {
    const cle=`${d.lot_id??"bien"}:${d.type}`;
    if(types.has(cle))continue; types.add(cle);
    if(d.document_id)ids.add(d.document_id);
    else manquants.push(`${d.type.toUpperCase()} : joignez le rapport PDF à l’étape Documents.`);
    if(d.date_expiration && d.date_expiration<aujourd)manquants.push(`${d.type.toUpperCase()} : le diagnostic est expiré, remplacez-le à l’étape Documents.`);
  }
  if (!ids.size)return {annexes:[] as AnnexeSignature[],manquants};
  const fichiers=await db.from("documents").select(champs).eq("organization_id",org).in("id",[...ids]).is("purged_at",null);
  if(fichiers.error || fichiers.data?.length!==ids.size)throw new Error("Une annexe n’est plus disponible. Vérifiez l’étape Documents.");
  const annexes:AnnexeSignature[]=[];
  for(const d of fichiers.data) {
    if(d.mime_type!=="application/pdf" || !d.storage_path || !d.empreinte)manquants.push(`${d.titre??"Annexe"} : joignez une version PDF avant l’envoi en signature.`);
    else annexes.push({id:d.id,titre:d.titre??"Annexe du bail",storage_path:d.storage_path,empreinte:d.empreinte});
  }
  if(annexes.length>49)manquants.push("Le dossier dépasse la limite de 49 annexes. Vérifiez les pièces avant l’envoi.");
  return {annexes:annexes.sort((a,b)=>a.id.localeCompare(b.id)),manquants};
}

export function telephoneSignature(v: string | null | undefined): string {
  const n = (v ?? "").replace(/[\s().-]/g, "");
  const normalise = /^0\d{9}$/.test(n) ? `+33${n.slice(1)}` : n.replace(/^00/, "+");
  return /^\+[1-9]\d{7,14}$/.test(normalise) ? normalise : "";
}

export function partiesSignatureBail(ctx: Pick<ContexteBail,"bailleurs"|"locataires"|"garants"> & {organisation:{type:string}}, inclureLocataires = true): { signataires: SignataireBail[]; manquants: string[] } {
  const manquants: string[] = [];
  if (ctx.organisation.type !== "proprietaire_direct") manquants.push("La signature du mandataire d’agence reste à configurer.");
  if (inclureLocataires && !ctx.locataires.length) manquants.push("Ajoutez un locataire au bail.");
  if (!ctx.bailleurs.length) manquants.push("Renseignez les propriétaires du lot.");
  const ids = new Set<string>(); const signataires: SignataireBail[] = [];
  function ajouter(p: PersonneDocument, qualite: SignataireBail["qualite"]) {
    if (ids.has(p.id)) { manquants.push(`${p.prenom ?? ""} ${p.nom} apparaît dans plusieurs rôles : vérifiez les parties au bail.`); return; }
    ids.add(p.id);
    const s: SignataireBail = { personId: p.id, qualite, nom: p.nom.trim(), prenom: p.prenom?.trim() ?? "", email: p.email?.trim() ?? "", telephone: telephoneSignature(p.telephone) };
    const libelle = `${s.prenom} ${s.nom}`.trim() || qualite;
    if (!s.nom || !s.prenom) manquants.push(`${libelle} : nom et prénom du signataire à renseigner.`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email)) manquants.push(`${libelle} : adresse e-mail à renseigner.`);
    if (!s.telephone) manquants.push(`${libelle} : téléphone pour recevoir le code SMS à renseigner.`);
    if (qualite === "Propriétaire" && p.qualite && /sci|morale|soci[eé]t[eé]/i.test(p.qualite)) manquants.push(`${libelle} : le représentant habilité de la personne morale doit être défini avant la signature électronique.`);
    signataires.push(s);
  }
  if (inclureLocataires) ctx.locataires.forEach((p,i) => ajouter(p, i === 0 ? "Locataire" : "Colocataire"));
  [...ctx.garants].sort((a,b) => a.id.localeCompare(b.id)).forEach(p => ajouter(p, "Garant"));
  [...ctx.bailleurs].sort((a,b) => a.id.localeCompare(b.id)).forEach(p => ajouter(p, "Propriétaire"));
  if (signataires.length > 25) manquants.push("Le prestataire accepte au maximum 25 signataires par circuit.");
  return { signataires, manquants };
}

/** Une page par personne : aucun chevauchement avec le texte ou une autre signature. */
export function ajouterPagesSignature(doc: DocumentAssemble, parties: SignataireBail[], annexes: AnnexeSignature[] = [], titre = "contrat de location", caution = false): DocumentAssemble {
  const pages = parties.map((p,i) => `<section style="break-before:page;break-inside:avoid;${caution && p.qualite === "Garant" ? "position:relative;min-height:680pt;" : ""}background:#fff;color:#17324d">
    <h1>Signature — ${echapper(titre)}</h1><p>Référence : ${echapper(doc.reference)}</p>
    <p>Cette page fait partie du document qui précède. La signature porte sur l’ensemble de ce document.</p>
    <h2>${i + 1}. ${echapper(p.qualite)}</h2><p>${echapper(`${p.prenom} ${p.nom}`)}</p>
    <p>La date et la preuve de signature sont établies par le prestataire au moment de la signature.</p>
    ${caution && p.qualite === "Garant" ? `<div style="font-size:8.5pt;line-height:1.25;overflow-wrap:anywhere"><strong>Mention personnelle de la caution</strong><p>Sur téléphone, copiez ce paragraphe depuis votre e-mail d’invitation avant d’ouvrir la saisie Zoho, puis collez-le vous-même dans le champ « Mention personnelle ». Il est aussi reproduit ci-dessous.</p><p>${echapper(p.mentionCaution ?? "Mention à préparer à nouveau avant tout envoi.")}</p></div>` : ''}
    <div style="${caution && p.qualite === "Garant" ? "position:absolute;top:656pt" : "margin-top:32pt;min-height:100pt"}"><span style="color:#fff;font:12px Arial;white-space:nowrap">{{s${i + 1}|signature|190|80}}</span></div>
  </section>`).join("");
  const inventaire = annexes.length ? `<section style="break-before:page"><h1>Annexes remises avec le contrat</h1><p>Ces pièces accompagnent le document dans le même dossier de signature. Leur empreinte identifie exactement la version remise.</p>${annexes.map(a=>`<div style="break-inside:avoid;margin:14pt 0"><strong>${echapper(a.titre)}</strong><p style="font:8px monospace;overflow-wrap:anywhere">SHA-256 : ${echapper(a.empreinte)}</p></div>`).join("")}</section>` : "";
  return { ...doc, html: doc.html.replace("</body>", `${inventaire}${pages}</body>`) };
}

export function empreinteSignatureBail(html: string, signataires: SignataireBail[]): string {
  // Seule la date d'édition du cartouche est volatile ; les dates du contrat
  // et toutes les valeurs métier restent dans l'empreinte.
  const stable = html.replace(/(<div>Établi le )<span class="v">[^<]*<\/span>(<\/div>)/g,"$1[date d’édition]$2");
  return createHash("sha256").update(JSON.stringify({ html: stable, signataires })).digest("hex");
}

export async function assemblerSignatureBail(db: SupabaseClient, org: string, bail: string) {
  const ctx = await chargerContexteBail(db, org, bail);
  if ("erreur" in ctx) throw new Error(ctx.erreur);
  if (ctx.bail.etat !== "brouillon") throw new Error("Seul un bail brouillon peut être envoyé pour signature.");
  // Les personnes sorties ne doivent pas réapparaître dans le contrat à signer.
  const { data: parties, error } = await db.from("bail_personnes").select("person_id,date_depart").eq("bail_id", bail).eq("organization_id", org);
  if (error) throw new Error("Les parties du bail ne peuvent pas être vérifiées.");
  if ((parties ?? []).some(p => p.date_depart)) throw new Error("Le bail contient une personne sortie : vérifiez ses parties avant de préparer la signature.");
  const { signataires, manquants } = partiesSignatureBail(ctx);
  const pieces = await annexesSignatureBail(db,org,bail,ctx);
  manquants.push(...pieces.manquants);
  const code = ctx.bail.chambre_id ? "bail_individuel" : ctx.bail.type === "colocation" ? "bail_colocation" : ctx.bail.type === "meuble" ? "bail_meuble" : "bail_nu";
  const modele = await MODELES[code].assembler(db, org, bail);
  if ("erreur" in modele) throw new Error(modele.erreur);
  const incomplet = refusDocumentIncomplet(modele.document);
  if (incomplet) manquants.push(...incomplet.manquants);
  const document = ajouterPagesSignature(signatureEnEssai(org) ? marquerDocumentEssai(modele.document) : modele.document, signataires,pieces.annexes);
  const empreinte = empreinteSignatureBail(document.html, signataires);
  return { ...modele, document, empreinte, signataires, manquants,annexes:pieces.annexes };
}

/** La suspension des nouveaux envois ne doit pas abandonner les dossiers déjà envoyés. */
export function configurationSuiviSignatureBail(env: Record<string,string|undefined> = process.env, prestataire: PrestataireSignature = prestataireSignature(env)): ConfigurationSignature | null {
  const yt = prestataire === "youtrust" ? configurationYoutrust(env) : null;
  const config: ConfigurationSignature | null = prestataire === "zoho" ? configurationZohoSign(env) : yt ? { ...yt, prestataire: "youtrust" } : null;
  const prefixe = prestataire === "zoho" ? "ZOHO_SIGN" : "YOUTRUST";
  if (!config || !env[`${prefixe}_WEBHOOK_SECRET`]?.trim()) return null;
  if (config.environnement === "sandbox") {
    // Les environnements déployés et les bases de production ne peuvent pas envoyer de vrais baux en sandbox.
    const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    try { if (!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname) || env.VERCEL) return null; }
    catch { return null; }
  }
  return config;
}

/** Opt-in distinct : posséder une clé ne permet jamais d'envoyer une invitation. */
export function configurationSignatureBail(env: Record<string,string|undefined> = process.env, prestataire: PrestataireSignature = prestataireSignature(env), org?: string): ConfigurationSignature | null {
  const prefixe = prestataire === "zoho" ? "ZOHO_SIGN" : "YOUTRUST";
  const essai = prestataire === "zoho" && Boolean(org && signatureEnEssai(org, env));
  return env[`${prefixe}_BAIL_ACTIF`] === "true" || essai ? configurationSuiviSignatureBail(env, prestataire) : null;
}
