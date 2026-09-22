// La santé du service, lue d'un seul écran — la logique, sans écran ni réseau.
//
// POURQUOI (préparation du lancement, 20/09). La production tournait avec
// trois tâches sur cinq : celle des abonnements s'arrêtait en 503 avant tout
// journal parce que Stripe n'était pas configuré, et personne ne pouvait le
// voir sans lire la base. Les variables d'environnement, elles, ne se
// vérifient que dans Vercel, une par une. Cet écran dit, au super
// administrateur, ce qui est posé, ce qui tourne et ce qui manque — sans
// jamais montrer une valeur : la présence d'un secret est une information,
// le secret n'en est pas une ici.
//
// Ces fonctions sont pures pour être vérifiables : la page ne fait que les
// appeler avec `process.env` et les lignes du journal technique.

export type Etat = "ok" | "attention" | "manque";

export type Verification = {
  /** Le nom de la variable, tel qu'il se lit dans Vercel. */
  cle: string;
  /** Ce qu'elle sert, en français. */
  usage: string;
  etat: Etat;
  /** Ce qu'on peut dire sans divulguer la valeur : un domaine, un mode. */
  detail: string | null;
};

type Env = Record<string, string | undefined>;

function valeur(env: Env, cle: string): string {
  return env[cle]?.trim() ?? "";
}

