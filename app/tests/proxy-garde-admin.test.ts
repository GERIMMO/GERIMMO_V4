/**
 * D44 (audit du 13/10, PRF-04) — la porte de /admin/* est dans le proxy, AVANT tout rendu.
 *
 * Avant : seul `admin/layout.tsx` redirigeait un non-super-administrateur ; la page s'exécutait en même
 * temps et sa charge utile partait avant la redirection (bornée par la RLS, aucune fuite constatée).
 * Maintenant le proxy refuse la requête avant que la moindre page ne soit appelée.
 *
 * Ce fichier tient trois choses :
 * 1. TOUTES les adresses de /admin (pages et routes lues dans le dossier, plus les écritures détournées :
 *    casse, pourcentage, double barre) renvoient chaque profil non habilité vers son écran, sans rendu, sans
 *    lecture de donnée et sans qu'un jeton de donnée n'apparaisse dans la réponse ;
 * 2. le super-administrateur avec second facteur passe, sans surblocage ;
 * 2 bis. la lecture des adhésions du proxy APPLIQUE ses filtres dans la maquette (compte connecté, adhésions actives) : un
 *    superviseur suspendu avec un second facteur valide, ou le rôle d'un autre compte, n'ouvre pas la supervision ;
 * 3. aucune page de /admin n'utilise un client à clé de service (la RLS est le filet de fond : la fiche
 *    PRF-04 reste vraie « tant qu'aucune page /admin n'utilise un client à clé de service »).
 * L'équivalence avec public.is_super_admin() est tenue sur une vraie base par proxy-garde-admin-base.test.ts.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { estAdresseSupervision, premierSegment } from "../src/lib/garde-admin";
import { estSuperviseurActif } from "../src/lib/mfa";

const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  tables: [] as string[],
  /** Les filtres `.eq()` que le proxy pose réellement sur sa lecture des adhésions, dans l'ordre. */
  filtres: [] as [string, unknown][],
  selections: [] as string[],
}));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.client }));
import { proxy } from "../src/proxy";

const BASE = "https://gerimmo.test";
const UUID = "0b6e1d6e-7c1a-4b5e-9a3d-5f2f3d9a1c11";
/** L'identifiant du compte connecté dans ces tests (le proxy le passe à la base : `.eq("account_id", …)`). */
const MOI = "compte";

/** Les jetons de donnée d'autres organisations : ils ne doivent apparaître dans AUCUNE réponse refusée. */
const JETONS = ["Agence Beta", "Parc de Fisc", "claire.moreau@exemple.test", "INC-2026-0003", "Recette TEST-SECRET"];

type Profil = { nom: string; roles: string[]; niveau: string | null; connecte: boolean };
type Adhesion = { account_id: string; role: string; status: string };
const PROFILS: Profil[] = [
  { nom: "locataire", roles: ["locataire"], niveau: "aal1", connecte: true },
  { nom: "propriétaire", roles: ["proprietaire"], niveau: "aal1", connecte: true },
  { nom: "artisan", roles: ["artisan"], niveau: "aal1", connecte: true },
  { nom: "agent", roles: ["agent"], niveau: "aal1", connecte: true },
  { nom: "administrateur d’agence", roles: ["admin_agence"], niveau: "aal2", connecte: true },
  { nom: "sans aucune adhésion active", roles: [], niveau: "aal1", connecte: true },
];

/**
 * Une base d'adhésions qui APPLIQUE les filtres `.eq()` que le proxy lui pose (relecture de D44 : une maquette qui
 * ignorait les `.eq` laissait passer un proxy qui aurait retiré « status = active » ou « account_id = … »). Seuls
 * `select` et `eq` existent : tout autre appel du proxy sur cette lecture fait échouer le test au lieu d'être ignoré.
 *
 * `adhesions` : les lignes de la table. Par défaut, celles du profil, rattachées au compte connecté et actives.
 */
