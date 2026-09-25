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
// appeler avec `process.env` et les lignes du journal technique. La seule
// exception est `chargerSante` (25/09), qui porte LA requête du journal : trois
// pages (/admin, /admin/brief, /admin/sante) la faisaient chacune à leur façon
// (30 jours et 2 000 lignes ici, 200 lignes sans fenêtre là) et n'affichaient
// pas le même nombre de « points bloquants ».

import { TACHES_SUIVIES, type Equipe } from "./missions";

export type Etat = "ok" | "attention" | "manque";

/**
 * Qui détient la valeur à poser (audit 25/09, C5) : chaque ligne rouge dit le
 * nom de la variable ET le prestataire chez qui on la trouve. La variable se
 * pose dans les réglages du projet Vercel ; rien ici n'est un lien inventé.
 */
export type Prestataire = "Stripe" | "Resend" | "Yousign" | "Vercel" | "Supabase";

export type Verification = {
  /** Le nom de la variable, tel qu'il se lit dans Vercel. */
  cle: string;
  /** Ce qu'elle sert, en français. */
  usage: string;
  etat: Etat;
  /** Ce qu'on peut dire sans divulguer la valeur : un domaine, un mode. */
  detail: string | null;
  /** Chez qui la valeur s'obtient. */
  prestataire: Prestataire;
};

const PRESTATAIRE_PAR_CLE: Record<string, Prestataire> = {
  STRIPE_SECRET_KEY: "Stripe",
  STRIPE_WEBHOOK_SECRET: "Stripe",
  STRIPE_PRIX_BIEN: "Stripe",
  STRIPE_PRIX_LOT_AGENCE: "Stripe",
  RESEND_API_KEY: "Resend",
  RESEND_EXPEDITEUR: "Resend",
  YOUTRUST_API_KEY: "Yousign",
  YOUTRUST_WEBHOOK_SECRET: "Yousign",
  CRON_SECRET: "Vercel",
  SUPABASE_SERVICE_ROLE_KEY: "Supabase",
  NEXT_PUBLIC_SITE_URL: "Vercel",
};

const LIBELLES_BILAN: Record<string, string> = {
  dossiers: "dossiers mis à jour",
  envoyees: "envois réussis",
  envoyes: "envois réussis",
  echecs: "actions à reprendre",
  echecs_envoi: "envois à reprendre",
  rappeles: "rappels envoyés",
  examines: "dossiers examinés",
  alignees: "mises à jour",
  resiliees: "abonnements terminés",
  avoirs_portes: "avoirs reportés",
  avoirs_en_echec: "avoirs à reprendre",
  sans_adresse: "adresses manquantes",
  facebook: "publication sur Facebook",
  publiciteActive: "publicité autorisée",
  budgetMensuelCents: "budget mensuel",
  publiees: "publications diffusées",
  preparees: "éléments préparés",
  traitees: "actions réalisées",
  traites: "actions réalisées",
  etudiees: "actualités étudiées",
  sources: "sources consultées",
  rapports_prepares: "comptes rendus préparés",
  ignores: "actions sans suite nécessaire",
};

function valeurBilan(cle: string, valeur: unknown): string | null {
  if (cle === "facebook" || cle === "publiciteActive") {
    return typeof valeur === "boolean" ? (valeur ? "oui" : "non") : null;
  }
  // Un bilan peut contenir une réponse de prestataire ou des identifiants.
  // Même sous une clé connue, aucun texte libre ne doit arriver à l'écran.
  const nombre = Array.isArray(valeur) ? valeur.length
    : typeof valeur === "number" ? valeur
    : typeof valeur === "string" && /^\d+$/.test(valeur) ? Number(valeur) : null;
  if (nombre === null || !Number.isSafeInteger(nombre) || nombre < 0) return null;
  return cle === "budgetMensuelCents"
    ? `${(nombre / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })} par mois`
    : String(nombre);
}

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
  const verifications: Omit<Verification, "prestataire">[] = [];

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

  return verifications.map((v) => ({ ...v, prestataire: PRESTATAIRE_PAR_CLE[v.cle] ?? "Vercel" }));
}

// ── Les tâches planifiées ────────────────────────────────────────────────────

export type Periodicite = "continue" | "quotidienne" | "mensuelle";

export type Tache = {
  nom: string;
  /** Le nom partagé (lib/missions.ts) : le même que sur Équipes et Journaux. */
  libelle: string;
  /** L'équipe qui porte la tâche, pour le point du matin. */
  equipe: Equipe;
  /** Ce que la passe fait, en une ligne. */
  role: string;
  /** L'heure UTC de vercel.json — Vercel ne connaît pas l'heure de Paris. */
  horaire: string;
  periodicite: Periodicite;
  /** Vrai quand « Lancer maintenant » existe (route /api/cron/equipes). */
  commandable: boolean;
};

