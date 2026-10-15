/**
 * Décision D27 (fiche DES-A-08, option B, ratifiée le 14/10/2026) : les écrans du propriétaire direct quittent
 * l'adresse /agence/<id>/… .
 *  · /espace/<id>/… est un alias, réécrit par le proxy vers /agence/<id>/… — uniquement pour l'organisation d'un
 *    propriétaire direct à laquelle la personne a un accès de gestion ;
 *  · /agence/<id>/… d'un propriétaire direct est redirigé à vie (308), chemin et requête conservés, sans cache partagé ;
 *  · les agences ne changent pas ;
 *  · l'adresse d'un autre profil n'est pas atteignable par l'alias.
 *
 * POINT DE SÉCURITÉ : l'alias vient APRÈS les gardes du proxy (session, expiration, second facteur, porte de /admin).
 * La seconde moitié de ce fichier prouve que ces gardes sont INCHANGÉES sur les deux racines, et que leur lecture des
 * adhésions est la même qu'avant (mêmes colonnes, mêmes filtres).
 *
 * La maquette de la base APPLIQUE les filtres `.eq()` que le proxy pose (patron de proxy-garde-admin.test.ts) : un
 * proxy qui oublierait « account_id », « organization_id » ou « status = active » sur sa lecture du type ferait
 * échouer ces tests au lieu de passer en silence.
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ACTIVITY_COOKIE } from "@/lib/session-policy";

const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  /** Chaque lecture : table, colonnes, filtres. */
  lectures: [] as { table: string; colonnes: string; filtres: [string, unknown][] }[],
  signOut: vi.fn(async () => ({ error: null })),
}));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.client }));
import { proxy } from "../src/proxy";
import robots from "../src/app/robots";

const MOI = "compte-connecte";
const ORG_P = "3c1d7a52-1f0e-4f6b-8d2b-5b9a2f4e6c11"; // propriétaire direct, celui de la personne connectée
const ORG_Q = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d"; // un AUTRE propriétaire direct
const ORG_A = "f2cb7540-d6f9-471d-bd6e-44b6d9e7ea39"; // une agence
const ORG_INEXISTANTE = "00000000-0000-4000-8000-000000000000";

const ORGANISATIONS: Record<string, { type: string }> = {
  [ORG_P]: { type: "proprietaire_direct" },
  [ORG_Q]: { type: "proprietaire_direct" },
  [ORG_A]: { type: "agence" },
};

type Ligne = { account_id: string; role: string; status: string; organization_id: string | null };
const ligne = (role: string, organization_id: string | null, status = "active", account_id = MOI): Ligne => ({ account_id, role, status, organization_id });

const PROPRIETAIRE = [ligne("proprietaire_direct", ORG_P)];
const ADMIN_AGENCE = [ligne("admin_agence", ORG_A)];
const AGENT = [ligne("agent", ORG_A)];
const LOCATAIRE_DE_P = [ligne("locataire", ORG_P)];
const SUPERVISION = [ligne("super_admin", null)];

/**
 * La base : des adhésions et des organisations. Chaque lecture applique ses filtres et ne rend que les colonnes
 * demandées ; l'organisation jointe (« organisation:organizations(type) ») est rendue comme le fait PostgREST.
 */
