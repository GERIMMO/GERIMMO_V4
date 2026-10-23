/**
 * PRO-5, suite (relecture adverse du 23/10/2026), sur l'émulateur Supabase du banc et avec le VRAI client serveur
 * (`@/lib/supabase/server`, `@supabase/ssr`) : après le premier choix du mot de passe, la session née du lien de
 * confirmation ne rouvre plus /nouveau-mot-de-passe.
 *
 * Changer le mot de passe ne touche ni la session courante ni sa preuve d'e-mail (`amr`, quinze minutes). Si la session du
 * lien restait celle du navigateur, quiconque l'utilisait pouvait, jusqu'à la fin des quinze minutes, reposer le mot de
 * passe sans connaître l'actuel. Le premier choix doit donc laisser au navigateur une session « mot de passe » (cookies
 * réécrits par le client serveur) et fermer celle du lien côté Auth.
 *
 * Seuls `next/headers` (un bocal de cookies en mémoire : celui du navigateur) et `next/navigation` sont simulés. Le compte,
 * fictif, est créé sur l'émulateur par la fabrique de liens (`generate_link` de type `signup`), comme à l'inscription.
 *
 * Ne s'exécute que sur le banc : SIGNATURE_TEST_API_URL (l'émulateur, en local) et SUPABASE_SERVICE_ROLE_KEY (la clé
 * qu'il affiche au démarrage) ; la CI les pose toutes deux. Avec SIGNATURE_TEST_DB_URL (la base de l'émulateur, posée
 * aussi par la CI), le compte fictif est supprimé à la fin.
 */
