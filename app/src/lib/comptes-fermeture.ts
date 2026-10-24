// FERMETURE DES COMPTES ET COMPTES INACTIFS (plan de conformité du 23/10/2026, lot 1E : R14, R15, R51).
//
// Ce module ne fait rien par lui-même : il porte la règle que l'application applique (version des conditions à partir
// de laquelle les comptes inactifs sont supprimés), les calculs sans effet (remboursement au prorata, dates de Paris)
// et le texte des trois courriels. Les gestes (Stripe, envoi, base) sont dans comptes-fermeture-serveur.ts.
//
// Les numéros d'articles des conditions ne sont pas cités : la règle d'inactivité n'existe que dans la version qui
// suivra celle du 30/09/2026 (dite V1), dont la numérotation n'est pas encore publiée. Les courriels renvoient donc aux
// « conditions générales » sans numéro.

import { echapperHtml } from "@/lib/quittance-email";
import { euros } from "@/lib/tarifs";

/**
 * La version des conditions générales à partir de laquelle un compte peut être supprimé pour inactivité : seuls les
 * comptes qui ont accepté cette version (ou une plus récente, tous documents confondus : conditions clients, de l'espace
 * artisan, règles des invités) reçoivent les avertissements, puis sont supprimés.
 *
 * `null` : la règle est INACTIVE (aucun avertissement, aucune suppression). Elle l'est restée jusqu'à la publication de
 * la V1, qui l'annonce (article 9) : posée le 24/10/2026 à la date de version de la V1 (format AAAA-MM-JJ, celui de
 * CONDITIONS_VERSION), dans le même déploiement que sa publication, avec la migration 20261024150000 qui active la
 * règle de conservation `compte:inactif` (sans elle, la base n'avertit ni ne programme rien). Un compte qui n'a accepté
 * que la version du 30/09/2026 n'est jamais visé. À relire par le juriste (source non ouverte le 23/10/2026) : durée de
 * 24 mois (référence CNIL des comptes inactifs) et avertissements à deux mois puis quinze jours.
 */
export const VERSION_MIN_INACTIVITE: string | null = "2026-10-24";

/** Une version de conditions au format attendu (AAAA-MM-JJ), ou null. */
export function versionInactiviteValide(v: string | null): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export type ChoixFermeture = "fin_periode" | "j14_prorata";

/**
 * La métadonnée que la fermeture pose sur la souscription Stripe quand elle l'arrête (finitions du 24/10, relectures
 * transverses I1, I4 et M1) : le webhook n'y voit ni une résiliation notifiée par le client (pas d'accusé de résiliation)
 * ni une résiliation pour impayé (pas de courrier « résilié faute de règlement », facture laissée telle quelle). Retirée
 * (valeur vide) quand la fermeture est annulée.
 */
export const MARQUE_FERMETURE_STRIPE = "gerimmo_fermeture";

/** Pourquoi un remboursement J+14 a été clos sans rien rembourser, ou en remboursant moins (finitions du 24/10, I2 et I3). */
export type MotifRemboursementFermeture = "retractation" | "deja_rembourse" | "souscription_poursuivie";
export type OrigineFermeture = "titulaire" | "super_admin" | "inactivite";

/** Le jour de Paris (AAAA-MM-JJ) d'un instant. */
export function jourParis(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

/** Minuit, heure de Paris, du jour donné (AAAA-MM-JJ), en secondes Unix : l'instant où Stripe arrête la souscription. */
export function minuitParisEnSecondes(jour: string): number {
  const [a, m, j] = jour.split("-").map(Number);
  // Le décalage de Paris ce jour-là (UTC+1 ou UTC+2), lu sur midi pour éviter l'heure du changement.
  const midi = new Date(Date.UTC(a, m - 1, j, 12));
  const heureParis = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23" }).format(midi));
  const decalageHeures = heureParis - 12;
  return Math.floor(Date.UTC(a, m - 1, j, 0) / 1000) - decalageHeures * 3600;
}

/** Le jour de Paris, n jours après celui de l'instant donné. */
export function jourParisPlus(instant: Date, jours: number): string {
  const [a, m, j] = jourParis(instant).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, j + jours)).toISOString().slice(0, 10);
}

