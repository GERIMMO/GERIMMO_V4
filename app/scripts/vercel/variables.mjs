// Les variables d'environnement du projet Vercel — la logique, sans réseau (25/09).
//
// POURQUOI. L'écran Santé (/admin/sante) dit au super administrateur ce qui est
// posé et ce qui manque, mais il ne pose rien et ne voit que l'environnement où
// il tourne. Dans Vercel, les variables se vérifient une par une, à la main.
// Ce module compare ce que le projet porte (des NOMS et des cibles, jamais des
// valeurs) au catalogue ci-dessous, et prépare la pose de ce qui manque à
// partir d'un fichier .env local. Aucune valeur n'apparaît dans un rapport :
// la présence d'un secret est une information, le secret n'en est pas une.
//
// Les fonctions sont pures pour être testables (variables.test.mjs) ;
// verifier.mjs les branche sur l'API Vercel.

export const CIBLES = ["production", "preview", "development"];

/**
 * Chaque variable que la production lit, par groupe :
 * - « socle » : sans elle, le site ne se construit pas, ou les tâches
 *   planifiées répondent 503 avant tout journal ;
 * - « prestataire » : l'écran Santé la compte comme point bloquant
 *   (lib/sante-service.ts ; tests/vercel-variables.test.ts garde les deux
 *   listes alignées) ;
 * - « facultative » : active une fonction (IA, Facebook, atelier de code) ;
 *   rien ne casse sans elle.
 * `chez` dit où la valeur s'obtient. Les NEXT_PUBLIC_ partent au navigateur
 * (type « plain » chez Vercel) ; toutes les autres sont chiffrées.
 */
