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

import { MISSIONS, TACHES_SUIVIES, estMission, type Equipe } from "./missions";

export type Etat = "ok" | "attention" | "manque";

/**
 * Qui détient la valeur à poser (audit 25/09, C5) : chaque ligne rouge dit le
 * nom de la variable ET le prestataire chez qui on la trouve. La variable se
 * pose dans les réglages du projet Vercel ; rien ici n'est un lien inventé.
 */
export type Prestataire = "Stripe" | "Resend" | "Yousign" | "Vercel" | "Supabase" | "OpenAI";

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
  /**
   * La commande de la ligne quand ce n'est pas une variable à poser (25/09 :
   * le crédit du compte IA se recharge, il ne se configure pas).
   */
  commande?: string;
  /**
   * Faux pour une ligne qui n'est pas une connexion à poser (le crédit du
   * compte IA) : elle ne compte pas dans « Connexions indispensables ».
   */
  estConnexion?: boolean;
  /** Vrai quand la variable n'est pas posée et qu'une valeur de repli s'applique. */
  absente?: boolean;
};

const PRESTATAIRE_PAR_CLE: Record<string, Prestataire> = {
  OPENAI_API_KEY: "OpenAI",
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
  octets: "octets de base",
  fichiers: "fichiers copiés",
  prefixe: "dossier",
  etape: "arrêt à l’étape",
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
  bloques: "fichiers en attente depuis plus de 48 h",
  en_attente: "fichiers encore en file",
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
    absente: !expediteur,
    detail: !expediteur
      ? "repli sur no-reply@gerimmo.app — le domaine doit être vérifié chez Resend"
      : domaine === "resend.dev"
        ? "adresse de test : elle ne livre qu'au titulaire du compte Resend"
        : `domaine ${domaine} — à vérifier chez Resend (SPF, DKIM)`,
  });

  // ── Signature électronique : DÉSACTIVÉE pour le lancement (décision du
  // porteur, 27/09). Hors `YOUTRUST_ENV=production`, aucun document ne part
  // chez Yousign : « Envoyer pour signature » suit le circuit manuel (le
  // signataire télécharge, signe, dépose le signé). Ce n'est pas une panne :
  // la ligne le dit, sans alerte. L'activer reste un choix contractuel.
  const cleYoutrust = valeur(env, "YOUTRUST_API_KEY");
  const youtrustActive = valeur(env, "YOUTRUST_ENV") === "production" && Boolean(cleYoutrust);
  verifications.push({
    cle: "YOUTRUST_API_KEY",
    usage: "Signature électronique des baux et contrats",
    etat: "ok",
    detail: youtrustActive
      ? "environnement réel"
      : "désactivée pour le lancement : signature manuelle (le signataire dépose le PDF signé), aucun document transmis à Yousign",
  });
  if (youtrustActive) {
    verifications.push({
      cle: "YOUTRUST_WEBHOOK_SECRET",
      usage: "Réception sécurisée des signatures terminées",
      etat: valeur(env, "YOUTRUST_WEBHOOK_SECRET") ? "ok" : "attention",
      detail: valeur(env, "YOUTRUST_WEBHOOK_SECRET") ? null : "à poser lors de la création du webhook",
    });
  }

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
  // L'assistant IA (veille, publications, aide à la décision du matin) : la
  // clé manquait à cette liste alors que trois tâches en dépendent (25/09).
  verifications.push({
    cle: "OPENAI_API_KEY",
    usage: "Assistant IA : veille réglementaire, publications, aide à la décision",
    etat: valeur(env, "OPENAI_API_KEY") || valeur(env, "OPEN_AI_KEY") ? "ok" : "manque",
    detail: null,
  });
  verifications.push({
    cle: "NEXT_PUBLIC_SITE_URL",
    usage: "Liens dans les e-mails et pied des documents",
    etat: etatSite,
    detail: detailSite,
  });

  return verifications.map((v) => ({ ...v, prestataire: PRESTATAIRE_PAR_CLE[v.cle] ?? "Vercel" }));
}

// ── Les tâches planifiées ────────────────────────────────────────────────────

