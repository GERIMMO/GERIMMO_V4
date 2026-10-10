import { lireMentionsContrat, verifierHonorairesContrat } from "@/lib/mentions-contrat";
import { moisDepotGarantie } from "@/lib/depot-garantie";

export const ETAPES_BAIL = [
  { id: "bail", titre: "Le bail", detail: "Type de contrat et dates" },
  { id: "personnes", titre: "Personnes", detail: "Propriétaires, locataires et garants" },
  { id: "logement", titre: "Le logement", detail: "Vérifier les informations reprises du lot" },
  { id: "loyer", titre: "Loyer", detail: "Montants, charges et paiement" },
  { id: "documents", titre: "Documents", detail: "Diagnostics repris du lot et annexes du contrat" },
  { id: "clauses", titre: "Autres et clauses", detail: "Règles locales, travaux et clauses particulières" },
  { id: "recapitulatif", titre: "Récapitulatif", detail: "Relire le contrat, générer les PDF et préparer les signatures" },
] as const;
export const CHAMPS_ETAPE_BAIL = {
  bail: ["type", "chambre_id", "date_debut", "date_conclusion_prevue", "meuble_etudiant"],
  loyer: ["loyer_hc", "charges", "depot_garantie", "charges_mode", "jour_echeance", "irl_trimestre", "revision_irl", "irl_valeur", "fixation_loyer", "paiement_echeance", "lieu_paiement", "precedente_location", "precedent_loyer_revise", "dernier_loyer", "dernier_loyer_versement", "dernier_loyer_revision", "honoraires_bailleur", "honoraires_locataire", "honoraires_edl_bailleur", "honoraires_edl_locataire", "zone_honoraires"],
  documents: ["dpe_depenses_min", "dpe_depenses_max", "dpe_annees_reference"],
  clauses: ["encadrement_loyer", "loyer_reference", "loyer_reference_majore", "complement_loyer", "complement_justification", "servitude_residence_principale", "clause_resolutoire_assurance", "clause_resolutoire_troubles", "clause_resolutoire_servitude", "duree_reduite_evenement", "travaux_recents", "travaux_recents_montant", "travaux_locataire", "clauses_particulieres"],
} as const;
export type EtapeSaisieBail = keyof typeof CHAMPS_ETAPE_BAIL;
export type ValeursParcoursBail = Record<string, string | number | boolean | null | undefined>;
const nombres = new Set(["loyer_hc", "charges", "depot_garantie", "jour_echeance", "irl_valeur", "dernier_loyer", "honoraires_bailleur", "honoraires_locataire", "honoraires_edl_bailleur", "honoraires_edl_locataire", "dpe_depenses_min", "dpe_depenses_max", "loyer_reference", "loyer_reference_majore", "complement_loyer", "travaux_recents_montant"]);
const booleens = new Set(["meuble_etudiant", "revision_irl", "precedent_loyer_revise", "encadrement_loyer", "servitude_residence_principale", "clause_resolutoire_assurance", "clause_resolutoire_troubles", "clause_resolutoire_servitude"]);
const dates = new Set(["date_debut", "date_conclusion_prevue", "dernier_loyer_versement", "dernier_loyer_revision"]);
const options: Record<string, string[]> = { type:["nu","meuble","colocation","colocation_individuelle"], charges_mode:["provision","forfait"], irl_trimestre:["T1","T2","T3","T4"], fixation_loyer:["libre","plafonnement","reevaluation"], paiement_echeance:["echoir","echu"], precedente_location:["premiere","ancienne","recente"], zone_honoraires:["tres_tendue","tendue","autre"] };

