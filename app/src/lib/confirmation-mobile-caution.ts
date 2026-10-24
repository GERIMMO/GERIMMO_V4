import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifierAvantEffet } from "@/lib/controle-effets";
import { eur, montantEnLettres } from "@/lib/documents/gabarit";
import { adresseLogement, chargerContexteBail } from "@/lib/documents/modeles/communs";
import { montantMaxDepuisOptions } from "@/lib/documents/modeles/cautionnement";
import { envoyerEmail } from "@/lib/email";
import { sansJargon } from "@/lib/erreurs";
import { emailValide } from "@/lib/marque-organisation";
import { gabaritNotification, type Message } from "@/lib/notifications";
import { lienConfidentialite } from "@/lib/message-invitation-signature";
import { fermetureModeleSignature } from "@/lib/signature-interrupteurs";
import { telephoneSignature, type CircuitBail } from "@/lib/signature-bail";
import { adresseDuSite } from "@/lib/site";
import { telephoneZoho } from "@/lib/zoho-sign";

// LA CAUTION CONFIRME ELLE-MÊME SON NUMÉRO DE MOBILE (décision du dirigeant du 23/10/2026, « Cautionnement et état des
// lieux signés dans Gerimmo », à la place de la fermeture R29 du plan de conformité).
//
// Le code SMS de la signature électronique part vers le numéro du garant. Saisi par le bailleur — son créancier —, ce
// numéro ne prouvait rien. Désormais, quand le bailleur lance la signature d'un acte de cautionnement, Gerimmo envoie à
// la caution (à l'adresse saisie par le bailleur) un lien à usage unique, valable sept jours au plus. La page publique
// du lien dit qui demande quoi (bailleur, logement, locataire, montant de l'engagement) ; la caution y saisit et confirme
// son numéro, puis la demande de signature est créée avec ce numéro. La mention reste saisie par la caution elle-même,
// dans sa session de signature.
//
// Le jeton (32 octets aléatoires) ne vit que dans l'e-mail : la base n'en garde que l'empreinte SHA-256. Les règles
// (propriétaire actif, acte prêt, cinq liens par jour, par garant et par bail, un seul lien ouvert par garant, usage
// unique, échéance) sont en base (migration 20261024120000) ; ici : la limite par organisation, l'e-mail, et les textes.
//
// LE GARANT QUI SIGNE AUSSI LE BAIL (décision du 24/10, choix logique délégué à Claude) suit le même chemin, avec les
// mêmes liens : le bail ne part qu'avec un numéro que chaque garant a confirmé lui-même. Celui qu'il a confirmé pour
// l'acte de cautionnement du même bail est repris sans nouvelle demande (`reprendre_mobiles_garants_bail`) ; sinon un
// lien lui part, et le bail attend. Chaque lien porte son garant et son acte (« cautionnement » ou « bail »).

/** Sept jours au plus (la base retient aussi la veille de l'expiration de la préparation, si elle est plus proche). */
export const DUREE_LIEN_CAUTION_JOURS = 7;
/** Liens envoyés par organisation et par heure (même compteur que les invitations, clé distincte). */
export const LIMITE_LIENS_CAUTION_PAR_ORGANISATION = 20;
/** Confirmations tentées par adresse IP et par heure sur la page publique. */
export const LIMITE_CONFIRMATIONS_PAR_IP = 20;

const FORME_JETON = /^[A-Za-z0-9_-]{43}$/;

export function nouveauJetonCaution(): { jeton: string; empreinte: string } {
  const jeton = randomBytes(32).toString("base64url");
  return { jeton, empreinte: empreinteJetonCaution(jeton)! };
}

/** L'empreinte SHA-256 (hexadécimale) d'un jeton bien formé ; `null` sinon, sans rien lire en base. */
export function empreinteJetonCaution(jeton: string | null | undefined): string | null {
  if (!jeton || !FORME_JETON.test(jeton)) return null;
  return createHash("sha256").update(jeton).digest("hex");
}