export type Periodicite = "continue" | "quotidienne" | "hebdomadaire" | "mensuelle";

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
  abonnements: ["Suit les paiements refusés et les contrats antérieurs ; les changements de la nouvelle grille demandent confirmation", "Chaque nuit"],
  rappels: ["Prévient les locataires et les artisans avant une intervention", "Chaque matin"],
  quittances: ["Envoie les quittances lorsque le loyer est entièrement réglé", "Chaque matin"],
  appels: ["Envoie l'avis du prochain loyer aux organisations qui le souhaitent", "Chaque matin"],
  relances: ["Envoie les relances prévues lorsqu'un loyer reste impayé", "Chaque matin"],
  veille: ["Collecte les actualités officielles et prépare leur étude", "Chaque matin"],
  marketing: ["Prépare et diffuse les contenus autorisés", "Chaque matin"],
  territoire: ["Actualise le marché et prépare la prochaine priorité territoriale", "Chaque matin"],
  purge: ["Supprime du stockage les fichiers dont la durée de conservation est échue", "Chaque nuit"],
  sauvegarde: ["Copie chiffrée de la base et des fichiers chez Scaleway, relue après dépôt (chantier GitHub)", "Chaque nuit"],
};

/**
 * Les tâches de `vercel.json` (et la sauvegarde GitHub), dans l’ordre de la journée. Le nom vient de
 * la table partagée (25/09) : Santé disait « Relances d'impayé » là où Équipes
 * disait « Relances de loyers ».
 */
export const TACHES: Tache[] = (
  ["orchestrateur", "signatures", "purge", "abonnements", "rappels", "quittances", "appels", "relances", "veille", "marketing", "territoire", "sauvegarde"] as const
).map((nom) => ({
  nom,
  libelle: TACHES_SUIVIES[nom].nom,
  equipe: TACHES_SUIVIES[nom].equipe,
  role: ROLES[nom][0],
  horaire: ROLES[nom][1],
  // La sauvegarde ne tourne pas sur Vercel : relançable depuis GitHub seulement.
  // Quotidienne depuis le 27/09 (RPO 24 h, Plan de reprise d'activité).
  periodicite: "quotidienne" as const,
  commandable: nom !== "orchestrateur" && nom !== "sauvegarde",
}));

// « non_configuree » (25/09) : la passe a eu lieu mais le service qu'elle
// sert n'est pas relié (Stripe absent, Youtrust en sandbox). Ce n'est pas un
// échec ni une absence d'exécution : la ligne de configuration le dit déjà,
// et elle seule compte dans les points bloquants.
// « pause » (audit console 27/09) : la mission est mise en pause dans « Travail
// des équipes » ; son absence de passage n'est pas une alerte.
export type EtatTache = "ok" | "echec" | "retard" | "jamais" | "non_configuree" | "pause";

export type PasseDeTache = Tache & {
  etat: EtatTache;
  /** L'instant de la dernière passe consignée, ISO, ou null. */
  le: string | null;
  /** Le bilan de cette passe, en français. */
  bilan: string;
};

const HEURE = 3_600_000;
/** Une quotidienne a 26 h de marge, une mensuelle 32 jours : le retard d'un déploiement ne doit pas alarmer. */
const MARGES: Record<Periodicite, number> = { continue: HEURE, quotidienne: 26 * HEURE, hebdomadaire: 8 * 24 * HEURE, mensuelle: 32 * 24 * HEURE };

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
export type DernierPassage = {
  le: string;
  bilan: unknown;
  /** L'état du passage (`agent_passages`) quand la tâche est une mission. */
  etatPassage?: string;
  /** Le passage « en cours » a dépassé son délai : il est à vérifier. */
  expire?: boolean;
  /** Le texte du bilan déjà calculé (`bilanLisible`), pour ne pas le refaire. */
  texte?: string;
};