function connecter(adhesions: Ligne[], opts: { niveau?: string | null; connecte?: boolean; derniereConnexion?: string } = {}) {
  mocks.lectures.length = 0;
  const requete = (table: string) => {
    const filtres: [string, unknown][] = [];
    let colonnes = "";
    const lignes = () => {
      if (table === "memberships") {
        return adhesions
          .filter((l) => filtres.every(([c, v]) => (l as Record<string, unknown>)[c] === v))
          .map((l) => {
            const sortie: Record<string, unknown> = {};
            for (const c of colonnes.split(",").map((x) => x.trim())) {
              if (c === "organisation:organizations(type)") sortie.organisation = l.organization_id ? ORGANISATIONS[l.organization_id] ?? null : null;
              else sortie[c] = (l as Record<string, unknown>)[c];
            }
            return sortie;
          });
      }
      if (table === "organizations") {
        const id = filtres.find(([c]) => c === "id")?.[1] as string | undefined;
        return id && ORGANISATIONS[id] ? [ORGANISATIONS[id]] : [];
      }
      throw new Error(`table inattendue : ${table}`);
    };
    const q = {
      select: (liste: string) => { colonnes = liste; return q; },
      eq: (colonne: string, valeur: unknown) => { filtres.push([colonne, valeur]); return q; },
      maybeSingle: async () => {
        mocks.lectures.push({ table, colonnes, filtres: [...filtres] });
        return { data: lignes()[0] ?? null, error: null };
      },
      then: (resolve: (v: unknown) => unknown) => {
        mocks.lectures.push({ table, colonnes, filtres: [...filtres] });
        return Promise.resolve({ data: lignes(), error: null }).then(resolve);
      },
    };
    return q;
  };
  const roles = adhesions.filter((l) => l.status === "active" && l.account_id === MOI).map((l) => l.role);
  mocks.client.mockReturnValue({
    from: requete,
    auth: {
      getUser: async () => ({
        data: { user: opts.connecte === false ? null : { id: MOI, last_sign_in_at: opts.derniereConnexion ?? new Date().toISOString() } },
      }),
      signOut: mocks.signOut,
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: opts.niveau === undefined ? (roles.includes("super_admin") ? "aal2" : "aal1") : opts.niveau },
          error: null,
        }),
      },
    },
  });
}
const sansSession = () => connecter([], { connecte: false });

const aller = (chemin: string, methode = "GET", headers?: Record<string, string>) =>
  proxy(new NextRequest(`https://gerimmo.test${chemin}`, { method: methode, headers }));
const reecritVers = (r: Response) => r.headers.get("x-middleware-rewrite");
const lieu = (r: Response) => {
  const l = r.headers.get("location");
  return l ? new URL(l) : null;
};
const introuvable = (r: Response) => {
  expect(r.status).toBe(404);
  expect(new URL(reecritVers(r)!).pathname).toBe("/_introuvable");
  expect(r.headers.get("location")).toBeNull();
};
const servieTelleQuelle = (r: Response) => {
  expect(r.status).toBe(200);
  expect(r.headers.get("location")).toBeNull();
  expect(reecritVers(r)).toBeNull();
  expect(r.headers.get("x-middleware-next")).toBe("1");
};

beforeEach(() => vi.clearAllMocks());

describe("D27 — le propriétaire direct : /agence/<id> est redirigé à vie vers /espace/<id>", () => {
  it.each([
    [`/agence/${ORG_P}`, `/espace/${ORG_P}`],
    [`/agence/${ORG_P}/parc`, `/espace/${ORG_P}/parc`],
    [`/agence/${ORG_P}/parc?annee=2026&bien=a%20b`, `/espace/${ORG_P}/parc?annee=2026&bien=a%20b`],
    [`/agence/${ORG_P}/baux/abc/edl/def`, `/espace/${ORG_P}/baux/abc/edl/def`],
    [`/agence/${ORG_P}/comptabilite/export?annee=2026`, `/espace/${ORG_P}/comptabilite/export?annee=2026`],
    [`/agence/${ORG_P.toUpperCase()}/loyers`, `/espace/${ORG_P}/loyers`],
  ])("GET %s → 308 vers %s (chemin et requête conservés)", async (de, vers) => {
    connecter(PROPRIETAIRE);
    const r = await aller(de);
    expect(r.status).toBe(308);
    expect(lieu(r)!.pathname + lieu(r)!.search).toBe(vers);
    expect(lieu(r)!.origin).toBe("https://gerimmo.test");
  });

  it("HEAD aussi", async () => {
    connecter(PROPRIETAIRE);
    expect((await aller(`/agence/${ORG_P}/parc`, "HEAD")).status).toBe(308);
  });

  it("la redirection est privée et revalidée (Cache-Control private, no-cache) et garde les cookies de session", async () => {
    connecter(PROPRIETAIRE);
    const r = await aller(`/agence/${ORG_P}/parc`);
    expect(r.headers.get("cache-control")).toBe("private, no-cache");
    expect(r.cookies.get(ACTIVITY_COOKIE)?.value).toBeTruthy();
  });

  it("un envoi (POST d'une action serveur d'une page ouverte avant la mise en ligne) n'est pas redirigé : il est servi tel quel", async () => {
    connecter(PROPRIETAIRE);
    servieTelleQuelle(await aller(`/agence/${ORG_P}/parc`, "POST", { "next-action": "abc" }));
  });

  it("un propriétaire direct qui est aussi agent d'une agence : seule son organisation de propriétaire est redirigée", async () => {
    connecter([...PROPRIETAIRE, ...AGENT]);
    expect((await aller(`/agence/${ORG_P}/parc`)).status).toBe(308);
    servieTelleQuelle(await aller(`/agence/${ORG_A}/parc`));
  });
});

