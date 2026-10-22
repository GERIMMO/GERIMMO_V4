// Même contrôle à la construction et au démarrage du serveur. Aucun secret
// n'est affiché. La préproduction initiale n'utilise aucun service externe.
export function verifierEnvironnement(env = process.env) {
  const isole = env.GERIMMO_PREPRODUCTION_VALIDEE === "1";
  const cible = env.VERCEL_ENV;
  const suspendre = (motif) => { throw new Error(`Construction suspendue : ${motif}`); };
  if (cible === "production") {
    if (isole) suspendre("le réglage de préproduction ne doit pas être posé en production.");
    return;
  }
  if (!isole) {
    if (cible === "preview" || (env.VERCEL === "1" && cible !== "production")) {
      suspendre("les prévisualisations Gerimmo doivent disposer de services isolés avant leur réouverture. La production et le banc local restent disponibles.");
    }
    return;
  }
  if (cible !== "preview" || env.VERCEL_TARGET_ENV !== "preproduction") {
    suspendre("la préproduction doit utiliser son environnement Vercel dédié.");
  }
  if (env.NEXT_PUBLIC_SUPABASE_URL !== "https://hlkbvmfybxwqathchsdz.supabase.co") {
    suspendre("la base Supabase n'est pas la base isolée autorisée.");
  }
  const hote = env.VERCEL_URL ?? "";
  // Vercel attribue l'hôte lors du déploiement, après l'enregistrement des
  // variables. Une URL explicitement différente reste une erreur ; l'absence
  // permet à next.config de publier l'origine vérifiée dans le bundle.
  const adresse = `https://${hote}`;
  if (!/^gerimmo-v4-[a-z0-9-]+\.vercel\.app$/.test(hote) || (env.NEXT_PUBLIC_SITE_URL && env.NEXT_PUBLIC_SITE_URL !== adresse)) {
    suspendre("l'adresse du site doit être celle de ce déploiement de préproduction.");
  }
  const interdites = Object.entries(env).filter(([nom, valeur]) => valeur && (
    /^(STRIPE_|ZOHO_|YOUTRUST_|RESEND_|META_|OPENAI_|OPEN_AI_)/.test(nom)
    || ["GITHUB_AGENT_TOKEN", "VERCEL_TOKEN", "CRON_SECRET", "SUPABASE_DB_URL", "SUPABASE_SERVICE_ROLE_KEY"].includes(nom)
    || (["GERIMMO_CODEX_ENABLED", "GERIMMO_RELAIS_EMAILS"].includes(nom) && !["0", "false"].includes(valeur))
  ));
  if (interdites.length) suspendre("des accès ou automatismes externes sont encore configurés dans l'environnement isolé.");
  return adresse;
}