/**
 * La part non utilisée d'une période payée, en centimes, arrondie au centime le plus proche : du jour de la fin
 * (annulation chez Stripe) à la fin de la période, rapportée à toute la période. Jamais négative, jamais plus que payé.
 */
export function remboursementProrata(params: { payeCents: number; debut: Date; fin: Date; arret: Date }): number {
  const total = params.fin.getTime() - params.debut.getTime();
  const reste = params.fin.getTime() - params.arret.getTime();
  if (!Number.isFinite(total) || total <= 0 || reste <= 0 || !Number.isSafeInteger(params.payeCents) || params.payeCents <= 0) return 0;
  return Math.min(params.payeCents, Math.round((params.payeCents * Math.min(reste, total)) / total));
}

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** Le jour d'un mois, « 1er » le premier (usage français). */
function quantieme(j: number): string {
  return j === 1 ? "1er" : String(j);
}

/** « 15 décembre 2026 », « 1er décembre 2026 » pour un jour AAAA-MM-JJ (ou un instant ISO). */
export function jourEnLettres(valeur: string): string {
  const jour = /^\d{4}-\d{2}-\d{2}$/.test(valeur) ? valeur : jourParis(new Date(valeur));
  const [a, m, j] = jour.split("-").map(Number);
  return `${quantieme(j)} ${MOIS[m - 1]} ${a}`;
}

/**
 * La nuit où l'effacement s'exécute (pg_cron à 3 h 20 UTC le jour de la date d'effet), dite sans ambiguïté :
 * « nuit du 15 au 16 décembre 2026 », « nuit du 30 novembre au 1er décembre 2026 »,
 * « nuit du 31 décembre 2026 au 1er janvier 2027 ».
 */
export function nuitDu(jour: string): string {
  const [a, m, j] = jour.split("-").map(Number);
  const veille = new Date(Date.UTC(a, m - 1, j - 1));
  const va = veille.getUTCFullYear(), vm = veille.getUTCMonth() + 1, vj = veille.getUTCDate();
  if (va !== a) return `nuit du ${quantieme(vj)} ${MOIS[vm - 1]} ${va} au ${quantieme(j)} ${MOIS[m - 1]} ${a}`;
  if (vm !== m) return `nuit du ${quantieme(vj)} ${MOIS[vm - 1]} au ${quantieme(j)} ${MOIS[m - 1]} ${a}`;
  return `nuit du ${quantieme(vj)} au ${quantieme(j)} ${MOIS[m - 1]} ${a}`;
}

/** « 1 bail », « 3 baux », « aucun document ». */
function compte(n: number, singulier: string, pluriel: string, aucun = `aucun ${singulier}`): string {
  return n <= 0 ? aucun : `${n} ${n > 1 ? pluriel : singulier}`;
}

/** Une ligne du bilan sans effacement pour un espace effacé (/admin/donnees), pluriels accordés. */
export function resumeEspaceEfface(o: {
  nom: string | null; biens: number; lots: number; baux: number; personnes: number; documents: number; fichiers: number;
  membres_invites: number; demandes_zoho: number;
}): string {
  const elements = [
    compte(o.biens, "bien", "biens"),
    compte(o.lots, "lot", "lots"),
    compte(o.baux, "bail", "baux"),
    compte(o.personnes, "personne", "personnes", "aucune personne"),
    compte(o.documents, "document", "documents"),
    compte(o.fichiers, "fichier", "fichiers"),
  ];
  if (o.membres_invites > 0) elements.push(`${o.membres_invites} ${o.membres_invites > 1 ? "accès d’invités retirés" : "accès d’invité retiré"}`);
  if (o.demandes_zoho > 0) elements.push(`${o.demandes_zoho} ${o.demandes_zoho > 1 ? "demandes Zoho à supprimer" : "demande Zoho à supprimer"} chez le prestataire`);
  return `Espace « ${o.nom ?? "sans nom"} » effacé : ${elements.join(", ")}.`;
}