describe("D27 — /espace/<id> est réécrit vers /agence/<id> pour le propriétaire direct", () => {
  it.each([
    [`/espace/${ORG_P}`, `/agence/${ORG_P}`],
    [`/espace/${ORG_P}/loyers?annee=2026`, `/agence/${ORG_P}/loyers?annee=2026`],
    [`/espace/${ORG_P}/parc/b1/lots/l1`, `/agence/${ORG_P}/parc/b1/lots/l1`],
    [`/espace/${ORG_P}/documents/d1/fichier`, `/agence/${ORG_P}/documents/d1/fichier`],
    [`/espace/${ORG_P.toUpperCase()}/parc`, `/agence/${ORG_P}/parc`],
  ])("%s est servi par %s, sans changer l'adresse affichée", async (de, vers) => {
    connecter(PROPRIETAIRE);
    const r = await aller(de);
    expect(r.status).toBe(200);
    expect(r.headers.get("location")).toBeNull();
    const cible = new URL(reecritVers(r)!);
    expect(cible.pathname + cible.search).toBe(vers);
  });

  it("une action serveur postée sur l'alias est réécrite aussi (les envois ne sont pas cassés)", async () => {
    connecter(PROPRIETAIRE);
    const r = await aller(`/espace/${ORG_P}/parc`, "POST", { "next-action": "abc" });
    expect(r.status).toBe(200);
    expect(new URL(reecritVers(r)!).pathname).toBe(`/agence/${ORG_P}/parc`);
    // Les en-têtes de la requête (dont celui de l'action) sont transmis à la page réécrite.
    expect(r.headers.get("x-middleware-request-next-action")).toBe("abc");
  });

  it("la réécriture garde les cookies de session et l'adresse demandée pour la trace de traversée", async () => {
    connecter(PROPRIETAIRE);
    const r = await aller(`/espace/${ORG_P}/parc`);
    expect(r.cookies.get(ACTIVITY_COOKIE)?.value).toBeTruthy();
    expect(r.headers.get("x-middleware-request-x-gerimmo-chemin")).toBe(`/espace/${ORG_P}/parc`);
  });
});

describe("D27 — les agences restent sous /agence, inchangées", () => {
  it.each([["administrateur d'agence", ADMIN_AGENCE], ["agent", AGENT]] as const)("%s : /agence/<agence> servi tel quel, en lecture comme en envoi", async (_, adhesions) => {
    connecter(adhesions);
    servieTelleQuelle(await aller(`/agence/${ORG_A}/parc`));
    servieTelleQuelle(await aller(`/agence/${ORG_A}`));
    servieTelleQuelle(await aller(`/agence/${ORG_A}/mandats`, "POST"));
  });
});