export function cheminConfirmationCaution(jeton: string): string {
  return `/signature/caution/${jeton}`;
}

/** Le numéro saisi par la caution, au format international, s'il désigne un mobile ; sinon le motif du refus. */
export function mobileCautionDepuisSaisie(saisie: string): { telephone: string } | { erreur: string } {
  const telephone = telephoneSignature(saisie);
  if (!telephone) return { erreur: "Saisissez votre numéro de mobile, par exemple 06 12 34 56 78 ou +33 6 12 34 56 78." };
  const numero = parsePhoneNumberFromString(telephone, { extract: false });
  if (!numero?.country || !numero.isValid()) return { erreur: "Ce numéro n’est pas valide. Vérifiez-le, avec l’indicatif du pays s’il n’est pas français." };
  const type = numero.getType();
  if (type !== "MOBILE" && type !== "FIXED_LINE_OR_MOBILE") return { erreur: "Saisissez un numéro de mobile : il recevra votre code de signature par SMS." };
  try {
    telephoneZoho(telephone);
  } catch {
    return { erreur: "Ce numéro n’est pas valide. Vérifiez-le, avec l’indicatif du pays s’il n’est pas français." };
  }
  return { telephone };
}

/** « 6 12 34 56 78 » lisible, pour l'écran de confirmation. */
export function mobileLisible(telephone: string): string {
  return parsePhoneNumberFromString(telephone)?.formatInternational() ?? telephone;
}

/** L'acte que le lien fait signer : l'acte de cautionnement, ou le bail que le garant signe aussi (décision du 24/10). */
export type ActeLienGarant = "cautionnement" | "bail";
export const acteDuCircuit = (circuit: Pick<CircuitBail, "modele">): ActeLienGarant => (circuit.modele === "cautionnement" ? "cautionnement" : "bail");

export type InfosDemandeCaution = {
  acte: ActeLienGarant;
  bailleur: string;
  logement: string;
  locataires: string;
  montant: string | null;
  solidaire: boolean;
  garant: { prenom: string; nom: string; email: string };
  essai: boolean;
};

const nomUsuel = (p: { prenom: string | null; nom: string }) => [p.prenom, p.nom].filter(Boolean).join(" ").trim();
const enumeration = (noms: string[]) => (noms.length > 1 ? `${noms.slice(0, -1).join(", ")} et ${noms[noms.length - 1]}` : noms[0] ?? "");

/**
 * Ce que le garant doit savoir avant de confirmer : lu dans le dossier du bail, borné à l'organisation du circuit.
 * `garantId` : le garant visé par le lien (obligatoire pour un bail, qui peut en avoir plusieurs).
 */
export async function infosDemandeCaution(db: SupabaseClient, org: string, circuit: CircuitBail, garantId?: string): Promise<InfosDemandeCaution> {
  const acte = acteDuCircuit(circuit);
  const garantSignataire = circuit.signataires.find((s) => s.qualite === "Garant" && (acte === "cautionnement" ? !garantId || s.personId === garantId : s.personId === garantId));
  if (!garantSignataire || !circuit.bail_id) throw new Error("Ce lien n’est plus valable. Demandez au bailleur de vous en envoyer un nouveau.");
  const ctx = await chargerContexteBail(db, org, circuit.bail_id);
  if ("erreur" in ctx) throw new Error("Le dossier de cette demande n’est plus disponible.");
  const garant = ctx.garants.find((g) => g.id === (acte === "cautionnement" ? circuit.options?.garant : garantSignataire.personId));
  const couverts = garant?.garant_de ? ctx.locataires.filter((l) => l.id === garant.garant_de) : ctx.locataires;
  const montant = acte === "cautionnement" ? montantMaxDepuisOptions(circuit.options?.montant_max) : null;
  return {
    acte,
    bailleur: enumeration(ctx.bailleurs.map(nomUsuel).filter(Boolean)) || "Le bailleur",
    logement: adresseLogement(ctx.lot, ctx.bien),
    locataires: enumeration(couverts.map(nomUsuel).filter(Boolean)) || "le locataire",
    montant: montant === null ? null : `${eur(montant)} (${montantEnLettres(montant)})`,
    solidaire: circuit.options?.forme !== "simple",
    garant: { prenom: garantSignataire.prenom, nom: garantSignataire.nom, email: garantSignataire.email },
    essai: Boolean(circuit.essai),
  };
}