function cadre(paragraphes: string[]): string {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;color:#1f2937;max-width:560px">${paragraphes
    .map((p) => `<p>${p}</p>`)
    .join("")}<p style="color:#6b7280;font-size:13px">Gerimmo</p></div>`;
}

// ── Avertissements d'inactivité (J-60, J-15) ─────────────────────────────────────────────────────────────────────────

export type AvertissementInactivite = {
  etape: "j60" | "j15";
  nature: "organisation" | "personnel" | "artisan";
  organisation: string | null;
  /** Titulaire de l'espace (l'archive complète lui est réservée) ; un agent la demande au titulaire. */
  titulaire?: boolean;
  derniereActivite: string; // instant ISO
  suppressionLe: string; // AAAA-MM-JJ
  /** Vers la page où télécharger l'archive complète ; null si l'adresse du site n'est pas configurée. */
  lienArchive: string | null;
  /** Vers l'export de l'activité d'un artisan (registres privés et données de plateforme). */
  lienExportArtisan?: string | null;
};

export function sujetAvertissementInactivite(a: Pick<AvertissementInactivite, "etape" | "suppressionLe">): string {
  const date = jourEnLettres(a.suppressionLe);
  return a.etape === "j15"
    ? `Dernier rappel : votre compte Gerimmo sera supprimé le ${date}`
    : `Votre compte Gerimmo sera supprimé le ${date}`;
}

/**
 * Relectures du 24/10 : le document cité est celui que le compte a accepté — « conditions générales » pour le client
 * d'un espace, « conditions que vous avez acceptées » pour un locataire (règles des invités) ou un artisan (conditions de
 * l'espace artisan) ; un artisan est renvoyé vers l'export de son activité ; un agent, vers le titulaire de l'espace.
 */
export function corpsAvertissementInactivite(a: AvertissementInactivite): string {
  const depuis = jourEnLettres(a.derniereActivite);
  const le = jourEnLettres(a.suppressionLe);
  const lienVers = (url: string | null | undefined, repli: string) => (url ? `<a href="${echapperHtml(url)}">${echapperHtml(url)}</a>` : repli);
  let paragraphes: string[];
  if (a.nature === "organisation") {
    paragraphes = [
      `Personne ne s'est connecté à votre espace Gerimmo ${echapperHtml(a.organisation ?? "")} depuis le ${depuis} et aucun abonnement n'y est en cours. Conformément aux conditions générales, le compte et ses données de gestion seront supprimés le ${le}.`,
      "Pour les garder, il suffit de vous connecter avant cette date.",
      a.titulaire === false
        ? "Pour récupérer les données de l'espace avant la suppression, demandez à son titulaire de télécharger l'archive complète depuis son compte."
        : `Pour récupérer vos données avant la suppression, connectez-vous et téléchargez l'archive complète depuis ${lienVers(a.lienArchive, "la page « Mes données personnelles » de votre compte")}.`,
    ];
  } else if (a.nature === "artisan") {
    paragraphes = [
      `Votre compte Gerimmo n'a pas servi depuis le ${depuis}. Conformément aux conditions que vous avez acceptées, ce compte, votre fiche d'artisan et vos registres privés seront supprimés le ${le}.`,
      "Pour les garder, il suffit de vous connecter avant cette date.",
      `Pour récupérer vos registres avant la suppression, connectez-vous et téléchargez l'export de votre activité depuis ${lienVers(a.lienExportArtisan, "la page « Mes clients » de votre espace artisan")}.`,
      "Les devis, interventions et factures déposés dans le dossier d'un propriétaire restent chez lui, responsable de son dossier.",
    ];
  } else {
    paragraphes = [
      `Votre compte Gerimmo n'a pas servi depuis le ${depuis}. Conformément aux conditions que vous avez acceptées, ce compte et les données qui y sont attachées seront supprimés le ${le}.`,
      "Pour le garder, il suffit de vous connecter avant cette date.",
      "Les documents d'une location ou d'une intervention restent chez le propriétaire ou le gestionnaire concerné, responsable de son dossier.",
    ];
  }
  if (a.etape === "j60") paragraphes.push("Vous recevrez un dernier rappel quinze jours avant.");
  return cadre(paragraphes);
}

// ── « Votre compte Gerimmo est fermé » ───────────────────────────────────────────────────────────────────────────────