const ROLES: Record<keyof typeof TACHES_SUIVIES, [role: string, horaire: string]> = {
  orchestrateur: ["Actualise la prochaine étape des locations, incidents, signatures et comptes rendus", "Chaque matin"],
  signatures: ["Reprend chaque document qui n'a pas été classé du premier coup", "Chaque nuit"],
  abonnements: ["Suit les paiements refusés et ajuste la facturation au nombre de biens gérés", "Chaque nuit"],
  rappels: ["Prévient les locataires et les artisans avant une intervention", "Chaque matin"],
  quittances: ["Envoie les quittances lorsque le loyer est entièrement réglé", "Chaque matin"],
  appels: ["Envoie l'avis du prochain loyer aux organisations qui le souhaitent", "Chaque matin"],
  relances: ["Envoie les relances prévues lorsqu'un loyer reste impayé", "Chaque matin"],
  veille: ["Collecte les actualités officielles et prépare leur étude", "Chaque matin"],
  marketing: ["Prépare et diffuse les contenus autorisés", "Chaque matin"],
  territoire: ["Actualise le marché et prépare la prochaine priorité territoriale", "Chaque matin"],
};

/**
 * Les dix tâches de `vercel.json`, dans l'ordre de la journée. Le nom vient de
 * la table partagée (25/09) : Santé disait « Relances d'impayé » là où Équipes
 * disait « Relances de loyers ».
 */
export const TACHES: Tache[] = (
  ["orchestrateur", "signatures", "abonnements", "rappels", "quittances", "appels", "relances", "veille", "marketing", "territoire"] as const
).map((nom) => ({
  nom,
  libelle: TACHES_SUIVIES[nom].nom,
  equipe: TACHES_SUIVIES[nom].equipe,
  role: ROLES[nom][0],
  horaire: ROLES[nom][1],
  periodicite: "quotidienne" as const,
  commandable: nom !== "orchestrateur",
}));