import { randomUUID } from "node:crypto";
import { createClient as clientIsole } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const api = process.env.SIGNATURE_TEST_API_URL ?? "";
const cleService = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const local = /^http:\/\/(localhost|127\.0\.0\.1):\d{1,5}$/.test(api) && cleService !== "";
const CLE_PUBLIQUE = "cle-locale";
const baseDuBanc = process.env.SIGNATURE_TEST_DB_URL ?? "";
const baseLocale = (() => {
  try {
    const url = new URL(baseDuBanc);
    return ["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname.includes("ci_");
  } catch {
    return false;
  }
})();

type Cookie = { name: string; value: string };
const bocal = vi.hoisted(() => ({ cookies: new Map<string, { name: string; value: string }>() }));
/** Le magasin de cookies tel que `cookies()` de Next le présente à une action serveur : celui du navigateur. */
function magasin(cookies: Map<string, Cookie>) {
  return {
    getAll: () => [...cookies.values()],
    get: (nom: string) => cookies.get(nom),
    set: (nom: string, valeur: string, options?: { maxAge?: number }) => {
      if (valeur === "" || options?.maxAge === 0) cookies.delete(nom);
      else cookies.set(nom, { name: nom, value: valeur });
    },
    delete: (nom: string) => cookies.delete(nom),
  };
}
vi.mock("next/headers", () => ({ cookies: async () => magasin(bocal.cookies) }));
vi.mock("next/navigation", () => ({ redirect: (chemin: string) => { throw new Error(`REDIRECT ${chemin}`); }, notFound: () => { throw new Error("INTROUVABLE"); } }));
vi.mock("@/lib/lien-mot-de-passe", () => ({ envoyerLienMotDePasse: vi.fn(), inscrireEtEnvoyerConfirmation: vi.fn() }));

import { definirNouveauMotDePasse } from "@/app/actions/auth";
import PageNouveauMotDePasse from "@/app/nouveau-mot-de-passe/page";
import { autorisationNouveauMotDePasse } from "@/lib/autorisation-nouveau-mot-de-passe";
import { methodesDeLaSession } from "@/lib/session-lien-email";

/** Un client serveur lisant et écrivant le bocal donné (le navigateur, ou une copie de ses cookies). */
function clientDuNavigateur(cookies: Map<string, Cookie>) {
  const m = magasin(cookies);
  return createServerClient(api, CLE_PUBLIQUE, {
    cookies: { getAll: m.getAll, setAll: (liste) => liste.forEach(({ name, value, options }) => m.set(name, value, options)) },
  });
}
const sansSession = () => clientIsole(api, CLE_PUBLIQUE, { auth: { persistSession: false, autoRefreshToken: false } });

describe.skipIf(!local)("PRO-5, suite — sur l'émulateur : après le premier choix, la session du lien ne sert plus", () => {
  const adresse = [`premier-choix-${randomUUID()}`, "example.invalid"].join("@");
  const choisi = `Choisi-${randomUUID()}`;
  const intrus = `Intrus-${randomUUID()}`;
  let compteId = "";
  let copieDuLien: Map<string, Cookie>;
  const service = () => clientIsole(api, cleService, { auth: { persistSession: false, autoRefreshToken: false } });

  beforeAll(async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", api);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", CLE_PUBLIQUE);
    const lien = await service().auth.admin.generateLink({
      type: "signup",
      email: adresse,
      password: `Provisoire-${randomUUID()}`,
      options: { data: { profil_a_confirmer: { nom: "Initial", prenom: "Camille", espace: "proprietaire_direct" } } },
    });
    expect(lien.error).toBeNull();
    compteId = lien.data.user!.id;
    // Le clic sur « Confirmer mon adresse » : la session née du lien est posée dans les cookies du navigateur.
    const verification = await clientDuNavigateur(bocal.cookies).auth.verifyOtp({ type: "email", token_hash: lien.data.properties!.hashed_token });
    expect(verification.error).toBeNull();
    copieDuLien = new Map(bocal.cookies);
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    // Le compte fictif ne survit pas au fichier (comme dans recuperation-auth-reelle.test.ts). L'émulateur ne sait pas
    // supprimer un compte (`auth.admin.deleteUser` y répond 404) : la suppression passe par sa base, quand le banc la nomme
    // (SIGNATURE_TEST_DB_URL, que la CI pose ; une base locale de CI seulement).
    if (!compteId || !baseLocale) return;
    const base = new Client({ connectionString: baseDuBanc });
    await base.connect();
    try {
      expect((await base.query("delete from auth.users where id = $1", [compteId])).rowCount).toBe(1);
    } finally {
      await base.end();
    }
  });

  it("avant le premier choix, la session du lien ouvre le formulaire (témoin)", async () => {
    const navigateur = clientDuNavigateur(bocal.cookies);
    const { data } = await navigateur.auth.getClaims();
    expect(methodesDeLaSession(data?.claims.amr)).toEqual(["email/signup"]);
    expect(await autorisationNouveauMotDePasse(navigateur as never, compteId)).toBe("accordee");
  });

  it("le premier choix mène à l'espace et laisse au navigateur une session « mot de passe »", async () => {
    const envoi = new FormData();
    for (const [cle, valeur] of Object.entries({ mot_de_passe: choisi, confirmation: choisi, suite: "/espaces", espace: "proprietaire_direct", nom: "Corrigé", prenom: "Camille", cgu: "on" })) envoi.set(cle, valeur);
    await expect(definirNouveauMotDePasse({}, envoi)).rejects.toThrow(/^REDIRECT \/espaces$/);

    const navigateur = clientDuNavigateur(bocal.cookies);
    const { data: { user } } = await navigateur.auth.getUser();
    expect(user?.id).toBe(compteId);
    expect(user?.user_metadata).toMatchObject({ nom: "Corrigé", espace: "proprietaire_direct" });
    expect(user?.user_metadata).not.toHaveProperty("profil_a_confirmer");
    const { data } = await navigateur.auth.getClaims();
    expect(methodesDeLaSession(data?.claims.amr)).toEqual(["password"]);
    expect(await autorisationNouveauMotDePasse(navigateur as never, compteId)).toBe("lien_requis");
  });

  it("une copie des cookies de la session du lien ne rouvre rien : cette session est fermée côté Auth", async () => {
    // Ce qui ferme la porte est `getUser()`, qui interroge Auth, et que la page comme l'action appellent avant tout autre
    // contrôle. `autorisationNouveauMotDePasse` seule ne le prouve pas : sur l'émulateur (jeton HS256), son `getClaims`
    // repasse par Auth, mais avec les clés asymétriques de la production il vérifie le jeton sur place et lirait encore la
    // preuve d'e-mail de la session fermée jusqu'à l'expiration du jeton (relecture du 23/10). Le test porte donc sur
    // `getUser()`, sur la page et sur l'action, chacune présentée avec la copie des cookies du lien.
    expect((await clientDuNavigateur(new Map(copieDuLien)).auth.getUser()).data.user).toBeNull();
    const navigateur = bocal.cookies;
    try {
      bocal.cookies = new Map(copieDuLien);
      await expect(PageNouveauMotDePasse({ searchParams: Promise.resolve({ motif: "inscription" }) })).rejects.toThrow(/^REDIRECT \/connexion\?raison=lien-invalide$/);
      bocal.cookies = new Map(copieDuLien);
      const envoi = new FormData();
      for (const [cle, valeur] of Object.entries({ mot_de_passe: intrus, confirmation: intrus, suite: "/espaces" })) envoi.set(cle, valeur);
      expect((await definirNouveauMotDePasse({}, envoi)).erreur).toBe("Session expirée ou lien invalide. Redemandez un e-mail de réinitialisation.");
    } finally {
      bocal.cookies = navigateur;
    }
    expect((await sansSession().auth.signInWithPassword({ email: adresse, password: intrus })).error).not.toBeNull();
  });

  it("dans le même navigateur, un second envoi est refusé et le mot de passe choisi reste le bon", async () => {
    const envoi = new FormData();
    for (const [cle, valeur] of Object.entries({ mot_de_passe: intrus, confirmation: intrus, suite: "/espaces" })) envoi.set(cle, valeur);
    const etat = await definirNouveauMotDePasse({}, envoi);
    expect(etat.erreur).toBe("Ce formulaire est réservé au lien reçu par e-mail, pendant quinze minutes après sa confirmation. Redemandez un lien ou changez votre mot de passe dans « Mon compte », avec le mot de passe actuel.");
    expect((await sansSession().auth.signInWithPassword({ email: adresse, password: choisi })).error).toBeNull();
    expect((await sansSession().auth.signInWithPassword({ email: adresse, password: intrus })).error).not.toBeNull();
  });
});