describe("D27 — l'adresse d'un autre profil n'est pas atteignable par l'alias", () => {
  it("un administrateur d'agence ne lit pas SON agence sous /espace", async () => {
    connecter(ADMIN_AGENCE);
    introuvable(await aller(`/espace/${ORG_A}`));
    introuvable(await aller(`/espace/${ORG_A}/parc`));
    introuvable(await aller(`/espace/${ORG_A}/mandats`, "POST"));
  });

  it("un agent non plus", async () => {
    connecter(AGENT);
    introuvable(await aller(`/espace/${ORG_A}/parc`));
  });

  it("un propriétaire direct ne lit pas l'espace d'un AUTRE propriétaire sous /espace, ni une agence, ni une organisation inexistante", async () => {
    connecter(PROPRIETAIRE);
    introuvable(await aller(`/espace/${ORG_Q}`));
    introuvable(await aller(`/espace/${ORG_Q}/parc`));
    introuvable(await aller(`/espace/${ORG_Q}/loyers`, "POST"));
    introuvable(await aller(`/espace/${ORG_A}/parc`));
    introuvable(await aller(`/espace/${ORG_INEXISTANTE}/parc`));
  });

  it("la lecture du type est bornée au compte connecté, à l'organisation demandée et aux adhésions actives", async () => {
    connecter(PROPRIETAIRE);
    await aller(`/espace/${ORG_Q}/parc`);
    const lectureDuType = mocks.lectures.find((l) => l.colonnes.includes("organisation:organizations(type)"));
    expect(lectureDuType?.table).toBe("memberships");
    expect([...lectureDuType!.filtres].sort()).toEqual([["account_id", MOI], ["organization_id", ORG_Q], ["status", "active"]]);
    // Pas de lecture directe de l'organisation hors supervision.
    expect(mocks.lectures.some((l) => l.table === "organizations")).toBe(false);
  });

  it("le propriétaire d'un AUTRE compte ne compte pas, ni une adhésion suspendue", async () => {
    connecter([ligne("proprietaire_direct", ORG_P, "active", "un-autre-compte"), ligne("proprietaire_direct", ORG_Q, "inactive")]);
    introuvable(await aller(`/espace/${ORG_P}/parc`));
    introuvable(await aller(`/espace/${ORG_Q}/parc`));
  });

  it("l'ancienne adresse d'un autre propriétaire n'est pas redirigée (la garde de la page renvoie vers « Mes espaces »)", async () => {
    connecter(PROPRIETAIRE);
    servieTelleQuelle(await aller(`/agence/${ORG_Q}/parc`));
  });

  it("un locataire de ce propriétaire n'ouvre pas ses écrans de gestion sous /espace", async () => {
    connecter(LOCATAIRE_DE_P);
    introuvable(await aller(`/espace/${ORG_P}/parc`));
    servieTelleQuelle(await aller(`/agence/${ORG_P}/parc`));
  });

  it("aucune adhésion active : introuvable", async () => {
    connecter([]);
    introuvable(await aller(`/espace/${ORG_P}`));
  });

  it("un identifiant qui n'est pas un UUID n'est jamais réécrit, et l'alias n'existe pas sans le proxy", async () => {
    connecter(PROPRIETAIRE);
    const r = await aller("/espace/alpha/parc");
    expect(reecritVers(r)).toBeNull();
    const dossiers = readdirSync(path.resolve(__dirname, "../src/app"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    expect(dossiers).not.toContain("espace");
  });

  it("une lecture du type en échec ne réécrit ni ne redirige rien", async () => {
    connecter(PROPRIETAIRE);
    const client = mocks.client();
    mocks.client.mockReturnValue({
      ...client,
      from: (table: string) => {
        const q = client.from(table);
        return {
          ...q,
          select: (liste: string) => {
            if (!liste.includes("organisation:organizations")) return q.select(liste);
            const enPanne = { eq: () => enPanne, then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: "panne" } }).then(resolve) };
            return enPanne;
          },
        };
      },
    });
    introuvable(await aller(`/espace/${ORG_P}/parc`));
    servieTelleQuelle(await aller(`/agence/${ORG_P}/parc`));
  });
});

describe("D27 — la supervision traverse les deux racines", () => {
  it("l'espace d'un propriétaire direct : /agence redirigé, /espace réécrit", async () => {
    connecter(SUPERVISION);
    expect((await aller(`/agence/${ORG_P}/parc`)).status).toBe(308);
    expect(new URL(reecritVers(await aller(`/espace/${ORG_P}/parc`))!).pathname).toBe(`/agence/${ORG_P}/parc`);
    // Une lecture de l'organisation par requête, bornée à l'organisation demandée.
    expect(mocks.lectures.filter((l) => l.table === "organizations").map((l) => l.filtres)).toEqual([[["id", ORG_P]], [["id", ORG_P]]]);
  });

  it("une agence : /agence inchangé, /espace introuvable ; une organisation inexistante : introuvable", async () => {
    connecter(SUPERVISION);
    servieTelleQuelle(await aller(`/agence/${ORG_A}/parc`));
    introuvable(await aller(`/espace/${ORG_A}/parc`));
    introuvable(await aller(`/espace/${ORG_INEXISTANTE}/parc`));
  });
});

