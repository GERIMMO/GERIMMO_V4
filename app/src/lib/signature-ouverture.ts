import { DOCUMENTS_ZOHO, type ModeleSignature } from "./politique-signature";
import { configurationSignatureBail } from "./signature-bail";
import { signatureEnEssai } from "./signature-essai";
import { fermetureModeleSignature } from "./signature-interrupteurs";
import { prestataireSignature, type PrestataireSignature } from "./signature-prestataire";
import type { VoieElectronique, VoiesSignature } from "./voie-signature";

/**
 * Le service de signature électronique est-il ouvert, pour CE document et CETTE organisation ?
 *
 * Ce module lit `process.env` (réglages faits à la publication : ZOHO_SIGN_BAIL_ACTIF, ZOHO_SIGN_DOCUMENTS_ACTIF,
 * ZOHO_SIGN_DEVIS_ACTIF, ZOHO_SIGN_CAUTIONNEMENT_FERME…) : il ne doit jamais être importé par un composant client.
 *
 * Une seule règle, lue à deux endroits qui ne peuvent donc pas se contredire : le panneau de signature
 * (actions/signature-bail.ts) et la présentation des boutons (mise en page de l'espace).
 */
type Env = Record<string, string | undefined>;

/**
 * Le mode d'un NOUVEL envoi selon les réglages, hors fermeture ciblée d'un modèle : « indisponible » tant que le service
 * n'est pas ouvert. (Extrait tel quel de `lireSignatureBail`, le 24/11/2026.)
 */
export function modeSelonReglages(code: ModeleSignature, org: string, fournisseur: PrestataireSignature, env: Env = process.env): "indisponible" | "sandbox" | "production" {
  const essai = signatureEnEssai(org, env);
  const devisOuvert = code !== "devis_artisan" || env.ZOHO_SIGN_DEVIS_ACTIF === "true" || essai;
  const documentOuvert = code === "bail" || (fournisseur === "zoho" && (env.ZOHO_SIGN_DOCUMENTS_ACTIF === "true" || essai));
  if (!devisOuvert || !documentOuvert) return "indisponible";
  return configurationSignatureBail(env, fournisseur, org)?.environnement ?? "indisponible";
}

/** L'état de la voie électronique d'un modèle, pour une personne qui peut (ou non) demander la signature. */
export function voieElectronique(code: ModeleSignature, org: string, peutDemander: boolean, env: Env = process.env): VoieElectronique {
  // Seul le propriétaire direct peut demander une signature (contrôle `acces` de actions/signature-bail.ts).
  if (!peutDemander) return "non_proposee";
  if (fermetureModeleSignature(code, env)) return "suspendue";
  const fournisseur = code === "bail" ? prestataireSignature(env) : "zoho";
  return modeSelonReglages(code, org, fournisseur, env) === "indisponible" ? "en_preparation" : "ouverte";
}

/**
 * L'état de chaque modèle pour l'espace affiché. `role` et `lectureSeule` viennent de la garde de l'espace
 * (`verifierAccesEspace`) : la supervision qui traverse un espace en lecture seule ne peut rien demander.
 * Limite connue : un espace de la liste d'essai (SIGNATURE_BAIL_ORGS_ESSAI, espaces fictifs) n'est ouvert qu'au compte
 * de recette ; un autre compte de cet espace lirait « ouverte » puis le refus du panneau.
 */
export function voiesSignature(acces: { org: string; role: string; lectureSeule: boolean }, env: Env = process.env): VoiesSignature {
  const peutDemander = acces.role === "proprietaire_direct" && !acces.lectureSeule;
  const voies = {} as VoiesSignature;
  for (const code of Object.keys(DOCUMENTS_ZOHO) as ModeleSignature[]) voies[code] = voieElectronique(code, acces.org, peutDemander, env);
  return voies;
}
