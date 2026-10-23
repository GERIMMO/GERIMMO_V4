// `next/navigation` et `next/headers` hors de Next, pour le banc du premier mot de passe (banc-nouveau-mot-de-passe.tsx).
// Le banc ne fait jamais aboutir l'action (Supabase Auth y refuse chaque mot de passe) : une redirection ou une page
// introuvable y serait une erreur, et le dit.
export function redirect(chemin: string): never {
  throw new Error(`Redirection inattendue dans le banc : ${chemin}`);
}
export function notFound(): never {
  throw new Error("Page introuvable inattendue dans le banc");
}
export function unstable_rethrow(): void {}
export async function cookies() {
  return { get: () => undefined, getAll: () => [], set: () => {}, delete: () => {} };
}
export async function headers() {
  return new Headers();
}
