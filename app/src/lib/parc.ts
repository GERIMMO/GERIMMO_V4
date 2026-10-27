import { RACINE_AGENCE } from "@/lib/racine-espace";
// Référentiel partagé du parc (Sprint 2 — module 0).
// Le bien est l'unité physique, le lot l'unité locative : le bail portera
// toujours sur un lot, jamais sur un bien (RM-0.2.5).

export const TYPES_BIEN: Record<string, string> = {
  appartement: "Appartement",
  maison: "Maison",
  immeuble: "Immeuble",
  local: "Local",
  parking: "Parking",
  terrain: "Terrain",
  autre: "Autre",
};

// Types pour lesquels le DPE est obligatoire (habitation, RM-0.7.4)
const TYPES_HABITATION = ["appartement", "maison", "immeuble"] as const;

// Types qui ne se découpent pas en lots (retour recette S2 : un appartement
// EST déjà l'unité locative ; une place de parking ne se divise pas)
export const TYPES_NON_DECOUPABLES = ["appartement", "parking"] as const;

// « Brouillon » évoque un document inachevé ; le lot, lui, est en cours de
// préparation à la location. Le tableau de bord disait déjà « en préparation » :
// deux mots pour le même état, c'est un mot de trop.
export const ETATS_LOT: Record<string, string> = {
  brouillon: "En préparation",
  disponible: "Disponible",
  loue: "Loué",
  preavis: "Préavis en cours",
  archive: "Archivé",
};

// Classes de badge par état — uniquement des tokens du design system
// Charte v2 (maquette) — puces de statut : pastille mono à fond doux.
export const COULEURS_ETAT_LOT: Record<string, string> = {
  brouillon: "puce puce-prep",
  disponible: "puce puce-encre",
  loue: "puce puce-loue",
  preavis: "puce puce-prep",
  archive: "puce puce-grise",
};

// Le nom seul ne désigne pas un lot : « Lot unique », posé à la création d'un
// bien sans découpage, se répète d'un bien à l'autre (audit #264, DOC-06).
// Comme sur la page Parc, le lot unique prend le nom de son bien ; les autres
// se lisent « bien · lot ».
export function libelleLot(lotNom: string | null | undefined, bienNom: string | null | undefined): string {
  const lot = lotNom?.trim() ?? "";
  const bien = bienNom?.trim() ?? "";
  if (!bien) return lot || "Lot";
  return !lot || lot === "Lot unique" ? bien : `${bien} · ${lot}`;
}

export type NiveauDiagnostic = "bien" | "lot";

// Répartition bien/lot et validités (RM-0.6.x). validite_mois nulle = illimité
// (la saisie peut quand même poser une expiration : plomb positif, amiante avec trace)
export const TYPES_DIAGNOSTIC: Record<
  string,
  { libelle: string; niveau: NiveauDiagnostic; validite_mois: number | null; aide: string }
> = {
  dpe: {
    libelle: "DPE",
    niveau: "lot",
    validite_mois: 120,
    aide: "Obligatoire pour toute habitation (10 ans)",
  },
  electricite: {
    libelle: "Électricité",
    niveau: "lot",
    validite_mois: 72,
    aide: "Obligatoire si l'installation a plus de 15 ans (6 ans)",
  },
  gaz: {
    libelle: "Gaz",
    niveau: "lot",
    validite_mois: 72,
    aide: "Obligatoire si l'installation a plus de 15 ans (6 ans)",
  },
  plomb: {
    libelle: "Plomb (CREP)",
    niveau: "lot",
    validite_mois: null,
    aide: "Construction avant 1949 — illimité si négatif, 6 ans si positif",
  },
  amiante_privatif: {
    libelle: "Amiante (privatif)",
    niveau: "lot",
    validite_mois: null,
    aide: "Permis avant juillet 1997 — illimité sans trace, 3 ans sinon",
  },
  amiante_communes: {
    libelle: "Amiante (parties communes)",
    niveau: "bien",
    validite_mois: null,
    aide: "Permis avant juillet 1997 — illimité sans trace, 3 ans sinon",
  },
  erp: {
    libelle: "ERP — état des risques",
    niveau: "bien",
    validite_mois: 6,
    aide: "Toujours obligatoire (6 mois)",
  },
  termites: {
    libelle: "Termites",
    niveau: "bien",
    validite_mois: 6,
    aide: "Vente en zone déclarée par arrêté préfectoral (6 mois) — hors dossier de location",
  },
};