// ── POINT DE SÉCURITÉ : les gardes du proxy sont INCHANGÉES ─────────────────────────────────────────────────────────

describe("D27 — les gardes du proxy sont inchangées : la lecture qui les décide est la même qu'avant", () => {
  it.each([`/espace/${ORG_P}/parc`, `/agence/${ORG_P}/parc`, `/agence/${ORG_A}/parc`, "/espaces", "/admin/brief"])(
    "%s : la première lecture est « role » des adhésions actives du compte connecté, sans autre filtre",
    async (chemin) => {
      connecter(PROPRIETAIRE);
      await aller(chemin);
      expect(mocks.lectures[0].table).toBe("memberships");
      expect(mocks.lectures[0].colonnes).toBe("role");
      expect([...mocks.lectures[0].filtres].sort()).toEqual([["account_id", MOI], ["status", "active"]]);
    },
  );

  it("hors des adresses de gestion, aucune lecture de plus", async () => {
    for (const chemin of ["/espaces", "/compte", "/locataire/" + ORG_P, "/assistance"]) {
      connecter(PROPRIETAIRE);
      await aller(chemin);
      expect(mocks.lectures.map((l) => l.colonnes), chemin).toEqual(["role"]);
    }
  });
});

describe("D27 — la porte de /admin est inchangée (D44) et l'alias n'y mène pas", () => {
  it.each([
    ["propriétaire direct", PROPRIETAIRE],
    ["administrateur d'agence", ADMIN_AGENCE],
    ["agent", AGENT],
    ["locataire", LOCATAIRE_DE_P],
  ] as const)("%s : /admin renvoie vers /espaces, avant toute lecture du type", async (_, adhesions) => {
    for (const chemin of ["/admin", "/admin/brief", `/admin/organisations/${ORG_P}`, "/%61dmin/brief"]) {
      connecter(adhesions);
      const r = await aller(chemin);
      expect(r.status, chemin).toBe(307);
      expect(lieu(r)!.pathname, chemin).toBe("/espaces");
      expect(r.headers.get("x-middleware-next"), chemin).toBeNull();
      expect(mocks.lectures.map((l) => l.colonnes), chemin).toEqual(["role"]);
    }
  });

  it("une adresse /espace ne contourne pas la porte de /admin (pas de remontée de chemin, aucune réécriture vers /admin)", async () => {
    connecter(PROPRIETAIRE);
    for (const chemin of [`/espace/${ORG_P}/../admin/brief`, `/espace/${ORG_P}/%2e%2e/%2e%2e/admin`]) {
      const r = await aller(chemin);
      const cible = reecritVers(r);
      if (cible) expect(new URL(cible).pathname.toLowerCase(), chemin).not.toMatch(/^\/admin/);
      if (lieu(r)) expect(lieu(r)!.pathname, chemin).toBe("/espaces");
    }
  });

  it("le super-administrateur avec second facteur passe toujours sur /admin", async () => {
    connecter(SUPERVISION);
    const r = await aller("/admin/brief");
    expect(r.headers.get("location")).toBeNull();
    expect(r.headers.get("x-middleware-next")).toBe("1");
  });
});

describe("D27 — le second facteur est inchangé : un super-administrateur sans second facteur va à /securite", () => {
  it.each([`/espace/${ORG_P}/parc`, `/agence/${ORG_P}/parc`, `/agence/${ORG_A}/parc`, `/espace/${ORG_A}/parc`])(
    "%s → /securite?suite=…, avant toute lecture du type ou réécriture",
    async (chemin) => {
      connecter(SUPERVISION, { niveau: "aal1" });
      const r = await aller(chemin);
      expect(r.status).toBe(307);
      expect(lieu(r)!.pathname).toBe("/securite");
      expect(lieu(r)!.searchParams.get("suite")).toBe(chemin);
      expect(reecritVers(r)).toBeNull();
      expect(mocks.lectures.map((l) => l.colonnes)).toEqual(["role"]);
    },
  );

  it("un propriétaire direct qui est aussi super-administrateur sans second facteur : /securite aussi, pas /espace", async () => {
    connecter([...PROPRIETAIRE, ...SUPERVISION], { niveau: "aal1" });
    const r = await aller(`/agence/${ORG_P}/parc`);
    expect(lieu(r)!.pathname).toBe("/securite");
  });
});