/** Le domaine d'une adresse « Nom <boite@domaine> » ou « boite@domaine ». */
export function domaineDeLAdresse(adresse: string): string | null {
  const m = adresse.match(/@([^>\s]+)/);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Chaque variable de production, avec son état. L'ordre est celui de la
 * liste de lancement : ce qui bloque en premier, en premier.
 */
export function etatConfiguration(env: Env): Verification[] {
  const verifications: Verification[] = [];

  // ── Stripe : sans lui, l'essai de 14 jours ferme l'écriture sans issue.
  const cleStripe = valeur(env, "STRIPE_SECRET_KEY");
  verifications.push({
    cle: "STRIPE_SECRET_KEY",
    usage: "Facturation des abonnements",
    etat: !cleStripe ? "manque" : cleStripe.startsWith("sk_live_") ? "ok" : "attention",
    detail: !cleStripe
      ? null
      : cleStripe.startsWith("sk_live_")
        ? "clé réelle"
        : "clé de test : aucun paiement réel ne passera",
  });
  verifications.push({
    cle: "STRIPE_WEBHOOK_SECRET",
    usage: "Réception des événements d'abonnement (statuts, échecs de prélèvement)",
    etat: valeur(env, "STRIPE_WEBHOOK_SECRET") ? "ok" : "manque",
    detail: null,
  });
  verifications.push({
    cle: "STRIPE_PRIX_BIEN",
    usage: "Tarif par bien des propriétaires bailleurs",
    etat: valeur(env, "STRIPE_PRIX_BIEN") ? "ok" : "manque",
    detail: null,
  });
  verifications.push({
    cle: "STRIPE_PRIX_LOT_AGENCE",
    usage: "Tarif par palier de lots des agences",
    etat: valeur(env, "STRIPE_PRIX_LOT_AGENCE") ? "ok" : "manque",
    detail: null,
  });

  // ── E-mails : quittances, avis, relances, rappels.
  verifications.push({
    cle: "RESEND_API_KEY",
    usage: "Envoi des e-mails du service (quittances, avis d'échéance, relances, rappels)",
    etat: valeur(env, "RESEND_API_KEY") ? "ok" : "manque",
    detail: null,
  });
  const expediteur = valeur(env, "RESEND_EXPEDITEUR");
  const domaine = domaineDeLAdresse(expediteur || "no-reply@gerimmo.app");
  verifications.push({
    cle: "RESEND_EXPEDITEUR",
    usage: "Adresse d'expédition",
    etat: !expediteur
      ? "attention"
      : domaine === "resend.dev"
        ? "manque"
        : "ok",
    detail: !expediteur
      ? "repli sur no-reply@gerimmo.app — le domaine doit être vérifié chez Resend"
      : domaine === "resend.dev"
        ? "adresse de test : elle ne livre qu'au titulaire du compte Resend"
        : `domaine ${domaine} — à vérifier chez Resend (SPF, DKIM)`,
  });

  // ── Signature électronique : la sandbox peut être reliée sans autoriser
  // de document réel. Le passage en production reste un choix contractuel.
  const cleYoutrust = valeur(env, "YOUTRUST_API_KEY");
  const environnementYoutrust = valeur(env, "YOUTRUST_ENV") || "sandbox";
  verifications.push({
    cle: "YOUTRUST_API_KEY",
    usage: "Signature électronique des baux et contrats",
    etat: !cleYoutrust ? "manque" : environnementYoutrust === "production" ? "ok" : "attention",
    detail: !cleYoutrust
      ? null
      : environnementYoutrust === "production"
        ? "environnement réel"
        : "sandbox : essais uniquement, aucun document réel ne doit être envoyé",
  });
  verifications.push({
    cle: "YOUTRUST_WEBHOOK_SECRET",
    usage: "Réception sécurisée des signatures terminées",
    etat: valeur(env, "YOUTRUST_WEBHOOK_SECRET") ? "ok" : cleYoutrust ? "attention" : "manque",
    detail: valeur(env, "YOUTRUST_WEBHOOK_SECRET")
      ? null
      : cleYoutrust
        ? "à poser lors de la création du webhook"
        : null,
  });

  // ── Tâches planifiées : sans secret, chaque passe répond 503.
  verifications.push({
    cle: "CRON_SECRET",
    usage: "Authentification des tâches planifiées",
    etat: valeur(env, "CRON_SECRET") ? "ok" : "manque",
    detail: null,
  });
  verifications.push({
    cle: "SUPABASE_SERVICE_ROLE_KEY",
    usage: "Accès serveur des tâches planifiées et des envois automatiques",
    etat: valeur(env, "SUPABASE_SERVICE_ROLE_KEY") ? "ok" : "manque",
    detail: null,
  });

  // ── L'adresse publique : les liens des e-mails et le pied des documents.
  const site = valeur(env, "NEXT_PUBLIC_SITE_URL");
  const repli = valeur(env, "VERCEL_PROJECT_PRODUCTION_URL");
  let etatSite: Etat;
  let detailSite: string | null;
  if (site) {
    const locale = /localhost|127\.0\.0\.1/.test(site);
    const https = site.startsWith("https://");
    etatSite = locale ? "manque" : https ? "ok" : "attention";
    detailSite = locale
      ? "adresse locale : les liens des e-mails ne mèneront nulle part"
      : https
        ? site.replace(/^https:\/\//, "")
        : "sans https : les liens partiront en clair";
  } else if (repli) {
    etatSite = "attention";
    detailSite = `repli sur l'adresse Vercel ${repli} — posez l'adresse définitive`;
  } else {
    etatSite = "manque";
    detailSite = "aucune adresse : les e-mails partiront sans lien";
  }
  verifications.push({
    cle: "NEXT_PUBLIC_SITE_URL",
    usage: "Liens dans les e-mails et pied des documents",
    etat: etatSite,
    detail: detailSite,
  });

  return verifications;
}

// ── Les tâches planifiées ────────────────────────────────────────────────────

export type Periodicite = "continue" | "quotidienne" | "mensuelle";

export type Tache = {
  nom: string;
  libelle: string;
  /** Ce que la passe fait, en une ligne. */
  role: string;
  /** L'heure UTC de vercel.json — Vercel ne connaît pas l'heure de Paris. */
  horaire: string;
  periodicite: Periodicite;
};

/**
 * Les six tâches de `vercel.json`, dans l'ordre de la journée. L'horaire est
 * celui de vercel.json, en UTC : l'écran dit comment le lire à l'heure de
 * Paris, plutôt que d'afficher une heure fausse la moitié de l'année.
 */
export const TACHES: Tache[] = [
  { nom: "signatures", libelle: "Signatures électroniques", role: "Classement du PDF signé et de son dossier de preuve", horaire: "toutes les 10 minutes", periodicite: "continue" },
  { nom: "abonnements", libelle: "Abonnements", role: "Relances de prélèvement échoué et alignement des quantités facturées", horaire: "4 h 00 UTC", periodicite: "quotidienne" },
  { nom: "rappels", libelle: "Rappels de rendez-vous", role: "Rappels d'intervention aux locataires et aux artisans (veille et J-7)", horaire: "6 h 00 UTC", periodicite: "quotidienne" },
  { nom: "quittances", libelle: "Quittances", role: "Envoi des quittances des termes soldés, pour les organisations qui l'ont activé", horaire: "7 h 00 UTC", periodicite: "quotidienne" },
  { nom: "appels", libelle: "Avis d'échéance", role: "Envoi des avis du terme à venir, pour les organisations qui l'ont activé", horaire: "7 h 30 UTC", periodicite: "quotidienne" },
  { nom: "relances", libelle: "Relances d'impayé", role: "Première et seconde relance des loyers en retard, pour les organisations qui l'ont activé", horaire: "7 h 45 UTC", periodicite: "quotidienne" },
  { nom: "territoire", libelle: "Territoire", role: "Expansion mensuelle du territoire couvert", horaire: "le 1ᵉʳ du mois, 5 h 00 UTC", periodicite: "mensuelle" },
];

export type EtatTache = "ok" | "echec" | "retard" | "jamais";

export type PasseDeTache = Tache & {
  etat: EtatTache;
  /** L'instant de la dernière passe consignée, ISO, ou null. */
  le: string | null;
  /** Le bilan de cette passe, en français. */
  bilan: string;
};

const HEURE = 3_600_000;
/** Une quotidienne a 26 h de marge, une mensuelle 32 jours : le retard d'un déploiement ne doit pas alarmer. */
const MARGES: Record<Periodicite, number> = { continue: HEURE, quotidienne: 26 * HEURE, mensuelle: 32 * 24 * HEURE };

/** « 3 envoyées, 0 échec » à partir du bilan brut d'une passe. */
export function resumerBilan(bilan: unknown): string {
  if (!bilan || typeof bilan !== "object") return "—";
  const entrees = Object.entries(bilan as Record<string, unknown>);
  if (entrees.length === 0) return "—";
  return entrees
    .map(([cle, v]) => {
      if (v === null || v === undefined) return null;
      if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") {
        return `${cle.replace(/_/g, " ")} : ${String(v)}`;
      }
      if (Array.isArray(v)) return `${cle.replace(/_/g, " ")} : ${v.length}`;
      return null;
    })
    .filter(Boolean)
    .join(", ") || "—";
}

/**
 * L'état de chaque tâche à partir de sa dernière passe consignée
 * (`dernieresTaches`, lib/tache.ts) et de l'instant présent.
 */
export function etatTaches(
  dernieres: Record<string, { le: string; bilan: unknown }>,
  maintenant: Date
): PasseDeTache[] {
  return TACHES.map((t) => {
    const d = dernieres[t.nom];
    if (!d) return { ...t, etat: "jamais", le: null, bilan: "aucune passe consignée" };
    const bilan = d.bilan as Record<string, unknown> | null;
    const enEchec = Boolean(bilan && typeof bilan === "object" && "erreur" in bilan && bilan.erreur);
    const age = maintenant.getTime() - new Date(d.le).getTime();
    const etat: EtatTache = enEchec ? "echec" : age > MARGES[t.periodicite] ? "retard" : "ok";
    return { ...t, etat, le: d.le, bilan: resumerBilan(d.bilan) };
  });
}

// ── L'adoption des envois automatiques ──────────────────────────────────────

export type OrganisationPourAdoption = {
  status: string;
  quittances_envoi_auto: boolean | null;
  appels_envoi_auto: boolean | null;
  relances_envoi_auto: boolean | null;
};

export type Adoption = {
  /** Organisations vivantes : en essai ou actives. */
  vivantes: number;
  quittances: number;
  appels: number;
  relances: number;
  /** Celles qui n'ont rien activé du tout. */
  toutManuel: number;
};

export function adoptionAutomatique(orgs: OrganisationPourAdoption[]): Adoption {
  const vivantes = orgs.filter((o) => o.status === "essai" || o.status === "active");
  return {
    vivantes: vivantes.length,
    quittances: vivantes.filter((o) => o.quittances_envoi_auto).length,
    appels: vivantes.filter((o) => o.appels_envoi_auto).length,
    relances: vivantes.filter((o) => o.relances_envoi_auto).length,
    toutManuel: vivantes.filter(
      (o) => !o.quittances_envoi_auto && !o.appels_envoi_auto && !o.relances_envoi_auto
    ).length,
  };
}

/** Ce que la page de supervision résume en une ligne : combien de points bloquent. */
export function pointsBloquants(
  configuration: Verification[],
  taches: PasseDeTache[],
  faitsEditeurManquants: number
): number {
  return (
    configuration.filter((v) => v.etat === "manque").length +
    taches.filter((t) => t.etat === "jamais" || t.etat === "echec").length +
    (faitsEditeurManquants > 0 ? 1 : 0)
  );
}
