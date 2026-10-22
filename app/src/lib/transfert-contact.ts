import PostalMime, { type Email } from "postal-mime";
import { Resend } from "resend";

const SOURCE = "contact@gerimmo.app";
const MARQUEUR = "X-Gerimmo-Transfer";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FENETRE_MS = 23 * 60 * 60 * 1000;

function adresse(value: unknown): string | null {
  if (typeof value !== "string" || /[\r\n]/.test(value)) return null;
  const email = value.trim().toLowerCase();
  return /^[^\s<>@,;"\\]+@[^\s<>@,;"\\]+\.[^\s<>@,;"\\]+$/.test(email) ? email : null;
}

export function configurationTransfert(env: Record<string, string | undefined> = process.env) {
  const destination = adresse(env.RESEND_CONTACT_TRANSFERT_VERS);
  if (env.RESEND_CONTACT_TRANSFERT_ACTIF !== "true" || (env.VERCEL_ENV && env.VERCEL_ENV !== "production")) return null;
  if (!destination || destination === SOURCE || !env.RESEND_API_KEY?.trim() || !env.RESEND_CONTACT_WEBHOOK_SECRET?.trim()) return null;
  return { destination, cle: env.RESEND_API_KEY.trim(), secret: env.RESEND_CONTACT_WEBHOOK_SECRET.trim() };
}

/** Lit un flux borné, même si Content-Length est absent ou mensonger. */
export async function lireCorpsBorne(body: ReadableStream<Uint8Array> | null, limite: number): Promise<Buffer> {
  if (!body) throw new Error("corps_absent");
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let taille = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks);
      taille += value.byteLength;
      if (taille > limite) { await reader.cancel(); throw new Error("corps_trop_grand"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
}

function recent(value: unknown, maintenant: number) {
  const date = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(date) && date <= maintenant + 300_000 && date >= maintenant - FENETRE_MS;
}

export function preparerTransfert(email: Email, destination: string) {
  const repondreA = email.replyTo?.map((p) => adresse(p.address)).find(Boolean) || adresse(email.from?.address);
  const expediteur = email.from?.address || "Expéditeur non renseigné";
  const nom = (email.from?.name || expediteur).replace(/[<>\r\n"]/g, "").slice(0, 180);
  // Seul le destinataire administré est utilisé. Aucun To/Cc/Bcc d'origine n'est recopié.
  return {
    from: `"${nom} via Gerimmo" <${SOURCE}>`,
    to: [destination],
    ...(repondreA && repondreA !== SOURCE ? { reply_to: repondreA } : {}),
    subject: `[Contact Gerimmo] ${(email.subject || "Sans objet").replace(/[\r\n]/g, " ")}`.slice(0, 998),
    text: `Message reçu sur ${SOURCE}.\nDe : ${expediteur}\n\n${email.text || "Le message original est au format HTML."}`,
    ...(email.html ? { html: email.html } : {}),
    headers: { [MARQUEUR]: "contact-v1", "Auto-Submitted": "auto-forwarded", "X-Auto-Response-Suppress": "All" },
    attachments: email.attachments.map((piece, index) => ({
      filename: (piece.filename || `piece-jointe-${index + 1}`).replace(/[\r\n]/g, " "),
      content: typeof piece.content === "string" ? piece.content : Buffer.from(piece.content as Uint8Array).toString("base64"),
      content_type: piece.mimeType,
      ...(piece.contentId ? { content_id: piece.contentId.replace(/^<|>$/g, "") } : {}),
    })),
  };
}

/** Le lien de contenu vient uniquement de la réponse authentifiée de Resend. */
function lienBrutAutorise(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") &&
      ["resend.com", "resend.dev", "resend.app", "amazonaws.com"].some((domaine) => url.hostname === domaine || url.hostname.endsWith(`.${domaine}`));
  } catch { return false; }
}

type Resultat = { statut: number; etat: string };
export async function traiterTransfertContact(request: Request, env: Record<string, string | undefined> = process.env, maintenant = Date.now()): Promise<Resultat> {
  const config = configurationTransfert(env);
  if (!config) return { statut: 503, etat: "non_configure" };
  let brut: string;
  try { brut = (await lireCorpsBorne(request.body, 262_144)).toString("utf8"); }
  catch { return { statut: 413, etat: "corps_refuse" }; }
  let evenement;
  try {
    evenement = new Resend(config.cle).webhooks.verify({
      payload: brut,
      headers: { id: request.headers.get("svix-id") || "", timestamp: request.headers.get("svix-timestamp") || "", signature: request.headers.get("svix-signature") || "" },
      webhookSecret: config.secret,
    });
  } catch { return { statut: 400, etat: "signature_refusee" }; }
  if (evenement?.type !== "email.received") return { statut: 200, etat: "ignore" };
  const id = evenement.data?.email_id;
  if (typeof id !== "string" || !UUID.test(id)) return { statut: 400, etat: "reference_refusee" };
  // La clé d'idempotence Resend dure 24 h. Au-delà de 23 h depuis réception,
  // conserver l'échec visible pour reprise humaine, jamais renvoyer à l'aveugle.
  if (!recent(evenement.created_at, maintenant)) return { statut: 409, etat: "reprise_manuelle_requise" };
  const signal = AbortSignal.timeout(25_000);
  const headers = { Authorization: `Bearer ${config.cle}` };
  try {
    const metadata = await fetch(`https://api.resend.com/emails/receiving/${id}?html_format=cid`, { headers, signal, cache: "no-store", redirect: "error" });
    if (!metadata.ok) return { statut: 503, etat: "lecture_indisponible" };
    const email = JSON.parse((await lireCorpsBorne(metadata.body, 2_097_152)).toString("utf8"));
    if (email.id !== id) return { statut: 503, etat: "reference_incoherente" };
    const destinataires = [email.to, email.cc, email.bcc, email.received_for].flatMap((liste) => Array.isArray(liste) ? liste : []);
    if (!destinataires.some((a) => adresse(a) === SOURCE)) return { statut: 200, etat: "hors_boite_contact" };
    if (!recent(email.created_at, maintenant)) return { statut: 409, etat: "reprise_manuelle_requise" };
    if (!lienBrutAutorise(email.raw?.download_url)) return { statut: 503, etat: "contenu_indisponible" };
    // Aucune clé API transmise au stockage du message, aucun suivi de redirection.
    const raw = await fetch(email.raw.download_url, { signal, cache: "no-store", redirect: "error" });
    if (!raw.ok) return { statut: 503, etat: "contenu_indisponible" };
    const contenu = await lireCorpsBorne(raw.body, 40 * 1024 * 1024);
    const parsed = await PostalMime.parse(contenu, { attachmentEncoding: "base64", maxNestingDepth: 30, maxHeadersSize: 262_144, maxRfc822NestingDepth: 4 });
    if (parsed.headers.some((h) => h.key.toLowerCase() === MARQUEUR.toLowerCase())) return { statut: 200, etat: "boucle_ignoree" };
    const envoi = await fetch("https://api.resend.com/emails", {
      method: "POST", signal, redirect: "error",
      headers: { ...headers, "Content-Type": "application/json", "Idempotency-Key": `contact-transfert-v1/${id}` },
      body: JSON.stringify(preparerTransfert(parsed, config.destination)),
    });
    if (!envoi.ok) return { statut: 503, etat: "transfert_non_confirme" };
    const resultat = await envoi.json();
    if (typeof resultat?.id !== "string" || !resultat.id) return { statut: 503, etat: "transfert_non_confirme" };
    return { statut: 200, etat: "transfere" };
  } catch { return { statut: 503, etat: "transfert_non_confirme" }; }
}