// Les diagnostics attendus se déduisent du bien (RM-0.6.1) : type et année.
// « attendu » = proposé et suivi ; l'obligation stricte bloquante reste DPE
// (habitation) + ERP, vérifiée en base (lot_blocages_location).
export function diagnosticsAttendus(bien: {
  type: string;
  annee_construction: number | null;
}): string[] {
  const attendus: string[] = [];
  const habitation = (TYPES_HABITATION as readonly string[]).includes(bien.type);
  if (habitation) attendus.push("dpe", "electricite", "gaz");
  attendus.push("erp");
  if (bien.annee_construction !== null) {
    if (habitation && bien.annee_construction < 1949) attendus.push("plomb");
    if (bien.annee_construction < 1997) {
      attendus.push("amiante_privatif", "amiante_communes");
    }
  }
  // Gaz et électricité sont à qualifier selon les installations, indépendamment du bâti.
  // Les termites restent déposables en complément, hors dossier de location.
  return attendus;
}

export type StatutDiagnostic = "valide" | "expire_bientot" | "expire";

export function statutDiagnostic(
  dateExpiration: string | null,
  aujourdhui: Date = new Date()
): StatutDiagnostic {
  if (!dateExpiration) return "valide"; // illimité
  const expiration = new Date(dateExpiration);
  const j = new Date(aujourdhui.toDateString());
  if (expiration < j) return "expire";
  const dans90j = new Date(j);
  dans90j.setDate(dans90j.getDate() + 90);
  return expiration <= dans90j ? "expire_bientot" : "valide";
}

export const COULEURS_STATUT_DIAGNOSTIC: Record<StatutDiagnostic, string> = {
  valide: "text-success-soft-foreground",
  expire_bientot: "text-warning-soft-foreground",
  expire: "text-destructive",
};

export const LIBELLES_STATUT_DIAGNOSTIC: Record<StatutDiagnostic, string> = {
  valide: "Valide",
  expire_bientot: "Expire bientôt",
  expire: "Expiré",
};

export const MODES_CLE: Record<string, string> = {
  surface: "Surface (défaut)",
  tantiemes: "Tantièmes",
  parts_egales: "Parts égales",
};

// Critères de décence (RM-0.5.2) : alertes non bloquantes à la fiche lot
export function alertesDecence(lot: {
  surface_m2: number | null;
}): string[] {
  const alertes: string[] = [];
  if (lot.surface_m2 !== null && Number.isFinite(lot.surface_m2) && lot.surface_m2 > 0 && lot.surface_m2 < 9) {
    alertes.push(
      "Pour une location d’habitation, la pièce principale doit avoir au moins 9 m² avec 2,20 m de hauteur, ou un volume habitable d’au moins 20 m³. Vérifiez également les règles locales."
    );
  }
  return alertes;
}

// Proposition de clé selon le mode (l'écart d'arrondi va au lot de plus grande
// surface — RM-0.4.5) ; la validation stricte (= 100,00) est faite en base.
export function proposerCle(
  mode: "surface" | "tantiemes" | "parts_egales",
  lots: { id: string; surface_m2: number | null; tantieme: number | null }[]
): { lot_id: string; pourcentage: number }[] {
  const valeurs = lots.map((l) => {
    if (mode === "parts_egales") return 1;
    if (mode === "tantiemes") return l.tantieme ?? 0;
    return l.surface_m2 ?? 0;
  });
  const total = valeurs.reduce((s, v) => s + v, 0);
  if (total === 0) {
    // Répartition impossible sur ces données : parts égales en repli
    return proposerCle("parts_egales", lots);
  }
  const parts = valeurs.map((v) => Math.round((v / total) * 10000) / 100);
  const somme = Math.round(parts.reduce((s, p) => s + p, 0) * 100) / 100;
  const ecart = Math.round((100 - somme) * 100) / 100;
  if (ecart !== 0) {
    // L'écart résiduel au lot de plus grande valeur
    const iMax = valeurs.indexOf(Math.max(...valeurs));
    parts[iMax] = Math.round((parts[iMax] + ecart) * 100) / 100;
  }
  return lots.map((l, i) => ({ lot_id: l.id, pourcentage: parts[i] }));
}