export const CATALOGUE = [
  { cle: "NEXT_PUBLIC_SUPABASE_URL", groupe: "socle", chez: "Supabase", usage: "Adresse du projet (Project Settings > API)" },
  { cle: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", groupe: "socle", chez: "Supabase", usage: "Clé publiable (anon), côté navigateur" },
  { cle: "SUPABASE_SERVICE_ROLE_KEY", groupe: "socle", chez: "Supabase", usage: "Clé service_role des tâches planifiées et des envois automatiques" },
  { cle: "CRON_SECRET", groupe: "socle", chez: "Vercel", usage: "Authentification des tâches planifiées (générée si absente du fichier)" },
  { cle: "NEXT_PUBLIC_SITE_URL", groupe: "socle", chez: "Vercel", usage: "Adresse publique : liens des e-mails, pied des documents" },
  { cle: "STRIPE_SECRET_KEY", groupe: "prestataire", chez: "Stripe", usage: "Facturation des abonnements" },
  { cle: "STRIPE_WEBHOOK_SECRET", groupe: "prestataire", chez: "Stripe", usage: "Signature des événements d'abonnement" },
  { cle: "STRIPE_PRIX_BIEN", groupe: "prestataire", chez: "Stripe", usage: "Tarif par bien (propriétaire direct)" },
  { cle: "STRIPE_PRIX_LOT_AGENCE", groupe: "prestataire", chez: "Stripe", usage: "Tarif par tranche de lots (agence)" },
  { cle: "RESEND_API_KEY", groupe: "prestataire", chez: "Resend", usage: "Envoi des e-mails du service" },
  { cle: "RESEND_EXPEDITEUR", groupe: "prestataire", chez: "Resend", usage: "Adresse d'expédition, sur un domaine vérifié chez Resend" },
  { cle: "YOUTRUST_API_KEY", groupe: "prestataire", chez: "Yousign", usage: "Signature électronique" },
  { cle: "YOUTRUST_WEBHOOK_SECRET", groupe: "prestataire", chez: "Yousign", usage: "Réception des signatures terminées" },
  { cle: "YOUTRUST_ENV", groupe: "facultative", chez: "Yousign", usage: "sandbox (défaut) ou production" },
  { cle: "RESEND_DOMAIN_READ_KEY", groupe: "facultative", chez: "Resend", usage: "Lecture de l'état du domaine (écran Santé)" },
  { cle: "OPENAI_API_KEY", groupe: "facultative", chez: "OpenAI", usage: "Veille, brief, brouillons et illustrations" },
  { cle: "OPENAI_BRIEF_MODEL", groupe: "facultative", chez: "OpenAI", usage: "Modèle du brief de supervision" },
  { cle: "OPENAI_VEILLE_MODEL", groupe: "facultative", chez: "OpenAI", usage: "Modèle des études réglementaires" },
  { cle: "OPENAI_PUBLICATION_MODEL", groupe: "facultative", chez: "OpenAI", usage: "Modèle des brouillons du Journal" },
  { cle: "OPENAI_MARKETING_IMAGE_MODEL", groupe: "facultative", chez: "OpenAI", usage: "Modèle des illustrations Facebook" },
  { cle: "META_FACEBOOK_PAGE_ID", groupe: "facultative", chez: "Meta", usage: "Identifiant de la Page Facebook" },
  { cle: "META_FACEBOOK_PAGE_ACCESS_TOKEN", groupe: "facultative", chez: "Meta", usage: "Jeton de Page (publication)" },
  { cle: "META_AD_ACCOUNT_ID", groupe: "facultative", chez: "Meta", usage: "Compte publicitaire (act_…)" },
  { cle: "META_ADS_ACCESS_TOKEN", groupe: "facultative", chez: "Meta", usage: "Jeton Marketing API" },
  { cle: "META_GRAPH_API_VERSION", groupe: "facultative", chez: "Meta", usage: "Version de l'API Graph (ex. v21.0)" },
  { cle: "GITHUB_AGENT_TOKEN", groupe: "facultative", chez: "GitHub", usage: "Atelier de code (suivi des corrections proposées)" },
  { cle: "GERIMMO_CODEX_ENABLED", groupe: "facultative", chez: "Gerimmo", usage: "Atelier de code : true pour l'activer (désactivé par défaut)" },
];

/**
 * Ce qui n'a rien à faire sur Vercel : le rapport signale sa présence. Une
 * chaîne Postgres directe ou une clé de sauvegarde posée « au cas où » sur le
 * serveur public élargit la surface d'attaque sans servir à rien.
 */
const HORS_VERCEL = [
  [/^SUPABASE_DB_URL$/, "chaîne Postgres directe : réservée aux tests du socle"],
  [/^OPEN_AI_KEY$/, "ancien nom de la clé OpenAI : OPENAI_API_KEY suffit"],
  [/^VERCEL_TOKEN$/, "jeton d'API Vercel : GitHub Actions seulement"],
  [/^GERIMMO_BACKUP_/, "sauvegarde : lancée hors Vercel"],
  [/^(TEST_|E2E_|SUPALOCAL_)/, "banc de test local"],
  [/^GERIMMO_(AUTORISER_PROD|CHARGE_DB)$/, "garde-fou des tests d'intégration"],
];

/** La raison pour laquelle une variable ne devrait pas être sur Vercel, ou null. */
export function horsVercel(cle) {
  for (const [motif, raison] of HORS_VERCEL) if (motif.test(cle)) return raison;
  return null;
}

/**
 * La comparaison entre les variables du projet (réponse de
 * GET /v10/projects/{id}/env : `key`, `target`, `gitBranch`) et le catalogue.
 * Une variable de preview limitée à une branche ne couvre pas les autres
 * branches : elle ne compte pas comme présente en preview.
 */
export function comparer(envs, cibles = ["production"]) {
  const presence = new Map();
  for (const e of Array.isArray(envs) ? envs : []) {
    if (!e || typeof e.key !== "string") continue;
    const portees = Array.isArray(e.target) ? e.target : typeof e.target === "string" ? [e.target] : [];
    const s = presence.get(e.key) ?? new Set();
    for (const c of portees) if (c !== "preview" || !e.gitBranch) s.add(c);
    presence.set(e.key, s);
  }
  const lignes = CATALOGUE.map((v) => {
    const sur = presence.get(v.cle) ?? new Set();
    return { ...v, presente: cibles.filter((c) => sur.has(c)), manquante: cibles.filter((c) => !sur.has(c)) };
  });
  const connues = new Set(CATALOGUE.map((v) => v.cle));
  const indesirables = [], inconnues = [];
  for (const [cle, sur] of presence) {
    const raison = horsVercel(cle);
    if (raison) indesirables.push({ cle, raison, cibles: [...sur].sort() });
    // Les VERCEL_* sont posées par la plateforme (bypass de protection, etc.).
    else if (!connues.has(cle) && !cle.startsWith("VERCEL_")) inconnues.push({ cle, cibles: [...sur].sort() });
  }
  indesirables.sort((a, b) => a.cle.localeCompare(b.cle));
  inconnues.sort((a, b) => a.cle.localeCompare(b.cle));
  return { cibles, lignes, indesirables, inconnues };
}

/** Un fichier .env : `CLE=valeur`, commentaires, guillemets et `export` acceptés. */
export function lireEnv(texte) {
  const valeurs = new Map();
  for (const brute of String(texte ?? "").split(/\r?\n/)) {
    const ligne = brute.replace(/^\s*export\s+/, "").trim();
    if (!ligne || ligne.startsWith("#")) continue;
    const m = ligne.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    const q = v[0];
    if ((q === '"' || q === "'") && v.length >= 2 && v.endsWith(q)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "").trim();
    if (v) valeurs.set(m[1], v);
  }
  return valeurs;
}

/** Le rôle porté par un JWT Supabase (anon, service_role), ou null. */
function roleDuJeton(valeur) {
  const parties = valeur.split(".");
  if (parties.length !== 3) return null;
  try {
    const charge = JSON.parse(Buffer.from(parties[1], "base64url").toString("utf8"));
    return typeof charge?.role === "string" ? charge.role : null;
  } catch {
    return null;
  }
}

/**
 * Ce qu'on vérifie AVANT de poser une valeur : la forme attendue par le code
 * qui la lit, et surtout les inversions qui coûtent cher — une clé secrète
 * sous un nom NEXT_PUBLIC_ partirait au navigateur ; la clé publiable sous
 * SUPABASE_SERVICE_ROLE_KEY bloquerait chaque tâche planifiée derrière la RLS.
 * Retourne { valeur, avertissement } (valeur normalisée) ou { erreur }.
 */
export function controlerValeur(cle, brute) {
  let valeur = String(brute ?? "").trim();
  if (!valeur) return { erreur: "valeur vide" };
  if (/[\x00-\x1f\x7f]/.test(valeur)) return { erreur: "caractère de contrôle dans la valeur" };
  const role = roleDuJeton(valeur);
  const avertissements = [];
  switch (cle) {
    case "NEXT_PUBLIC_SITE_URL":
      valeur = valeur.replace(/\/+$/, "");
      if (/localhost|127\.0\.0\.1/.test(valeur)) return { erreur: "adresse locale : les liens des e-mails ne mèneraient nulle part" };
      if (!/^https:\/\/[^/\s?#]+$/.test(valeur)) return { erreur: "attendu : https://domaine, sans chemin ni barre oblique finale" };
      break;
    case "NEXT_PUBLIC_SUPABASE_URL":
      valeur = valeur.replace(/\/+$/, "");
      if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(valeur)) return { erreur: "attendu : https://<ref>.supabase.co" };
      break;
    case "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY":
      if (role === "service_role" || valeur.startsWith("sb_secret_")) return { erreur: "c'est une clé SECRÈTE : sous ce nom, elle partirait au navigateur" };
      if (!valeur.startsWith("sb_publishable_") && role !== "anon") return { erreur: "attendu : sb_publishable_… ou la clé anon" };
      break;
    case "SUPABASE_SERVICE_ROLE_KEY":
      if (valeur.startsWith("sb_publishable_") || role === "anon") return { erreur: "c'est la clé publiable : les tâches planifiées resteraient bloquées par la RLS" };
      if (!valeur.startsWith("sb_secret_") && role !== "service_role") return { erreur: "attendu : la clé service_role (Project Settings > API) ou sb_secret_…" };
      break;
    case "CRON_SECRET":
      if (valeur.length < 32) return { erreur: "32 caractères au moins" };
      break;
    case "STRIPE_SECRET_KEY":
      if (!/^(sk|rk)_(live|test)_/.test(valeur)) return { erreur: "attendu : sk_live_… ou sk_test_…" };
      if (/_test_/.test(valeur)) avertissements.push("clé de test : aucun paiement réel ne passera");
      break;
    case "STRIPE_WEBHOOK_SECRET":
      if (!valeur.startsWith("whsec_")) return { erreur: "attendu : whsec_…" };
      break;
    case "STRIPE_PRIX_BIEN":
    case "STRIPE_PRIX_LOT_AGENCE":
      if (!valeur.startsWith("price_")) return { erreur: "attendu : price_… (identifiant du tarif, pas du produit)" };
      break;
    case "RESEND_API_KEY":
    case "RESEND_DOMAIN_READ_KEY":
      if (!valeur.startsWith("re_")) return { erreur: "attendu : re_…" };
      break;
    case "RESEND_EXPEDITEUR": {
      const m = valeur.match(/@([^>\s]+)/);
      if (!m) return { erreur: "attendu : « Nom <boite@domaine> »" };
      if (m[1].toLowerCase() === "resend.dev") avertissements.push("adresse de test : ne livre qu'au titulaire du compte Resend");
      break;
    }
    case "YOUTRUST_ENV":
      if (!["sandbox", "production"].includes(valeur)) return { erreur: "attendu : sandbox ou production" };
      break;
    case "GERIMMO_CODEX_ENABLED":
      if (!["true", "false"].includes(valeur)) return { erreur: "attendu : true ou false" };
      break;
    case "META_AD_ACCOUNT_ID":
      if (!/^act_\d+$/.test(valeur)) return { erreur: "attendu : act_123456" };
      break;
    default:
      break;
  }
  return { valeur, avertissement: avertissements.join(" ; ") || null };
}

/**
 * Le plan de pose : pour chaque variable manquante, la valeur du fichier
 * (contrôlée), ou une valeur générée pour CRON_SECRET seule — personne n'a
 * besoin de la connaître, Vercel l'envoie lui-même aux tâches planifiées et
 * la console la lit côté serveur. Rien n'est écrasé : seules les cibles où la
 * variable manque sont visées.
 */
export function planifier(comparaison, valeurs, { cronSecret } = {}) {
  const aPoser = [], sansValeur = [], refusees = [];
  for (const l of comparaison.lignes) {
    if (!l.manquante.length) continue;
    let brute = valeurs.get(l.cle);
    let generee = false;
    if (!brute && l.cle === "CRON_SECRET" && typeof cronSecret === "function") {
      brute = cronSecret();
      generee = true;
    }
    if (!brute) {
      sansValeur.push({ cle: l.cle, groupe: l.groupe, chez: l.chez, usage: l.usage, cibles: l.manquante });
      continue;
    }
    const c = controlerValeur(l.cle, brute);
    if (c.erreur) {
      refusees.push({ cle: l.cle, erreur: c.erreur });
      continue;
    }
    aPoser.push({
      cle: l.cle,
      valeur: c.valeur,
      cibles: l.manquante,
      type: l.cle.startsWith("NEXT_PUBLIC_") ? "plain" : "encrypted",
      avertissement: c.avertissement,
      generee,
    });
  }
  return { aPoser, sansValeur, refusees };
}

const TITRES = { socle: "Socle", prestataire: "Prestataires (points bloquants de l'écran Santé)", facultative: "Facultatives" };

/** Le rapport lisible : des noms et des cibles, jamais une valeur. */
export function rapport(comparaison) {
  const { cibles, lignes, indesirables, inconnues } = comparaison;
  const sortie = [`Variables du projet Vercel — cibles : ${cibles.join(", ")}`, ""];
  const large = Math.max(...lignes.map((l) => l.cle.length)) + 2;
  for (const groupe of ["socle", "prestataire", "facultative"]) {
    sortie.push(TITRES[groupe]);
    for (const l of lignes.filter((x) => x.groupe === groupe)) {
      const etat = l.manquante.length === 0 ? "✔" : "✘";
      const ou = l.manquante.length === 0
        ? l.presente.join(", ")
        : `manque : ${l.manquante.join(", ")}${l.presente.length ? ` (présente : ${l.presente.join(", ")})` : ""}`;
      sortie.push(`  ${etat} ${l.cle.padEnd(large)} ${ou}${l.manquante.length ? `  — ${l.chez} : ${l.usage}` : ""}`);
    }
    sortie.push("");
  }
  if (indesirables.length) {
    sortie.push("À retirer (rien à faire sur Vercel)");
    for (const i of indesirables) sortie.push(`  ! ${i.cle.padEnd(large)} ${i.cibles.join(", ")} — ${i.raison}`);
    sortie.push("");
  }
  if (inconnues.length) sortie.push(`Pour information, hors catalogue : ${inconnues.map((i) => `${i.cle} (${i.cibles.join(", ")})`).join(", ")}`, "");
  const manque = (groupe) => lignes.filter((l) => l.groupe === groupe && l.manquante.length).length;
  sortie.push(`Bilan : ${manque("socle")} manquante(s) sur le socle, ${manque("prestataire")} chez les prestataires, ${manque("facultative")} facultative(s) absente(s).`);
  return sortie.join("\n");
}

/** Vrai quand tout ce qui bloque (socle et prestataires) est posé sur chaque cible. */
export function complete(comparaison) {
  return comparaison.lignes.every((l) => l.groupe === "facultative" || l.manquante.length === 0);
}