// « non_configuree » (25/09) : la passe a eu lieu mais le service qu'elle
// sert n'est pas relié (Stripe absent, Youtrust en sandbox). Ce n'est pas un
// échec ni une absence d'exécution : la ligne de configuration le dit déjà,
// et elle seule compte dans les points bloquants.
export type EtatTache = "ok" | "echec" | "retard" | "jamais" | "non_configuree";

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
export function resumerBilan(bilan: unknown, tache?: string): string {
  if (!bilan || typeof bilan !== "object" || Array.isArray(bilan)) return "—";
  const entrees = Object.entries(bilan as Record<string, unknown>);
  if (entrees.length === 0) return "—";
  const resume = entrees
    .map(([cle, v]) => {
      if (v === null || v === undefined) return null;
      const libelle = cle === "preparees"
        ? tache === "veille" ? "nouvelles actualités collectées"
          : tache === "territoire" ? "propositions de recrutement préparées"
            : tache === "marketing" ? "publications préparées"
              : LIBELLES_BILAN.preparees
        : Object.hasOwn(LIBELLES_BILAN, cle) ? LIBELLES_BILAN[cle] : null;
      // Une donnée inconnue reste disponible dans le journal interne, mais
      // n'est jamais présentée telle quelle au super administrateur.
      if (!libelle) return null;
      const valeur = valeurBilan(cle, v);
      return valeur === null ? null : `${libelle} : ${valeur}`;
    })
    .filter(Boolean)
    .join(", ");
  const difficulte = (bilan as Record<string, unknown>).erreur
    ? "Action à reprendre : ouvrir le dossier concerné pour connaître la difficulté."
    : null;
  return [resume, difficulte].filter(Boolean).join(" · ") || "Résultat détaillé indisponible";
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
    const enEchec = Boolean(bilan && typeof bilan === "object" && Object.entries(bilan).some(([cle, valeur]) => {
      if (!/(^|_)(erreur|echec)s?$/.test(cle)) return false;
      if (Array.isArray(valeur)) return valeur.length > 0;
      if (typeof valeur === "number") return valeur > 0;
      if (typeof valeur === "string") return valeur.trim() !== "" && valeur !== "0";
      return Boolean(valeur);
    }));
    const age = maintenant.getTime() - new Date(d.le).getTime();
    if (bilan && typeof bilan === "object" && bilan.non_configuree === true && !enEchec) {
      return {
        ...t,
        etat: age > MARGES[t.periodicite] ? "retard" : "non_configuree",
        le: d.le,
        bilan: "service non configuré ou en mode essai : la passe n'a rien traité — voir les connexions ci-dessus",
      };
    }
    const etat: EtatTache = enEchec ? "echec" : age > MARGES[t.periodicite] ? "retard" : "ok";
    return { ...t, etat, le: d.le, bilan: resumerBilan(d.bilan, t.nom) };
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

/**
 * Ce que la page de supervision résume en une ligne : combien de points
 * bloquent. Une tâche « non configurée » ne compte pas : sa connexion
 * manquante est déjà comptée par la configuration.
 */
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

// ── Le chargement partagé ───────────────────────────────────────────────────

/** Fenêtre et volume de lecture du journal, identiques pour toutes les pages. */
export const FENETRE_JOURNAL_HEURES = 30 * 24;
const LIMITE_JOURNAL = 2000;

type LigneJournal = { evenement: string; details: unknown; created_at: string };

/**
 * Le strict nécessaire d'un client Supabase pour lire le journal des tâches :
 * `from`. La chaîne de la requête n'est pas typée ici — le générateur de
 * Supabase est trop profond pour un type structurel — elle l'est en privé.
 */
export type ClientQuiLitLeJournal = { from: (table: string) => unknown };

type ChaineJournal = {
  select: (colonnes: string) => ChaineJournal;
  like: (colonne: string, motif: string) => ChaineJournal;
  gte: (colonne: string, valeur: string) => ChaineJournal;
  order: (colonne: string, options: { ascending: boolean }) => ChaineJournal;
  limit: (n: number) => PromiseLike<{ data: unknown; error: unknown }>;
};

/**
 * L'état de chaque tâche, lu du journal — la même requête pour /admin,
 * /admin/brief et /admin/sante (25/09). `null` quand la lecture a échoué :
 * une console qui affiche zéro parce qu'une requête a échoué est pire que pas
 * de console.
 */
export async function chargerEtatTaches(
  db: ClientQuiLitLeJournal,
  maintenant: Date = new Date()
): Promise<PasseDeTache[] | null> {
  const depuis = new Date(maintenant.getTime() - FENETRE_JOURNAL_HEURES * HEURE).toISOString();
  const { data, error } = await (db.from("tech_log") as ChaineJournal)
    .select("evenement, details, created_at")
    .like("evenement", "tache_%")
    .gte("created_at", depuis)
    .order("created_at", { ascending: false })
    .limit(LIMITE_JOURNAL);
  if (error) return null;
  const dernieres: Record<string, { le: string; bilan: unknown }> = {};
  // Le générateur de requêtes de Supabase rend `data` sans type utile ici :
  // on ne garde que les lignes de la forme attendue.
  const lignes = (Array.isArray(data) ? data : []).filter(
    (l): l is LigneJournal => Boolean(l) && typeof l === "object" && typeof (l as LigneJournal).evenement === "string" && typeof (l as LigneJournal).created_at === "string"
  );
  for (const l of lignes) {
    const nom = l.evenement.slice("tache_".length);
    if (!(nom in dernieres)) dernieres[nom] = { le: l.created_at, bilan: l.details };
  }
  return etatTaches(dernieres, maintenant);
}

export type Sante = {
  configuration: Verification[];
  /** `null` : le journal n'a pas pu être lu. */
  taches: PasseDeTache[] | null;
  faitsEditeurManquants: number;
  /**
   * Le chiffre du bandeau. Quand le journal est illisible, il compte tout de
   * même les connexions manquantes et l'éditeur incomplet : ce sont des faits
   * sûrs. `tachesIllisibles` dit à la page qu'il en manque peut-être.
   */
  bloquants: number;
  tachesIllisibles: boolean;
};

/**
 * La santé complète, en un appel, pour les trois pages qui l'affichent.
 * `faitsEditeurManquants` vient de `faitsManquants().length` (lib/editeur) :
 * il est passé en paramètre pour garder ce fichier sans dépendance d'écran.
 */
export async function chargerSante(
  db: ClientQuiLitLeJournal,
  env: Env,
  faitsEditeurManquants: number,
  maintenant: Date = new Date()
): Promise<Sante> {
  const configuration = etatConfiguration(env);
  const taches = await chargerEtatTaches(db, maintenant);
  return {
    configuration,
    taches,
    faitsEditeurManquants,
    bloquants: pointsBloquants(configuration, taches ?? [], faitsEditeurManquants),
    tachesIllisibles: taches === null,
  };
}