export function echeanceLisible(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
}

export const SUJET_CONFIRMATION_CAUTION = "Acte de cautionnement : confirmez votre numéro de mobile";
export const SUJET_CONFIRMATION_GARANT_BAIL = "Bail : confirmez votre numéro de mobile";

/** L'e-mail du lien. Texte brut échappé par le gabarit ; le seul lien est celui de la page de confirmation. */
export function messageConfirmationMobileCaution(p: InfosDemandeCaution & { lien: string; expireLe: string; confidentialite: string }): Message {
  const bail = p.acte === "bail";
  return {
    sujet: bail ? SUJET_CONFIRMATION_GARANT_BAIL : SUJET_CONFIRMATION_CAUTION,
    html: gabaritNotification({
      titre: "Confirmez votre numéro de mobile",
      prenom: p.garant.prenom,
      emetteur: p.bailleur,
      lignes: [
        ...(p.essai ? [`Essai technique sans engagement : ce message et ${bail ? "le bail" : "l’acte"} sont fictifs.`] : []),
        bail
          ? `${p.bailleur} vous demande de signer électroniquement le bail du logement situé ${p.logement}, loué à ${p.locataires}, en qualité de garant : vous y reconnaîtrez avoir reçu un exemplaire du bail. Vous ne vous y engagez pas comme caution : seul l’acte de cautionnement, signé séparément, vous engage.`
          : `${p.bailleur} vous demande de signer électroniquement un acte de cautionnement : vous vous porteriez caution${p.solidaire ? " solidaire" : " simple"} de ${p.locataires}, pour la location du logement situé ${p.logement}${p.montant ? `, dans la limite de ${p.montant}` : ""}.`,
        `Avant l’envoi ${bail ? "du bail" : "de l’acte"}, confirmez vous-même le numéro de mobile qui recevra votre code de signature par SMS. Aucun autre numéro n’est utilisé.`,
        `Ce lien est personnel et ne sert qu’une fois. Il est valable jusqu’au ${echeanceLisible(p.expireLe)}.`,
        bail
          ? "Vous recevrez ensuite, à votre tour de signer, l’invitation de notre prestataire de signature, Zoho Sign : vous y lirez tout le bail avant de signer."
          : "Vous recevrez ensuite l’invitation de notre prestataire de signature, Zoho Sign : vous y lirez tout l’acte, avec une copie du bail, et vous y saisirez vous-même la mention de caution avant de signer.",
        `Si vous confirmez, vos nom, adresse électronique et numéro de mobile seront transmis à Zoho Sign pour ce seul document, à la demande de ${p.bailleur}. Détails : ${p.confidentialite}.`,
        "Vous ne connaissez pas cette demande ? Ignorez ce message : rien ne vous sera envoyé.",
      ],
      action: { libelle: "Confirmer mon numéro de mobile", lien: p.lien },
    }),
  };
}

/** Adresse comparable : sans espaces autour, en minuscules. */
export const adresseComparable = (email: string | null | undefined) => (email ?? "").trim().toLowerCase();

/**
 * Relecture du 24/10 : le lien ne part jamais à l'adresse d'un autre signataire de l'acte (le bailleur), qui pourrait y
 * confirmer son propre numéro. La base refuse aussi l'adresse d'un détenteur du lot ou d'un compte de l'espace.
 */