export function etatTaches(
  dernieres: Record<string, DernierPassage>,
  maintenant: Date,
  enPause: ReadonlySet<string> = new Set()
): PasseDeTache[] {
  return TACHES.map((t) => {
    const d = dernieres[t.nom];
    if (enPause.has(t.nom)) {
      return { ...t, etat: "pause", le: d?.le ?? null, bilan: d ? d.texte ?? resumerBilan(d.bilan, t.nom) : "aucun passage enregistré" };
    }
    if (!d) return { ...t, etat: "jamais", le: null, bilan: "aucun passage enregistré" };
    // Un passage interrompu, à reprendre ou resté « en cours » au-delà de son
    // délai est un échec, quel que soit son bilan.
    if (d.etatPassage === "a_reprendre" || d.etatPassage === "interrompu" || d.expire) {
      return { ...t, etat: "echec", le: d.le, bilan: `${d.expire ? "passage resté en cours, à vérifier" : d.etatPassage === "interrompu" ? "passage interrompu" : "passage à vérifier"} — ${d.texte ?? resumerBilan(d.bilan, t.nom)}` };
    }
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
    return { ...t, etat, le: d.le, bilan: d.texte ?? resumerBilan(d.bilan, t.nom) };
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
 * manquante est déjà comptée par la configuration. Une mission en pause ne
 * compte pas : c'est une décision du superviseur, pas une panne.
 *
 * Audit console 27/09 : une tâche quotidienne EN RETARD compte (elle a tourné
 * une fois puis s'est arrêtée : c'est exactement ce qu'on veut voir le matin),
 * et une variable manquante ne compte qu'une fois même si deux lignes la
 * citent (clé OpenAI absente et crédit IA invérifiable).
 */
export function pointsBloquants(
  configuration: Verification[],
  taches: PasseDeTache[],
  faitsEditeurManquants: number
): number {
  return (
    new Set(configuration.filter((v) => v.etat === "manque").map((v) => v.cle)).size +
    taches.filter((t) => t.etat === "jamais" || t.etat === "echec" || t.etat === "retard").length +
    (faitsEditeurManquants > 0 ? 1 : 0)
  );
}

// ── Le chargement partagé ───────────────────────────────────────────────────

/** Fenêtre et volume de lecture du journal, identiques pour toutes les pages. */
export const FENETRE_JOURNAL_HEURES = 30 * 24;
const LIMITE_JOURNAL = 2000;
const LIMITE_PASSAGES = 600;

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
  in: (colonne: string, valeurs: readonly string[]) => ChaineJournal;
  is: (colonne: string, valeur: null) => ChaineJournal;
  gte: (colonne: string, valeur: string) => ChaineJournal;
  order: (colonne: string, options: { ascending: boolean }) => ChaineJournal;
  limit: (n: number) => PromiseLike<{ data: unknown; error: unknown }>;
};

// ── Une seule source pour le travail automatique (audit console 27/09) ─────
// Santé lisait `tech_log tache_*`, « Travail des équipes » lisait
// `agent_passages` : « aucune exécution » d'un côté, un passage le 25/09 de
// l'autre, pour la même mission. Désormais une MISSION se lit dans
// `agent_passages` (la table que `/api/cron/equipes` écrit à chaque passage,
// avec son bilan), une tâche hors mission (suivi des dossiers, sauvegarde)
// dans `tech_log`. Un seul seuil (MARGES), une seule fonction de bilan
// (`bilanLisible`), et la pause lue dans `agent_missions`.

export type PassageDeMission = { mission: string; debut: string; fin: string | null; expiration?: string | null; etat: string; compte: number | null; bilan: unknown };

/** Le bilan d'un passage : celui qu'il a gardé, sinon la ligne de journal de sa tâche pendant le passage. */
export function bilanDuPassage(p: { mission: string; debut: string; fin: string | null; bilan: unknown }, journaux: LigneJournal[]): unknown {
  if (p.bilan && typeof p.bilan === "object") return p.bilan;
  const debut = new Date(p.debut).getTime(), fin = p.fin ? new Date(p.fin).getTime() : debut + HEURE;
  const ligne = journaux.find((l) => l.evenement === `tache_${p.mission}` && new Date(l.created_at).getTime() >= debut - 1000 && new Date(l.created_at).getTime() <= fin + 60_000);
  return ligne?.details ?? null;
}

/** LE texte du bilan d'un passage, le même sur Santé, Équipes et le point du matin. */
export function bilanLisible(p: PassageDeMission, journaux: LigneJournal[] = []): string {
  if (p.etat === "en_cours") return "Le résultat sera enregistré à la fin du passage.";
  const texte = resumerBilan(bilanDuPassage(p, journaux), p.mission);
  return texte !== "—" ? texte : `${p.compte ?? 0} résultat(s) comptabilisé(s), sans détail conservé`;
}

/** Le dernier passage de chaque mission (lignes du plus récent au plus ancien). */
export function derniersPassages(passages: PassageDeMission[], journaux: LigneJournal[], maintenant: Date): Record<string, DernierPassage> {
  const r: Record<string, DernierPassage> = {};
  for (const p of passages) {
    if (p.mission in r) continue;
    const expire = p.etat === "en_cours" && Boolean(p.expiration) && new Date(p.expiration!).getTime() < maintenant.getTime();
    r[p.mission] = { le: p.fin ?? p.debut, bilan: bilanDuPassage(p, journaux), etatPassage: p.etat, expire, texte: bilanLisible(p, journaux) };
  }
  return r;
}

/**
 * L'état de chaque tâche — la même lecture pour /admin, /admin/brief,
 * /admin/sante et /admin/equipes. `null` quand une lecture a échoué : une
 * console qui affiche zéro parce qu'une requête a échoué est pire que pas
 * de console.
 */
export async function chargerEtatTaches(
  db: ClientQuiLitLeJournal,
  maintenant: Date = new Date()
): Promise<PasseDeTache[] | null> {
  const depuis = new Date(maintenant.getTime() - FENETRE_JOURNAL_HEURES * HEURE).toISOString();
  const [journal, passages, regles] = await Promise.all([
    (db.from("tech_log") as ChaineJournal)
      .select("evenement, details, created_at")
      .like("evenement", "tache_%")
      // 27/09 (audit sécurité) : une passe n'est crue que si le service l'a
      // écrite — une ligne portant un auteur connecté n'est pas un bilan.
      .is("account_id", null)
      .gte("created_at", depuis)
      .order("created_at", { ascending: false })
      .limit(LIMITE_JOURNAL),
    // Les passages n'ont pas de fenêtre : une mission muette depuis plus de
    // trente jours garde son dernier passage (audit console 27/09).
    (db.from("agent_passages") as ChaineJournal)
      .select("mission, debut, fin, expiration, etat, compte, bilan")
      .order("debut", { ascending: false })
      .limit(LIMITE_PASSAGES),
    (db.from("agent_missions") as ChaineJournal).select("cle, active") as unknown as PromiseLike<{ data: unknown; error: unknown }>,
  ]);
  if (journal.error || passages.error || regles.error) return null;
  // Le générateur de requêtes de Supabase rend `data` sans type utile ici :
  // on ne garde que les lignes de la forme attendue.
  const lignes = (Array.isArray(journal.data) ? journal.data : []).filter(
    (l): l is LigneJournal => Boolean(l) && typeof l === "object" && typeof (l as LigneJournal).evenement === "string" && typeof (l as LigneJournal).created_at === "string"
  );
  const dernieres: Record<string, DernierPassage> = {};
  for (const l of lignes) {
    const nom = l.evenement.slice("tache_".length);
    // Une mission se lit dans ses passages, jamais dans le journal.
    if (estMission(nom)) continue;
    if (!(nom in dernieres)) dernieres[nom] = { le: l.created_at, bilan: l.details };
  }
  const listePassages = (Array.isArray(passages.data) ? passages.data : []).filter(
    (p): p is PassageDeMission => Boolean(p) && typeof p === "object" && typeof (p as PassageDeMission).mission === "string" && estMission((p as PassageDeMission).mission)
  );
  Object.assign(dernieres, derniersPassages(listePassages, lignes, maintenant));
  const enPause = new Set(
    (Array.isArray(regles.data) ? regles.data as { cle: string; active: boolean }[] : [])
      .filter((r) => r && r.active === false && Object.hasOwn(MISSIONS, r.cle)).map((r) => r.cle)
  );
  return etatTaches(dernieres, maintenant, enPause);
}

// ── Le crédit du compte IA ───────────────────────────────────────────────────
// Le porteur ne lit pas ses mails (25/09) : un crédit OpenAI à zéro doit se
// voir dans Gerimmo, en clair, pas seulement comme « en échec » sur deux
// tâches. Le dernier événement IA du journal tranche : si c'est un refus pour
// crédit ou plafond, la ligne est rouge (et bloquante) ; dès qu'une passe
// réussit après la recharge, elle repasse au vert.
const EVENEMENTS_IA = ["tache_marketing", "tache_veille", "veille_analyse_echec"] as const;
const REFUS_CREDIT = /cr[ée]dit|plafond|quota|billing/i;

export function verificationCreditIA(lignes: LigneJournal[], clePosee = true): Verification {
  // Sans clé, le crédit ne se vérifie pas : la ligne n'est pas verte (audit
  // console 27/09). Elle ne compte qu'une fois avec la clé manquante.
  if (!clePosee) {
    return {
      cle: "OPENAI_API_KEY",
      usage: "Crédit du compte IA",
      etat: "manque",
      detail: "Invérifiable tant que la clé OpenAI n’est pas posée (ligne ci-dessus).",
      prestataire: "OpenAI",
      commande: "Poser d’abord la clé OpenAI : le crédit se vérifiera au passage suivant de la veille ou des publications.",
      estConnexion: false,
    };
  }
  const recentes = lignes
    .filter((l) => (EVENEMENTS_IA as readonly string[]).includes(l.evenement))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const derniere = recentes[0];
  const texte = derniere ? JSON.stringify(derniere.details ?? {}) : "";
  const refus = Boolean(derniere) && REFUS_CREDIT.test(texte);
  return {
    cle: "OPENAI_API_KEY",
    usage: "Crédit du compte IA",
    etat: refus ? "manque" : "ok",
    detail: refus
      ? `Le service IA a refusé pour crédit ou plafond épuisé (dernier refus le ${new Date(derniere!.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" })}). La veille, les publications et l’aide à la décision s’arrêtent tant qu’il n’est pas rechargé.`
      : derniere
        ? "Aucun refus pour crédit au dernier passage des tâches IA."
        : "Aucune tâche IA n’a encore tourné.",
    prestataire: "OpenAI",
    commande: refus ? "Recharger le crédit sur la plateforme OpenAI (Facturation → Add to credit balance), puis « Lancer maintenant » sur la tâche en échec." : undefined,
    estConnexion: false,
  };
}

async function lireEvenementsIA(db: ClientQuiLitLeJournal, maintenant: Date): Promise<LigneJournal[] | null> {
  const depuis = new Date(maintenant.getTime() - 7 * 24 * HEURE).toISOString();
  const { data, error } = await (db.from("tech_log") as ChaineJournal)
    .select("evenement, details, created_at")
    // Les seuls événements IA (audit console 27/09) : un refus OpenAI ne se
    // noie plus sous 200 erreurs d'écran ou connexions.
    .in("evenement", EVENEMENTS_IA)
    .is("account_id", null)
    .gte("created_at", depuis)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return null;
  return (Array.isArray(data) ? data : []).filter(
    (l): l is LigneJournal => Boolean(l) && typeof l === "object" && typeof (l as LigneJournal).evenement === "string" && typeof (l as LigneJournal).created_at === "string"
  );
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
  const [taches, evenementsIA] = await Promise.all([chargerEtatTaches(db, maintenant), lireEvenementsIA(db, maintenant)]);
  const clePosee = Boolean(valeur(env, "OPENAI_API_KEY") || valeur(env, "OPEN_AI_KEY"));
  const configuration = [...etatConfiguration(env), ...(evenementsIA ? [verificationCreditIA(evenementsIA, clePosee)] : [])];
  return {
    configuration,
    taches,
    faitsEditeurManquants,
    bloquants: pointsBloquants(configuration, taches ?? [], faitsEditeurManquants),
    tachesIllisibles: taches === null,
  };
}