export type BilanFermeture = {
  mode?: "suppression" | "neutralisation";
  organisations_effacees?: string[];
  organisations_noms?: (string | null)[];
  adhesions_retirees?: number;
  dossiers_tiers_detaches?: number;
  artisan?: { id: string; fiche: "supprimee" | "detachee" | null } | null;
  demandes_zoho?: string[];
  /** Déclarations de rétractation des espaces effacés, gardées détachées (preuve de dix ans ; consigne A du 24/10). */
  retractations_conservees?: number;
};

export type FermetureExecutee = {
  origine: OrigineFermeture;
  executeeLe: string; // instant ISO
  demandeeLe: string; // AAAA-MM-JJ
  derniereActivite: string | null;
  bilan: BilanFermeture;
  archives: { preuve_conservee_jusqu_au: string; factures_conservees_jusqu_au: string | null }[];
  /** Remboursement fait (montant confirmé par Stripe). */
  remboursementCents: number | null;
  /** Remboursement dû mais pas encore confirmé au moment du courriel (annoncé comme en cours). */
  remboursementEnCoursCents?: number | null;
  /** Remboursement J+14 clos sans rien rembourser (rétractation, paiement déjà remboursé, souscription poursuivie). */
  remboursementMotif?: MotifRemboursementFermeture | null;
};

export const SUJET_COMPTE_FERME = "Votre compte Gerimmo est fermé";

/** Ce qui a été effacé, en phrases courtes (une par élément), d'après le bilan de l'exécution. */
export function elementsEffaces(b: BilanFermeture): string[] {
  const liste = ["votre compte de connexion"];
  const noms = (b.organisations_noms ?? []).filter((n): n is string => typeof n === "string" && n.trim() !== "");
  if ((b.organisations_effacees ?? []).length > 0) {
    liste.push(
      noms.length > 0
        ? `votre espace ${noms.map((n) => `« ${n} »`).join(", ")}, avec ses dossiers, ses documents et ses fichiers`
        : "votre espace, avec ses dossiers, ses documents et ses fichiers"
    );
  }
  // Relecture du 24/10 : titulaire d'un espace qui garde d'autres gestionnaires, ou invité ; « vos accès » une fois.
  if ((b.adhesions_retirees ?? 0) > 0) liste.push("vos accès aux autres espaces, qui restent à leurs autres gestionnaires ou à leur propriétaire");
  if (b.artisan?.fiche === "supprimee") liste.push("votre fiche d'artisan, vos zones, vos métiers et vos registres privés");
  if (b.artisan?.fiche === "detachee") liste.push("vos zones, vos métiers et vos registres privés d'artisan");
  return liste;
}

/**
 * Ce qui est conservé, avec sa date de fin (relecture du 24/10 : chaque élément a un terme, fidèle au code). La trace
 * de la fermeture (ligne de fermeture, journal « compte_ferme ») part trois ans après ; le client Stripe est supprimé au
 * terme des factures (clients_stripe_au_terme, mission « purge »).
 */
export function elementsConserves(f: Pick<FermetureExecutee, "archives" | "bilan"> & { origine?: OrigineFermeture }): string[] {
  const liste: string[] = [];
  for (const a of f.archives) {
    liste.push(
      `la preuve de votre contrat (versions des conditions acceptées et dates d'acceptation, dates d'abonnement, identifiant de facturation et adresse électronique), jusqu'au ${jourEnLettres(a.preuve_conservee_jusqu_au)}`
    );
    if (a.factures_conservees_jusqu_au) {
      liste.push(
        `les références de vos factures d'abonnement, jusqu'au ${jourEnLettres(a.factures_conservees_jusqu_au)} ; les factures elles-mêmes restent dans notre compte chez notre prestataire de paiement jusqu'à la même date`
      );
    }
  }
  // Consigne A du 24/10 : la déclaration de rétractation reste, détachée de l'espace effacé (contrat:retractation).
  if ((f.bilan.retractations_conservees ?? 0) > 0) {
    liste.push("votre déclaration de rétractation, la date de sa réception et la trace de son remboursement, pendant dix ans après la déclaration");
  }
  const inactivite = f.origine === "inactivite";
  liste.push(inactivite
    ? "la trace de la fermeture de votre compte et des avertissements envoyés, pendant trois ans"
    : "la trace de votre demande et de son traitement, pendant trois ans");
  liste.push("les journaux de sécurité, jusqu'au terme de leur durée de conservation indiquée dans notre page confidentialité");
  if (f.bilan.mode === "neutralisation") {
    liste.push(inactivite
      ? "l'identifiant technique de votre compte, sans adresse électronique ni mot de passe, tant que ces journaux y font référence"
      : "l'identifiant technique de votre compte, sans adresse électronique ni mot de passe, tant que ces journaux ou votre demande y font référence");
  }
  return liste;
}