export function formaterSurface(m2: number | string | null): string {
  if (m2 === null || m2 === "") return "—";
  return `${Number(m2).toLocaleString("fr-FR")} m²`;
}

// Rend un blocage de mise en location « actionnable » : à partir de son message
// (issu de lot_blocages_location), renvoie où aller pour le lever. Les ancres
// (#detention, #diagnostics, #diagnostics-immeuble, #caracteristiques) ouvrent
// la bonne section de la fiche visée.
export type CibleBlocage = { href: string; libelle: string };

// Pastille d'alerte d'une section « Diagnostics » : ce qui manque, ce qui est
// périmé, ce qui va l'être. Rend `undefined` quand tout est en règle — la
// section reste alors repliée et silencieuse.
export function alerteDiagnostics(
  manquants: string[],
  diagnostics: { date_expiration: string | null }[]
): string | undefined {
  const expires = diagnostics.filter(
    (d) => statutDiagnostic(d.date_expiration) === "expire"
  ).length;
  const bientot = diagnostics.filter(
    (d) => statutDiagnostic(d.date_expiration) === "expire_bientot"
  ).length;
  const parties = [
    manquants.length > 0
      ? `${manquants.length} manquant${manquants.length > 1 ? "s" : ""}`
      : null,
    expires > 0 ? `${expires} périmé${expires > 1 ? "s" : ""}` : null,
    bientot > 0 ? `${bientot} bientôt périmé${bientot > 1 ? "s" : ""}` : null,
  ].filter(Boolean);
  return parties.length > 0 ? parties.join(" · ") : undefined;
}

export function cibleBlocage(
  message: string,
  // `racine` : « /espace » pour le propriétaire direct, « /agence » par défaut (décision D27, lib/racine-espace.ts).
  ctx: { orgId: string; bienId: string; lotId: string; racine?: string },
  // Chemin (sans ancre) de la page qui affiche la liste, quand on le connaît.
  // L'ERP est rattaché au BIEN, mais `deposerDiagnostic` range lui-même le
  // dépôt d'après le référentiel : la fiche LOT sait donc le recevoir aussi
  // (section « Diagnostics de l'immeuble »). Relevé du 11/09 : sans cela, le
  // seul chemin pour lever ce blocage quittait la fiche lot — 2 clics d'aller
  // et retour sur le parcours nominal, sur le lot unique de 90 % du parc.
  // On reste donc sur la fiche où l'on se trouve déjà ; à défaut, la fiche lot,
  // où se règle tout le reste (surface, DPE, mise en location, bail).
  pageCourante?: string
): CibleBlocage {
  const bien = `${ctx.racine ?? RACINE_AGENCE}/${ctx.orgId}/parc/${ctx.bienId}`;
  const lot = `${bien}/lots/${ctx.lotId}`;
  const m = message.toLowerCase();
  if (m.includes("surface")) return { href: `${lot}#caracteristiques`, libelle: "Renseigner la surface" };
  if (m.includes("détention") || m.includes("detention"))
    return { href: `${lot}#detention`, libelle: "Compléter la détention" };
  if (m.includes("erp"))
    return pageCourante === bien
      ? { href: `${bien}#diagnostics`, libelle: "Déposer l'ERP" }
      : { href: `${lot}#diagnostics-immeuble`, libelle: "Déposer l'ERP" };
  // La clé se valide sur la fiche bien : sans ce cas, on retomberait sur les
  // diagnostics du lot, qui n'ont rien à voir avec le blocage.
  if (m.includes("clé de répartition") || m.includes("cle de repartition"))
    return { href: `${bien}#cle`, libelle: "Valider la clé (fiche bien)" };
  if (m.includes("nom du lot"))
    return { href: `${lot}#caracteristiques`, libelle: "Nommer le lot" };
  // DPE et autres diagnostics rattachés au lot (électricité, gaz, plomb, amiante privatif)
  return { href: `${lot}#diagnostics`, libelle: "Mettre à jour les diagnostics" };
}