/** Chaque enregistrement ne modifie que les champs de l’étape, jamais les personnes ni les autres étapes. */
export function lireEtapeBail(etape: EtapeSaisieBail, form: FormData, actuel: ValeursParcoursBail, logement: { meuble: boolean; surface: number | null }) {
  const patch: ValeursParcoursBail = {};
  const erreur = (message: string) => ({ erreur: message, patch: null });
  for (const nom of CHAMPS_ETAPE_BAIL[etape]) {
    if (!form.has(nom)) continue;
    const brut = String(form.get(nom) ?? "").trim();
    if (booleens.has(nom)) {
      if (brut && !["true","false"].includes(brut)) return erreur("Choisissez Oui ou Non dans les champs proposés.");
      patch[nom] = brut ? brut === "true" : null;
    } else if (nombres.has(nom)) {
      const n = brut ? Number(brut.replace(",", ".")) : null;
      if (n != null && (!Number.isFinite(n) || n < 0 || n > 99999999.99 || Math.abs(n*100-Math.round(n*100))>0.00001)) return erreur("Saisissez des montants positifs ou nuls, avec au plus deux décimales.");
      patch[nom] = n;
    } else {
      if (brut.length > (nom === "clauses_particulieres" ? 4000 : nom.startsWith("travaux_") ? 2000 : 500)) return erreur("Un texte est trop long. Raccourcissez-le avant d’enregistrer.");
      if (dates.has(nom) && brut && (!/^\d{4}-\d{2}-\d{2}$/.test(brut) || !Number.isFinite(Date.parse(brut)) || new Date(brut).toISOString().slice(0,10) !== brut)) return erreur("Vérifiez les dates renseignées.");
      if (options[nom] && brut && !options[nom].includes(brut)) return erreur("Choisissez une valeur proposée dans la liste.");
      patch[nom] = brut || null;
    }
  }
  if (etape === "bail") {
    if (!patch.type || !patch.date_debut) return erreur("Choisissez le type de bail et la date d’entrée.");
    const individuel = patch.type === "colocation_individuelle";
    if (individuel && !/^[0-9a-f-]{36}$/i.test(String(patch.chambre_id))) return erreur("Choisissez la chambre privative de ce contrat.");
    patch.type = individuel ? "colocation" : patch.type;
    patch.chambre_id = individuel ? patch.chambre_id : null;
    if (!(patch.type === "meuble" || (patch.type === "colocation" && logement.meuble))) patch.meuble_etudiant = false;
    patch.meuble_etudiant ??= false;
  }
  if (etape === "bail" || etape === "loyer") {
    if (etape === "loyer" && (!Number.isInteger(patch.jour_echeance) || Number(patch.jour_echeance)<1 || Number(patch.jour_echeance)>28)) return erreur("Le jour d’échéance doit être compris entre 1 et 28.");
    const fusion = { ...actuel, ...patch };
    if (etape === "loyer" && ["loyer_hc","charges","depot_garantie"].some(n => patch[n] == null)) return erreur("Renseignez le loyer, les charges et le dépôt. Indiquez 0 si le montant est nul.");
    if (fusion.type === "nu" && fusion.charges_mode === "forfait") return erreur("Un bail nu utilise des provisions sur charges. Corrigez le mode de charges à l’étape Loyer.");
    if (fusion.loyer_hc != null && fusion.depot_garantie != null && Number(fusion.depot_garantie) > moisDepotGarantie(String(fusion.type), logement.meuble) * Number(fusion.loyer_hc)) return erreur("Le dépôt de garantie dépasse le plafond du type de bail choisi. Corrigez-le à l’étape Loyer.");
    if (etape === "loyer") {
      patch.revision_irl ??= false;
      patch.paiement_echeance ??= "echoir";
      patch.charges_mode ??= "provision";
      if (patch.precedente_location !== "recente") Object.assign(patch, {dernier_loyer:null,dernier_loyer_versement:null,dernier_loyer_revision:null,precedent_loyer_revise:null});
      else if (patch.precedent_loyer_revise !== true) patch.dernier_loyer_revision = null;
    }
    const controleHonoraires = verifierHonorairesContrat({ ...fusion, date_conclusion_prevue:fusion.date_conclusion_prevue as string | null, zone_honoraires:fusion.zone_honoraires as string | null, honoraires_bailleur:fusion.honoraires_bailleur as number | null, honoraires_locataire:fusion.honoraires_locataire as number | null, honoraires_edl_bailleur:fusion.honoraires_edl_bailleur as number | null, honoraires_edl_locataire:fusion.honoraires_edl_locataire as number | null }, logement.surface);
    if (controleHonoraires) return erreur(controleHonoraires);
  }
  if (etape === "clauses") {
    if (patch.encadrement_loyer !== true) Object.assign(patch,{loyer_reference:null,loyer_reference_majore:null,complement_loyer:null,complement_justification:null});
    if (Object.hasOwn(patch,"travaux_recents") && !patch.travaux_recents) patch.travaux_recents_montant = null;
    if (Object.hasOwn(patch,"complement_loyer") && !Number(patch.complement_loyer)) patch.complement_justification = null;
    if (patch.servitude_residence_principale !== true) patch.clause_resolutoire_servitude = false;
  }
  const mentions = new FormData();
  for (const [cle,valeur] of Object.entries(patch)) mentions.set(cle,valeur==null?"":String(valeur));
  const verif = lireMentionsContrat(mentions);
  if (verif.erreur) return erreur(verif.erreur);
  return { patch, erreur: undefined };
}

export function indexEtapeBail(hash: string) {
  const directe = /^#etape-bail-(\d+)$/.exec(hash);
  if (directe) return Math.min(6,Math.max(0,Number(directe[1])-1));
  if (/completer-person/.test(hash)) return 1;
  if (/completer-dpe|complements-energie|reglement-copro|documents-bail|inventaire/.test(hash)) return 4;
  if (/completer-(logement|lot|bien|equipements|chambres)/.test(hash)) return 2;
  if (/complements-(paiement|precedent|honoraires)|loyer/.test(hash)) return 3;
  if (/complements|clauses/.test(hash)) return 5;
  if (/signature|bail-signe|edl|suivi-bail|recapitulatif/.test(hash)) return 6;
  if (/corriger|contrat/.test(hash)) return 0;
  return -1;
}
