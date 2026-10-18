/** Exception demandée pour l'aperçu visuel, hors application et hors recette. */
export function estApercuSuperadminSansMfa(env, email) {
  if (env.NODE_ENV !== 'development' || env.SUPALOCAL_APERCU_SUPERADMIN_SANS_MFA !== '1') return false;
  if (email !== 'superadmin@gerimmo-demo.fr') return false;
  try {
    const db = new URL(env.SUPALOCAL_DB);
    const site = new URL(env.NEXT_PUBLIC_SITE_URL);
    const api = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
    const loopback = host => ['localhost', '127.0.0.1', '[::1]'].includes(host);
    return ['postgres:', 'postgresql:'].includes(db.protocol)
      && loopback(db.hostname) && db.pathname.startsWith('/gerimmo_ci_')
      && site.protocol === 'http:' && loopback(site.hostname)
      && api.protocol === 'http:' && loopback(api.hostname);
  } catch { return false; }
}
