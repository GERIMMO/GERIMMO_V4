for (const name of ['NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_SUPABASE_URL']) {
  const url = new URL(process.env[name] ?? 'https://absent.invalid');
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Banc courriels exclusivement local');
}
// Préchargement réservé au processus Next du banc : aucun transport externe.
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url ?? String(input));
  if (url.hostname === 'api.resend.com') return original('http://127.0.0.1:55520' + url.pathname, init);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Réseau extérieur interdit pour la recette');
  return original(input, init);
};
