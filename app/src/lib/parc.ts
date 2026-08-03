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
export const TYPES_HABITATION = ["appartement", "maison", "immeuble"] as const;

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
// Charte 04 — badges de statut : texte coloré, sans pastille ni fond.
export const COULEURS_ETAT_LOT: Record<string, string> = {
  brouillon: "text-muted-foreground",
  disponible: "text-success-soft-foreground",
  loue: "text-foreground",
  preavis: "text-warning-soft-foreground",
  archive: "text-muted-foreground opacity-70",
};

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
    aide: "Zone déclarée par arrêté préfectoral (6 mois)",
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
  if (habitation) attendus.push("dpe");
  attendus.push("erp");
  if (bien.annee_construction !== null) {
    if (habitation && bien.annee_construction < 1949) attendus.push("plomb");
    if (bien.annee_construction < 1997) {
      attendus.push("amiante_privatif", "amiante_communes");
    }
    // Électricité/gaz : « installation > 15 ans » approximée par l'âge du bâti
    if (habitation && bien.annee_construction <= new Date().getFullYear() - 15) {
      attendus.push("electricite", "gaz");
    }
  }
  attendus.push("termites"); // selon zone — non bloquant, proposé partout
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
  if (lot.surface_m2 !== null && lot.surface_m2 < 9) {
    alertes.push(
      "Surface habitable < 9 m² : sous le seuil de décence (location d'habitation impossible en l'état)"
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
// (#detention, #diagnostics, #caracteristiques) ouvrent la bonne section de la
// fiche lot ; l'ERP se traite sur la fiche bien (diagnostic de parties communes).
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
  ctx: { orgId: string; bienId: string; lotId: string }
): CibleBlocage {
  const bien = `/agence/${ctx.orgId}/parc/${ctx.bienId}`;
  const lot = `${bien}/lots/${ctx.lotId}`;
  const m = message.toLowerCase();
  if (m.includes("surface")) return { href: `${lot}#caracteristiques`, libelle: "Renseigner la surface" };
  if (m.includes("détention") || m.includes("detention"))
    return { href: `${lot}#detention`, libelle: "Compléter la détention" };
  if (m.includes("erp")) return { href: `${bien}#diagnostics`, libelle: "Déposer l'ERP (fiche bien)" };
  // La clé se valide sur la fiche bien : sans ce cas, on retomberait sur les
  // diagnostics du lot, qui n'ont rien à voir avec le blocage.
  if (m.includes("clé de répartition") || m.includes("cle de repartition"))
    return { href: `${bien}#cle`, libelle: "Valider la clé (fiche bien)" };
  if (m.includes("nom du lot"))
    return { href: `${lot}#caracteristiques`, libelle: "Nommer le lot" };
  // DPE et autres diagnostics rattachés au lot (électricité, gaz, plomb, amiante privatif)
  return { href: `${lot}#diagnostics`, libelle: "Mettre à jour les diagnostics" };
}