function session(profil: { roles: string[]; niveau: string | null; connecte: boolean }, adhesions?: Adhesion[]) {
  mocks.tables.length = 0;
  mocks.filtres.length = 0;
  mocks.selections.length = 0;
  const table: Adhesion[] = adhesions ?? profil.roles.map((role) => ({ account_id: MOI, role, status: "active" }));
  const requete = () => {
    const filtres: [string, unknown][] = [];
    let colonnes: string[] = [];
    const q = {
      select: (liste: string) => { mocks.selections.push(liste); colonnes = liste.split(",").map((c) => c.trim()); return q; },
      eq: (colonne: string, valeur: unknown) => { mocks.filtres.push([colonne, valeur]); filtres.push([colonne, valeur]); return q; },
      then: (resolve: (v: unknown) => unknown) => {
        const lignes = table
          .filter((ligne) => filtres.every(([colonne, valeur]) => (ligne as Record<string, unknown>)[colonne] === valeur))
          .map((ligne) => Object.fromEntries(colonnes.map((c) => [c, (ligne as Record<string, unknown>)[c]])));
        return Promise.resolve({ data: lignes, error: null }).then(resolve);
      },
    };
    return q;
  };
  mocks.client.mockReturnValue({
    from: (nom: string) => {
      mocks.tables.push(nom);
      return requete();
    },
    auth: {
      getUser: async () => ({ data: { user: profil.connecte ? { id: MOI, last_sign_in_at: new Date().toISOString() } : null } }),
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: profil.niveau }, error: null }) },
    },
  });
}

/** Toutes les adresses de /admin, lues dans le dossier : une page ajoutée demain est couverte sans rien écrire. */
function adressesAdmin(): string[] {
  const racine = join(__dirname, "..", "src", "app", "admin");
  const trouvees: string[] = [];
  const parcourir = (dossier: string, chemin: string) => {
    for (const nom of readdirSync(dossier)) {
      const complet = join(dossier, nom);
      if (statSync(complet).isDirectory()) {
        const segment = nom.startsWith("[") ? UUID : nom;
        parcourir(complet, `${chemin}/${segment}`);
      } else if (nom === "page.tsx" || nom === "route.ts") {
        trouvees.push(chemin || "/");
      }
    }
  };
  parcourir(racine, "/admin");
  return [...new Set(trouvees)].sort();
}

const DETOURS = ["/admin", "/admin/", "/ADMIN/brief", "/Admin/journaux", "/%61dmin/brief", "/%41dmin/organisations", "//admin/brief", "/admin%2Fbrief", "/admin/brief/", "/admin//clients"];

beforeEach(() => vi.clearAllMocks());

describe("D44 — les adresses de la supervision sont reconnues sous toutes leurs formes", () => {
  it.each(["/admin", "/admin/", "/admin/brief", "/ADMIN", "/%61dmin", "//admin/x", "/admin%2Fx"])("%s est une adresse de supervision", (chemin) => {
    expect(estAdresseSupervision(chemin)).toBe(true);
  });
  it.each(["/", "/administration", "/agence/x/admin", "/adminer", "/espaces", "/securite", "/api/cron/purge", "/administrateur/x"])("%s n'en est pas une", (chemin) => {
    expect(estAdresseSupervision(chemin)).toBe(false);
  });
  it("un pourcentage mal formé ne casse rien et reste prudent", () => {
    expect(premierSegment("/%E0%A4%A")).toBe("%e0%a4%a");
    expect(estAdresseSupervision("/%")).toBe(false);
  });
  it("le dossier de la supervision compte bien des pages et des routes", () => {
    const adresses = adressesAdmin();
    expect(adresses.length).toBeGreaterThan(20);
    expect(adresses).toContain("/admin");
    expect(adresses.some((a) => a.endsWith("/fichier"))).toBe(true);
  });
});

