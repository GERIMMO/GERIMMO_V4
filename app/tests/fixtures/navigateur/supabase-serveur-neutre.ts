// `@/lib/supabase/server` dans le banc navigateur du premier mot de passe (banc-nouveau-mot-de-passe.tsx) : un compte qui
// vient de confirmer son adresse, une session née du lien il y a un instant, aucun droit de supervision. `updateUser` note
// ce qu'il aurait enregistré et rend le refus préparé par le test : rien n'est jamais enregistré, aucune redirection.
export async function createClient() {
  const banc = window.__bancMotDePasse;
  const requete = {
    select: () => requete,
    eq: () => requete,
    limit: () => requete,
    maybeSingle: async () => ({ data: null, error: null }),
  };
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: "compte-banc", user_metadata: { profil_a_confirmer: banc.profil } } } }),
      getClaims: async () => ({
        data: { claims: { sub: "compte-banc", amr: [{ method: "otp", timestamp: Math.floor(Date.now() / 1000) }] } },
        error: null,
      }),
      updateUser: async ({ data }: { password: string; data?: Record<string, unknown> }) => {
        banc.enregistrements.push(data ?? {});
        return { error: banc.refusAuth.shift() ?? { code: "unexpected_failure", message: "Refus du banc" } };
      },
    },
    rpc: async () => ({ error: null }),
    from: () => requete,
  };
}