export const REFUS_ADRESSE_CAUTION_BAILLEUR =
  "L’adresse e-mail de la caution est celle d’un bailleur : renseignez sur sa fiche l’adresse personnelle de la caution, puis préparez un nouveau PDF.";
export const REFUS_ADRESSE_GARANT_BAIL =
  "L’adresse e-mail du garant est celle d’une autre personne du bail : renseignez sur sa fiche l’adresse personnelle du garant, puis préparez un nouveau PDF.";

/**
 * Le bailleur lance la signature d'un acte de cautionnement (ou d'un bail, décision du 24/10) dont le garant n'a pas
 * encore confirmé son mobile : un nouveau lien part à ce garant (le précédent, s'il était ouvert, est annulé).
 * `garant` : le `personId` du garant visé, obligatoire pour un bail. Lève une erreur lisible ; rend l'échéance du lien.
 */
export async function demanderConfirmationMobileCaution(p: { service: SupabaseClient; org: string; circuit: CircuitBail; acteur: string; garant?: string }): Promise<{ expireLe: string; email: string }> {
  const { service, org, circuit, acteur } = p;
  const acte = acteDuCircuit(circuit);
  const garants = circuit.signataires.filter((s) => s.qualite === "Garant");
  if (acte === "cautionnement" && garants.length !== 1) throw new Error("Un acte de caution doit concerner exactement un garant.");
  const cible = acte === "cautionnement" ? garants[0] : garants.find((s) => s.personId === p.garant);
  if (!cible) throw new Error("Ce garant ne signe pas ce bail.");
  if (!emailValide(cible.email)) throw new Error(acte === "cautionnement" ? "Renseignez l’adresse e-mail de la caution : le lien de confirmation lui est envoyé." : "Renseignez l’adresse e-mail du garant : le lien de confirmation lui est envoyé.");
  if (circuit.signataires.some((s) => s.personId !== cible.personId && adresseComparable(s.email) === adresseComparable(cible.email))) throw new Error(acte === "cautionnement" ? REFUS_ADRESSE_CAUTION_BAILLEUR : REFUS_ADRESSE_GARANT_BAIL);
  const origine = adresseDuSite();
  if (!origine) throw new Error("L’adresse du site n’est pas configurée. Contactez l’administrateur.");
  const limite = await service.rpc("autoriser_lien_mot_de_passe_cle", { p_cle: `caution-mobile:organisation:${org}`, p_max: LIMITE_LIENS_CAUTION_PAR_ORGANISATION });
  if (limite.error) throw new Error("Le service est momentanément indisponible. Réessayez dans un instant.");
  if (limite.data !== true) throw new Error("Trop de liens envoyés depuis une heure. Réessayez plus tard.");
  const infos = await infosDemandeCaution(service, org, circuit, cible.personId);
  await verifierAvantEffet(service, "signatures");
  const { jeton, empreinte } = nouveauJetonCaution();
  const demande = await service.rpc("demander_confirmation_mobile_caution", { p_circuit: circuit.id, p_actor: acteur, p_jeton_empreinte: empreinte, p_garant: cible.personId });
  if (demande.error || typeof demande.data !== "string") throw new Error(sansJargon(demande.error?.message ?? "Le lien n’a pas pu être préparé."));
  const expireLe = demande.data;
  const message = messageConfirmationMobileCaution({ ...infos, lien: `${origine}${cheminConfirmationCaution(jeton)}`, expireLe, confidentialite: lienConfidentialite() });
  const envoi = await envoyerEmail({ to: cible.email, subject: message.sujet, html: message.html, organisation: { db: service, id: org } });
  if (envoi.erreur) throw new Error(`Le lien est prêt, mais l’e-mail n’est pas parti : ${envoi.erreur} Vous pouvez renvoyer le lien.`);
  return { expireLe, email: cible.email };
}

export type EtatLienCaution =
  | { etat: "invalide" | "annule" | "utilise" | "expire" | "suspendu" }
  | ({ etat: "valide"; expireLe: string } & InfosDemandeCaution);

