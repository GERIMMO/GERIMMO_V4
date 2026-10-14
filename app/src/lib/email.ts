import { ArretSupervision } from "./controle-effets";
import { adresseDuSite } from "./site";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chargerMarque } from "./marque-organisation-serveur";
import { emailValide, enteteMarqueHtml, liensMarque, nomMarque } from "./marque-organisation";

// Envoi d'emails transactionnels via l'API Resend (quittances, décomptes…).
// Les liens de mot de passe (invitations, mot de passe oublié) passent aussi
// par ici depuis le 30/09 (lib/lien-mot-de-passe.ts). Seule la confirmation
// d'inscription part encore par le SMTP configuré dans Supabase.
// Nécessite RESEND_API_KEY dans l'environnement (.env.local) et un domaine vérifié.

/**
 * L'adresse d'expédition.
 *
 * Elle était en dur sur `no-reply@gerimmo.app` — une adresse dont le domaine
 * doit être VÉRIFIÉ chez Resend pour qu'un seul message parte. Tant qu'il ne
 * l'est pas (ou tant que le domaine n'est pas à nous), tout est refusé, clé
 * valide comprise : le produit était bloqué par une constante.
 *
 * Elle se règle donc par l'environnement. Sans réglage, on garde l'adresse de
 * la marque — c'est la cible, pas un repli.
 */
const EXPEDITEUR = process.env.RESEND_EXPEDITEUR?.trim() || "Gerimmo <no-reply@gerimmo.app>";

/**
 * Le délai maximal d'un appel au service d'e-mail (décision D47, fiche IA-05).
 *
 * Sans lui, un service qui ne répond pas retenait la tâche jusqu'à la coupure
 * de la fonction, qui la laissait « interrompue » avec des effets partiels.
 *
 * LE DÉLAI NE VA JAMAIS SEUL. Il peut couper l'attente d'un envoi que le
 * service a pourtant accepté : l'objet reste alors « non marqué » et la passe
 * suivante le reprend. Sans clé d'idempotence, ce serait un second e-mail au
 * destinataire. Les tâches d'envoi (quittances, avis d'échéance, relances,
 * rappels) passent donc toutes une `cleIdempotence` : voir
 * `lib/cles-idempotence-courriels.ts`. Le service, revoyant la même clé, rend la
 * réponse du premier envoi sans en émettre un second — tant qu'il la retient
 * (24 h, d'après `lib/rapports-mensuels.ts`).
 */
export const DELAI_MAX_FOURNISSEUR_MS = 15_000;

/** Le délai écoulé n'est pas un refus : l'envoi est inconnu, il a pu avoir lieu. */
const ERREUR_DELAI =
  "Le service d’e-mail n’a pas répondu à temps. L’envoi n’est pas confirmé et a peut-être eu lieu : vérifiez avant de le renvoyer.";

function delaiDepasse(e: unknown): boolean {
  return e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
}

export async function envoyerEmail(params: {
  to: string;
  subject: string;
  html: string;
  piecesJointes?: { nom: string; contenuBase64: string }[];
  /** Une clé stable par objet : le service n'envoie pas deux fois le même message pour la même clé. */
  cleIdempotence?: string;
  /** Délai maximal de l'appel, en millisecondes (15 s par défaut) ; réglable surtout pour les tests. */
  delaiMaxMs?: number;
  avantEnvoi?: () => Promise<void>;
  organisation?: { db: SupabaseClient; id: string };
}): Promise<{ erreur?: string; id?: string }> {
  const cle = process.env.RESEND_API_KEY;
  if (!cle) return { erreur: "Envoi des e-mails non configuré. Contactez l’administrateur." };
  try {
    const marque = params.organisation ? await chargerMarque(params.organisation.db, params.organisation.id) : null;
    // Verification fields are server-controlled in the database, never accepted from a form.
    const adresseVerifiee = marque?.email_expediteur_verifie_le && marque.email_expediteur && emailValide(marque.email_expediteur) ? marque.email_expediteur : null;
    const nom = marque ? nomMarque(marque).replace(/[<>"\r\n]/g, "").trim() : null;
    const expediteur = adresseVerifiee ? `${nom} <${adresseVerifiee}>` : nom ? EXPEDITEUR.replace(/^[^<]+(?=\s*<)/, nom + " ") : EXPEDITEUR;
    const repondreA = marque?.email_contact && emailValide(marque.email_contact) ? marque.email_contact : null;
    const html = marque ? `${enteteMarqueHtml(marque)}${liensMarque(params.html, marque, adresseDuSite())}` : params.html;
    await params.avantEnvoi?.();
    const reponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      // Posé ici, après le contrôle d'arrêt : le délai ne couvre que l'appel au service.
      signal: AbortSignal.timeout(params.delaiMaxMs ?? DELAI_MAX_FOURNISSEUR_MS),
      headers: {
        Authorization: `Bearer ${cle}`,
        "Content-Type": "application/json",
        ...(params.cleIdempotence ? { "Idempotency-Key": params.cleIdempotence } : {}),
      },
      body: JSON.stringify({
        from: expediteur,
        ...(repondreA ? { reply_to: repondreA } : {}),
        to: [params.to],
        subject: params.subject,
        html,
        ...(params.piecesJointes?.length ? { attachments: params.piecesJointes.map(p => ({ filename: p.nom, content: p.contenuBase64 })) } : {}),
      }),
    });
    if (!reponse.ok) {
      // Un statut d'erreur reçu est un refus : si le corps ne vient pas à temps,
      // ce n'est pas pour autant un « envoi inconnu ».
      const txt = await reponse.text().catch(() => "");
      // Le refus le plus fréquent, et le plus opaque : le domaine de
      // l'expéditeur n'est pas vérifié chez Resend. Le message brut parle de
      // « domain », jamais de ce qu'il faut faire. On le traduit.
      if (/domain/i.test(txt) && reponse.status === 403) {
        return {
          erreur: "L’adresse d’envoi doit encore être vérifiée auprès du service d’e-mail. Contactez le responsable Gerimmo pour terminer sa connexion.",
        };
      }
      return { erreur: "Le service d’e-mail a refusé l’envoi. Vérifiez l’adresse du destinataire puis réessayez." };
    }
    const resultat = await reponse.json().catch(() => null);
    return { ...(typeof resultat?.id === "string" ? { id: resultat.id } : {}) };
  } catch (e) {
    if (e instanceof ArretSupervision) throw e;
    if (delaiDepasse(e)) return { erreur: ERREUR_DELAI };
    return { erreur: "L’e-mail n’a pas pu partir car le service est momentanément indisponible. Réessayez dans un instant." };
  }
}