describe("D44 — un compte sans le rôle de supervision est refusé AVANT tout rendu", () => {
  const adresses = [...adressesAdmin(), ...DETOURS];

  for (const profil of PROFILS) {
    it(`${profil.nom} : ${adresses.length} adresses → /espaces, sans rendu ni lecture de donnée`, async () => {
      for (const chemin of adresses) {
        session(profil);
        const reponse = await proxy(new NextRequest(`${BASE}${chemin}`));
        const lieu = reponse.headers.get("location");
        expect(lieu, chemin).not.toBeNull();
        expect(new URL(lieu!).pathname, chemin).toBe("/espaces");
        expect(reponse.status, chemin).toBe(307);
        // Pas de rendu : la requête n'est pas transmise à la page.
        expect(reponse.headers.get("x-middleware-next"), chemin).toBeNull();
        // Non-fuite par jetons : ni l'en-tête ni le corps ne portent la moindre donnée.
        const texte = JSON.stringify([...reponse.headers.entries()]) + (await reponse.text());
        for (const jeton of JETONS) expect(texte, `${chemin} ${jeton}`).not.toContain(jeton);
        // Le proxy n'a lu que les adhésions du compte pour décider.
        expect(new Set(mocks.tables), chemin).toEqual(new Set(["memberships"]));
      }
    });
  }

  // Relecture de D44 : la décision du proxy repose sur la lecture des adhésions. Si elle perdait un de ses deux
  // filtres, un compte suspendu ou le rôle d'un autre compte ouvrirait la supervision sans que rien ne le dise.
  it("un superviseur SUSPENDU (adhésion inactive) avec un second facteur valide est refusé", async () => {
    session({ roles: [], niveau: "aal2", connecte: true }, [{ account_id: MOI, role: "super_admin", status: "inactive" }]);
    const reponse = await proxy(new NextRequest(`${BASE}/admin/brief`));
    expect(new URL(reponse.headers.get("location")!).pathname).toBe("/espaces");
    expect(reponse.headers.get("x-middleware-next")).toBeNull();
  });

  it("le rôle de supervision d'un AUTRE compte ne compte pas pour le compte connecté", async () => {
    session(
      { roles: [], niveau: "aal2", connecte: true },
      [{ account_id: "un-autre-compte", role: "super_admin", status: "active" }, { account_id: MOI, role: "locataire", status: "active" }]
    );
    const reponse = await proxy(new NextRequest(`${BASE}/admin/brief`));
    expect(new URL(reponse.headers.get("location")!).pathname).toBe("/espaces");
    expect(reponse.headers.get("x-middleware-next")).toBeNull();
  });

  it("un superviseur actif dont l'adhésion voisine est suspendue passe encore", async () => {
    session(
      { roles: [], niveau: "aal2", connecte: true },
      [{ account_id: MOI, role: "super_admin", status: "active" }, { account_id: MOI, role: "admin_agence", status: "inactive" }]
    );
    const reponse = await proxy(new NextRequest(`${BASE}/admin/brief`));
    expect(reponse.headers.get("location")).toBeNull();
    expect(reponse.headers.get("x-middleware-next")).toBe("1");
  });

  it("le proxy ne lit que les adhésions ACTIVES du compte connecté (les deux filtres sont posés)", async () => {
    session({ roles: ["super_admin"], niveau: "aal2", connecte: true });
    await proxy(new NextRequest(`${BASE}/admin/brief`));
    expect(mocks.tables).toEqual(["memberships"]);
    expect(mocks.selections).toEqual(["role"]);
    expect([...mocks.filtres].sort()).toEqual([["account_id", MOI], ["status", "active"]]);
  });

  it("une action serveur (POST) refusée est redirigée en 303, jamais rejouée", async () => {
    session(PROFILS[0]);
    const reponse = await proxy(new NextRequest(`${BASE}/admin/consignes`, { method: "POST", headers: { "next-action": "abc" } }));
    expect(reponse.status).toBe(303);
    expect(new URL(reponse.headers.get("location")!).pathname).toBe("/espaces");
    expect(reponse.headers.get("x-middleware-next")).toBeNull();
  });

  it("un visiteur sans session va à la connexion, avec sa destination, sans rendu", async () => {
    for (const chemin of ["/admin", "/admin/brief", "/admin/organisations/" + UUID]) {
      session({ roles: [], niveau: null, connecte: false });
      const reponse = await proxy(new NextRequest(`${BASE}${chemin}`));
      const lieu = new URL(reponse.headers.get("location")!);
      expect(lieu.pathname, chemin).toBe("/connexion");
      expect(lieu.searchParams.get("suite"), chemin).toBe(chemin);
      expect(reponse.headers.get("x-middleware-next"), chemin).toBeNull();
      expect(mocks.tables, chemin).toEqual([]);
    }
  });

  it("une écriture détournée de /admin n'atteint aucune page non plus pour un visiteur sans session", async () => {
    for (const chemin of ["/%61dmin/brief", "/ADMIN/brief"]) {
      session({ roles: [], niveau: null, connecte: false });
      const reponse = await proxy(new NextRequest(`${BASE}${chemin}`));
      expect(reponse.status, chemin).toBe(404);
      expect(reponse.headers.get("x-middleware-rewrite"), chemin).toContain("/_introuvable");
      expect(reponse.headers.get("x-middleware-next"), chemin).toBeNull();
    }
  });

  it("un super-administrateur sans second facteur va à la configuration du second facteur, pas à /espaces", async () => {
    session({ roles: ["super_admin"], niveau: "aal1", connecte: true });
    const reponse = await proxy(new NextRequest(`${BASE}/admin/journaux`));
    expect(new URL(reponse.headers.get("location")!).pathname).toBe("/securite");
  });
});