describe("D27 — l'expiration de session est inchangée sur les deux racines", () => {
  const HIER = new Date(Date.now() - 48 * 3600 * 1000).toISOString();

  it.each([`/espace/${ORG_P}/loyers?annee=2026`, `/agence/${ORG_P}/loyers?annee=2026`])(
    "%s : session expirée → déconnexion, /connexion?raison=session-expiree avec la destination, avant toute lecture du type",
    async (chemin) => {
      connecter(PROPRIETAIRE, { derniereConnexion: HIER });
      const r = await aller(chemin);
      expect(mocks.signOut).toHaveBeenCalledTimes(1);
      expect(r.status).toBe(307);
      expect(lieu(r)!.pathname).toBe("/connexion");
      expect(lieu(r)!.searchParams.get("raison")).toBe("session-expiree");
      expect(lieu(r)!.searchParams.get("suite")).toBe(chemin);
      expect(reecritVers(r)).toBeNull();
      expect(mocks.lectures.map((l) => l.colonnes)).toEqual(["role"]);
    },
  );

  it("session expirée sur un envoi : 303, jamais rejoué", async () => {
    connecter(PROPRIETAIRE, { derniereConnexion: HIER });
    const r = await aller(`/espace/${ORG_P}/loyers`, "POST", { "next-action": "abc" });
    expect(r.status).toBe(303);
    expect(lieu(r)!.pathname).toBe("/connexion");
  });

  it("sans session, /espace mène à la connexion (307 en GET, 303 en POST) et mémorise l'adresse demandée", async () => {
    sansSession();
    const get = await aller(`/espace/${ORG_P}/loyers?annee=2026`);
    expect(get.status).toBe(307);
    expect(get.headers.get("location")).toContain(`/connexion?suite=${encodeURIComponent(`/espace/${ORG_P}/loyers?annee=2026`)}`);
    expect((await aller(`/espace/${ORG_P}/loyers`, "POST")).status).toBe(303);
  });

  it("sans session, l'ancienne adresse mène à la connexion avec la même destination (redirigée après la connexion)", async () => {
    sansSession();
    const r = await aller(`/agence/${ORG_P}/loyers`);
    expect(r.headers.get("location")).toContain(`/connexion?suite=${encodeURIComponent(`/agence/${ORG_P}/loyers`)}`);
  });

  it("sans session, /espace n'est pas déclaré introuvable (c'est une adresse privée qui existe)", async () => {
    sansSession();
    expect((await aller("/espace/x")).status).not.toBe(404);
  });
});

describe("D27 — les robots n'indexent pas l'alias", () => {
  it("/espace est fermé aux robots, comme /agence", () => {
    const r = robots();
    const regle = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    const interdits = ([] as string[]).concat(regle.disallow ?? []);
    expect(interdits).toContain("/espace");
    expect(interdits).toContain("/agence");
  });
});

/**
 * La première réalisation de D27 (14/10) a relevé que `next start` RAPPELAIT le proxy sur l'adresse réécrite
 * (« invoking middleware /espace/<id>/parc » puis « invoking middleware /agence/<id>/parc », avec pour en-têtes ceux que
 * la première réponse a posés). La sonde du 15/10 (Next.js 16.3.8) n'en voit plus qu'une passe ; la protection reste,
 * pour une version ou un hébergement qui rappellerait le proxy : sans elle, la seconde passe redirigerait l'adresse
 * /agence d'un propriétaire direct vers /espace, boucle sans fin. On rejoue ici la seconde passe comme Next.js la ferait.
 */