/** Ce que lit le garant quand le lien ne sert pas (ou plus) ; rien du dossier. */
export const MESSAGES_LIEN_CAUTION_CLOS: Record<Exclude<EtatLienCaution["etat"], "valide">, string> = {
  invalide: "Ce lien n’est pas valable. Vérifiez que vous avez ouvert le lien complet reçu par e-mail.",
  annule: "Ce lien n’est plus valable : une demande plus récente a pu le remplacer. Demandez au bailleur de vous en envoyer un nouveau.",
  // Relecture du 24/10 : l'envoi a pu échouer après la confirmation ; rien ne garantit que l'invitation est partie.
  utilise: "Ce lien a déjà servi : votre numéro est confirmé. L’invitation à signer vous parviendra par e-mail de la part de Zoho Sign dès que l’acte sera envoyé.",
  expire: "Ce lien a expiré. Demandez au bailleur de vous en envoyer un nouveau.",
  // Relecture du 24/10 : le réglage serveur qui suspend le cautionnement électronique se dit dès l'ouverture.
  suspendu: "La signature électronique de cet acte est suspendue pour le moment. Le bailleur vous proposera de le signer autrement.",
};

/**
 * L'acte d'un lien, lu par sa seule empreinte (`null` s'il est inconnu). Sert à savoir, quand le cautionnement
 * électronique est suspendu par réglage serveur, si le lien est celui d'un garant du bail, que ce réglage ne touche pas.
 */
export async function acteDuLienCaution(service: SupabaseClient, empreinte: string): Promise<ActeLienGarant | null> {
  const { data, error } = await service.from("confirmations_mobile_caution").select("acte").eq("jeton_empreinte", empreinte).maybeSingle();
  if (error) throw new Error("Le lien n’a pas pu être vérifié. Rechargez la page dans un instant.");
  const acte = (data as { acte?: string } | null)?.acte;
  return acte === "bail" || acte === "cautionnement" ? acte : null;
}

/**
 * La page publique : rien n'est lu en base pour un jeton mal formé ; rien du dossier n'est dit pour un lien clos ni
 * quand le cautionnement électronique est suspendu (le seul lien est alors lu, pour savoir s'il fait signer un bail,
 * que ce réglage ne suspend pas : décision du 24/10).
 */
export async function lireLienCaution(service: SupabaseClient, jeton: string): Promise<EtatLienCaution> {
  const empreinte = empreinteJetonCaution(jeton);
  if (!empreinte) return { etat: "invalide" };
  const { data: lien, error } = await service.from("confirmations_mobile_caution")
    .select("organization_id,circuit_id,garant_id,acte,expire_le,utilise_le,annulee_le").eq("jeton_empreinte", empreinte).maybeSingle();
  if (error) throw new Error("Le lien n’a pas pu être vérifié. Rechargez la page dans un instant.");
  if (!lien) return { etat: "invalide" };
  const acte: ActeLienGarant = lien.acte === "bail" ? "bail" : "cautionnement";
  if (fermetureModeleSignature(acte)) return { etat: "suspendu" };
  if (lien.annulee_le) return { etat: "annule" };
  if (lien.utilise_le) return { etat: "utilise" };
  if (new Date(lien.expire_le).getTime() <= Date.now()) return { etat: "expire" };
  const { data: circuit } = await service.from("bail_signature_circuits").select("*").eq("id", lien.circuit_id).eq("organization_id", lien.organization_id).maybeSingle();
  if (!circuit || circuit.etat !== "pret" || acteDuCircuit(circuit as CircuitBail) !== acte || (acte === "bail" && (circuit.modele ?? "bail") !== "bail")) return { etat: "annule" };
  return { etat: "valide", expireLe: lien.expire_le, ...(await infosDemandeCaution(service, lien.organization_id, circuit as CircuitBail, lien.garant_id ?? undefined)) };
}