export function corpsCompteFerme(f: FermetureExecutee, lienConfidentialite: string | null): string {
  const le = jourEnLettres(f.executeeLe);
  const cause =
    f.origine === "inactivite"
      ? `faute de connexion depuis le ${jourEnLettres(f.derniereActivite ?? f.executeeLe)}, après les deux avertissements envoyés à cette adresse`
      : `à votre demande du ${jourEnLettres(f.demandeeLe)}`;
  const paragraphes = [
    `Votre compte Gerimmo a été fermé le ${le}, ${cause}.`,
    `Nous avons effacé : ${elementsEffaces(f.bilan).map(echapperHtml).join(" ; ")}.`,
  ];
  if ((f.bilan.dossiers_tiers_detaches ?? 0) > 0) {
    paragraphes.push(
      f.origine === "inactivite"
        ? "Les dossiers tenus par vos propriétaires ou gestionnaires restent sous leur responsabilité : votre compte n'y est plus relié, et nous les avons prévenus de la fermeture de votre compte."
        : "Les dossiers tenus par vos propriétaires ou gestionnaires restent sous leur responsabilité : votre compte n'y est plus relié, et nous les avons prévenus de votre demande."
    );
  }
  if (f.bilan.artisan?.fiche === "detachee") {
    paragraphes.push(
      "Votre fiche professionnelle, citée dans des devis ou des factures de propriétaires, reste dans leurs dossiers : elle est détachée de votre compte et retirée du réseau."
    );
  }
  if ((f.bilan.demandes_zoho ?? []).length > 0) {
    paragraphes.push("Nous demandons à notre prestataire de signature électronique de supprimer les copies des documents signés qu'il conserve.");
  }
  if (f.remboursementMotif === "retractation") {
    // Finitions du 24/10 (relecture transverse, I3) : la rétractation a déjà remboursé la période en entier.
    paragraphes.push(
      "Votre période payée vous a été remboursée en entier au titre de votre rétractation : aucun autre remboursement n'est dû pour la fermeture."
    );
  } else if (f.remboursementMotif === "deja_rembourse" && !(f.remboursementCents && f.remboursementCents > 0)) {
    paragraphes.push("Le paiement de votre période avait déjà été remboursé en entier : aucun autre remboursement n'est dû pour la fermeture.");
  } else if (f.remboursementMotif === "souscription_poursuivie") {
    paragraphes.push(
      "Votre abonnement s'est poursuivi au-delà de la date d'arrêt prévue, jusqu'au terme de la période payée : la part non utilisée annoncée n'est donc pas due."
    );
  } else if (f.remboursementCents && f.remboursementCents > 0) {
    paragraphes.push(
      `Nous vous avons remboursé ${euros(f.remboursementCents)}, pour la part non utilisée de votre période payée, sur le moyen de paiement utilisé.`
    );
  } else if (f.remboursementEnCoursCents && f.remboursementEnCoursCents > 0) {
    paragraphes.push(
      `Le remboursement de ${euros(f.remboursementEnCoursCents)}, pour la part non utilisée de votre période payée, est en cours sur le moyen de paiement utilisé.`
    );
  }
  paragraphes.push(`Nous conservons seulement, avec un accès restreint : ${elementsConserves(f).map(echapperHtml).join(" ; ")}.`);
  paragraphes.push(
    "Nos copies de sauvegarde chiffrées disparaissent sous 90 jours ; en cas de restauration, la fermeture est appliquée de nouveau."
  );
  if (lienConfidentialite) {
    paragraphes.push(`Détails : <a href="${echapperHtml(lienConfidentialite)}">${echapperHtml(lienConfidentialite)}</a>`);
  }
  return cadre(paragraphes);
}