function rappelerCommeNext(reponse: Response, methode = "GET"): Promise<Response> {
  const cible = new URL(reponse.headers.get("x-middleware-rewrite")!);
  const entetes = new Headers();
  const poses = reponse.headers.get("x-middleware-override-headers");
  for (const cle of poses ? poses.split(",").map((c) => c.trim()) : []) {
    const valeur = reponse.headers.get(`x-middleware-request-${cle}`);
    if (valeur !== null) entetes.set(cle, valeur);
  }
  return proxy(new NextRequest(cible, { method: methode, headers: entetes }));
}

describe("D27 — Next.js rappelle le proxy sur l'adresse réécrite : aucune boucle de redirection", () => {
  it.each(["GET", "HEAD", "POST"])("%s /espace/<id>/parc : la seconde passe, sur /agence/<id>/parc, sert la page", async (methode) => {
    connecter(PROPRIETAIRE);
    const premiere = await aller(`/espace/${ORG_P}/parc`, methode);
    expect(new URL(reecritVers(premiere)!).pathname).toBe(`/agence/${ORG_P}/parc`);
    servieTelleQuelle(await rappelerCommeNext(premiere, methode));
  });

  it("la seconde passe garde la requête et le chemin, et ne réécrit pas une deuxième fois", async () => {
    connecter(PROPRIETAIRE);
    const premiere = await aller(`/espace/${ORG_P}/loyers?annee=2026&mois=9`);
    expect(new URL(reecritVers(premiere)!).search).toBe("?annee=2026&mois=9");
    servieTelleQuelle(await rappelerCommeNext(premiere));
  });

  it("la supervision d'un propriétaire direct traverse aussi les deux passes", async () => {
    connecter(SUPERVISION);
    servieTelleQuelle(await rappelerCommeNext(await aller(`/espace/${ORG_P}/parc`)));
  });

  it("la marque ne dispense de rien : sans session, la seconde passe renvoie encore à la connexion", async () => {
    connecter(PROPRIETAIRE);
    const premiere = await aller(`/espace/${ORG_P}/parc`);
    sansSession();
    const seconde = await rappelerCommeNext(premiere);
    expect(seconde.status).toBe(307);
    expect(lieu(seconde)!.pathname).toBe("/connexion");
  });

  it("la marque ne dispense de rien : session expirée entre les deux passes, la seconde déconnecte", async () => {
    connecter(PROPRIETAIRE);
    const premiere = await aller(`/espace/${ORG_P}/parc`);
    connecter(PROPRIETAIRE, { derniereConnexion: new Date(Date.now() - 48 * 3600 * 1000).toISOString() });
    const seconde = await rappelerCommeNext(premiere);
    expect(lieu(seconde)!.pathname).toBe("/connexion");
    expect(lieu(seconde)!.searchParams.get("raison")).toBe("session-expiree");
  });

  it("la marque ne vaut que pour l'organisation réécrite", async () => {
    connecter(PROPRIETAIRE);
    const premiere = await aller(`/espace/${ORG_P}/parc`);
    expect(premiere.headers.get("x-middleware-request-x-gerimmo-alias-espace")).toBe(ORG_P);
    // L'organisation d'un autre : aucune redirection (comme sans marque), la garde de la page tranche.
    servieTelleQuelle(await aller(`/agence/${ORG_Q}/parc`, "GET", { "x-gerimmo-alias-espace": ORG_P }));
    // Pour SON organisation, la marque d'une autre organisation ne dispense pas de la redirection.
    expect((await aller(`/agence/${ORG_P}/parc`, "GET", { "x-gerimmo-alias-espace": ORG_Q })).status).toBe(308);
  });

  it("une marque forgée par un visiteur n'ouvre rien : ni l'alias d'un autre, ni la porte de /admin, ni la connexion", async () => {
    connecter(ADMIN_AGENCE);
    introuvable(await aller(`/espace/${ORG_P}/parc`, "GET", { "x-gerimmo-alias-espace": ORG_P }));
    const admin = await aller("/admin/brief", "GET", { "x-gerimmo-alias-espace": ORG_P });
    expect(lieu(admin)!.pathname).toBe("/espaces");
    sansSession();
    expect((await aller(`/agence/${ORG_P}/parc`, "GET", { "x-gerimmo-alias-espace": ORG_P })).status).toBe(307);
  });
});
