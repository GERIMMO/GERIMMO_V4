import type { ModeleSignature } from "./politique-signature";
import { fermetureModeleSignature } from "./signature-interrupteurs";

/**
 * Les réglages serveur des NOUVEAUX envois en signature électronique, lus sans dépendance lourde (reprise du lot L4,
 * 26/11/2026). La santé du service (lib/sante-service.ts) et la rubrique « Budget des signatures »
 * (lib/ouverture-signatures.ts) les partagent sans charger lib/signature-bail.ts (modèles de documents, node:crypto) ni
 * lib/zoho-sign.ts (libphonenumber-js, node:crypto). tests/reglages-signature.test.ts le vérifie sur leurs imports.
 *
 * Ce module lit les variables qu'on lui passe (`process.env` à l'appel) : il ne doit jamais être importé par un
 * composant client.
 */
type Env = Record<string, string | undefined>;

const CLES_CONNEXION = ["ZOHO_SIGN_CLIENT_ID", "ZOHO_SIGN_CLIENT_SECRET", "ZOHO_SIGN_REFRESH_TOKEN", "ZOHO_SIGN_WEBHOOK_SECRET"] as const;

/**
 * Une connexion Zoho Sign de PRODUCTION est-elle configurée ? Même réponse que
 * `configurationSuiviSignatureBail(env)?.environnement === "production"` (lib/signature-bail.ts, qui s'appuie sur
 * `prestataireSignature` et `configurationZohoSign`) : prestataire Zoho (SIGNATURE_BAIL_PRESTATAIRE autre que
 * « youtrust »), ZOHO_SIGN_ENV exactement « production », trois clés d'autorisation et secret du retour sécurisé non
 * vides (espaces ignorés). tests/reglages-signature.test.ts compare les deux lectures sur toutes les combinaisons.
 */
export function connexionSignatureProduction(env: Env): boolean {
  return env.SIGNATURE_BAIL_PRESTATAIRE !== "youtrust"
    && env.ZOHO_SIGN_ENV === "production"
    && CLES_CONNEXION.every((cle) => Boolean(env[cle]?.trim()));
}

export const MOTIF_CONNEXION = "Connexion Zoho à configurer";
export const MOTIF_BAUX = "Envoi des baux désactivé";
export const MOTIF_AUTRES_ACTES = "Envoi des autres actes désactivé";
export const MOTIF_DEVIS = "Envoi des devis désactivé";

/**
 * Les motifs qu'une organisation de la liste d'essai (SIGNATURE_BAIL_ORGS_ESSAI, liste valide) ne subit pas : pour elle,
 * ZOHO_SIGN_BAIL_ACTIF, ZOHO_SIGN_DOCUMENTS_ACTIF et ZOHO_SIGN_DEVIS_ACTIF sont levés (configurationSignatureBail dans
 * lib/signature-bail.ts, `modeSelonReglages` du panneau de signature, contrôle d'envoi de lib/signature-envoi.ts).
 * La connexion et la suspension du cautionnement (« essais compris ») s'appliquent à tous.
 */
export const MOTIFS_LEVES_EN_ESSAI: ReadonlySet<string> = new Set([MOTIF_BAUX, MOTIF_AUTRES_ACTES, MOTIF_DEVIS]);

/**
 * Ce qui ferme les NOUVEAUX envois clients d'un modèle d'après les seuls réglages du serveur, sans le budget lu en base.
 * Deux lecteurs : `ouvertureSignatures` (rubrique « Budget des signatures » de /admin/sante), qui y ajoute ensuite le
 * budget du mois (devis, budget non disponible, plafond atteint), et la ligne « Envoi du cautionnement » de la même page
 * (lib/sante-service.ts, défaut E096/E204), qui ne lit pas le budget. Les deux écrans s'accordent donc sur les réglages,
 * pas sur le budget : la ligne peut dire « Activé » quand la rubrique dit « Plafond mensuel atteint » ou « Budget non
 * disponible » ; son détail le dit (« hors budget »).
 */
export function motifFermetureSelonReglages(code: ModeleSignature, env: Env): string | null {
  return fermetureModeleSignature(code, env)
    ?? (!connexionSignatureProduction(env) ? MOTIF_CONNEXION : null)
    ?? (env.ZOHO_SIGN_BAIL_ACTIF !== "true" ? MOTIF_BAUX : null)
    ?? (code !== "bail" && env.ZOHO_SIGN_DOCUMENTS_ACTIF !== "true" ? MOTIF_AUTRES_ACTES : null)
    ?? (code === "devis_artisan" && env.ZOHO_SIGN_DEVIS_ACTIF !== "true" ? MOTIF_DEVIS : null);
}