describe("D44 — le super-administrateur avec second facteur passe (aucun surblocage)", () => {
  it("toutes les adresses de /admin sont transmises à la page", async () => {
    for (const chemin of [...adressesAdmin(), ...DETOURS]) {
      session({ roles: ["super_admin"], niveau: "aal2", connecte: true });
      const reponse = await proxy(new NextRequest(`${BASE}${chemin}`));
      expect(reponse.headers.get("location"), chemin).toBeNull();
      expect(reponse.headers.get("x-middleware-next"), chemin).toBe("1");
    }
  });

  it("un super-administrateur qui est aussi membre d'une agence passe aussi", async () => {
    session({ roles: ["admin_agence", "super_admin"], niveau: "aal2", connecte: true });
    const reponse = await proxy(new NextRequest(`${BASE}/admin/brief`));
    expect(reponse.headers.get("location")).toBeNull();
  });

  it("les autres espaces ne sont pas touchés par la garde de /admin", async () => {
    for (const chemin of ["/espaces", "/agence/" + UUID, "/administration", "/locataire/" + UUID, "/compte"]) {
      session(PROFILS[0]);
      const reponse = await proxy(new NextRequest(`${BASE}${chemin}`));
      expect(reponse.headers.get("location"), chemin).toBeNull();
    }
  });
});

describe("D44 — le rôle lu par le proxy est celui de public.is_super_admin()", () => {
  it.each([
    [["super_admin"], "aal2", true],
    [["super_admin"], "aal1", false],
    [["super_admin"], undefined, false],
    [["super_admin"], null, false],
    [["super_admin"], "inconnu", false],
    [["admin_agence"], "aal2", false],
    [[], "aal2", false],
    [["admin_agence", "super_admin"], "aal2", true],
  ] as [string[], string | null | undefined, boolean][])("%j au niveau %s → %s", (roles, niveau, attendu) => {
    expect(estSuperviseurActif(roles, niveau)).toBe(attendu);
  });
});

describe("D44 — la RLS reste le filet de fond : aucune page de /admin n'utilise un client à clé de service", () => {
  const fichiers = (dossier: string): string[] =>
    readdirSync(dossier).flatMap((nom) => {
      const complet = join(dossier, nom);
      return statSync(complet).isDirectory() ? fichiers(complet) : /\.(ts|tsx)$/.test(nom) ? [complet] : [];
    });

  it("aucun fichier de src/app/admin n'importe le client de service ni ne lit la clé de service", () => {
    const racine = join(__dirname, "..", "src", "app", "admin");
    const fautifs = fichiers(racine).filter((f) => /supabase\/service|SERVICE_ROLE|createServiceClient|clientService/.test(readFileSync(f, "utf8")));
    expect(fautifs, "une page de /admin qui lirait sans la RLS enverrait ses données à tout compte connecté si la garde cédait : décider d'une garde propre à cette page avant de l'ajouter").toEqual([]);
  });
});

describe("D08 — le proxy décrit la requête pour la trace de traversée, sans jamais croire le navigateur", () => {
  it("pose l'adresse (sans paramètres) et la méthode, et écrase une valeur envoyée par le navigateur", async () => {
    session({ roles: ["admin_agence"], niveau: "aal2", connecte: true });
    const reponse = await proxy(
      new NextRequest(`${BASE}/agence/${UUID}/baux/${UUID}?secret=1`, { headers: { "x-gerimmo-chemin": "/admin/forge", "x-gerimmo-methode": "GET" }, method: "POST" })
    );
    expect(reponse.headers.get("x-middleware-request-x-gerimmo-chemin")).toBe(`/agence/${UUID}/baux/${UUID}`);
    expect(reponse.headers.get("x-middleware-request-x-gerimmo-methode")).toBe("POST");
  });

  it("les appels de serveur à serveur (crons) les portent aussi, écrasés", async () => {
    mocks.client.mockReturnValue({});
    const reponse = await proxy(new NextRequest(`${BASE}/api/cron/equipes`, { headers: { "x-gerimmo-chemin": "/admin/forge" } }));
    expect(reponse.headers.get("x-middleware-request-x-gerimmo-chemin")).toBe("/api/cron/equipes");
  });
});
