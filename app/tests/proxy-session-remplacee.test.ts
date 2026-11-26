/**
 * Recette de production n° 58 (25/11/2026) : après « Créer mon espace », le navigateur atterrissait parfois sur
 * /connexion?suite=/espace/<id>. L'action pose la session « mot de passe » (B) puis ferme celle du lien (A, PRO-5). Un
 * préchargement parti avec A, traité par le proxy APRÈS cette fermeture, reçoit de GoTrue « 403 session_not_found » :
 * @supabase/ssr efface alors sb-<ref>-auth-token.0/.1 — les mêmes noms que ceux de B — et cette réponse, arrivée après
 * celle de l'action, emportait B.
 *
 * Le VRAI proxy et la VRAIE bibliothèque @supabase/ssr ; seul GoTrue est simulé, avec la forme exacte de sa réponse en
 * production (403, X-Supabase-Api-Version, code session_not_found). Aucune donnée réelle, aucune valeur affichée.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createChunks } from "@supabase/ssr";
import { proxy } from "../src/proxy";

const URL_SUPABASE = "https://abcdefghijklmnopqrst.supabase.co";
const CLE = "sb-abcdefghijklmnopqrst-auth-token";
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
type Cookie = [string, string];

function sessionFictive(sid: string, expireDans: number) {
  const exp = Math.floor(Date.now() / 1000) + expireDans;
  // Assez grosse pour être découpée en .0/.1, comme les sessions de la production (profil et accord dans le compte).
  const meta = { profil: "x".repeat(1800) };
  const jeton = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "compte-fictif", session_id: sid, exp, user_metadata: meta })}.signature-fictive`;
  return { access_token: jeton, token_type: "bearer", expires_in: expireDans, expires_at: exp, refresh_token: `renouvellement-${sid}`, user: { id: "compte-fictif", aud: "authenticated", user_metadata: meta } };
}
function cookiesDeSession(sid: string, expireDans = 3600): Cookie[] {
  const valeur = "base64-" + Buffer.from(JSON.stringify(sessionFictive(sid, expireDans))).toString("base64url");
  return createChunks(CLE, valeur).map((m) => [m.name, m.value]);
}

const json = (statut: number, corps: unknown) => new Response(JSON.stringify(corps), {
  status: statut, headers: { "content-type": "application/json", "x-supabase-api-version": "2024-01-01" },
});
const sessionFermee = () => json(403, { code: "session_not_found", message: "Session from session_id claim in JWT does not exist" });

function requete(chemin: string, cookies: Cookie[], mode?: string) {
  const headers: Record<string, string> = { cookie: cookies.map(([n, v]) => `${n}=${v}`).join("; ") };
  if (mode) headers["sec-fetch-mode"] = mode;
  return new NextRequest(`https://gerimmo.test${chemin}`, { headers });
}

/** Les noms des cookies sb-* que la réponse efface (Max-Age=0). Jamais une valeur. */
const effaces = (r: Response) => r.headers.getSetCookie()
  .filter((l) => l.startsWith(CLE) && /;\s*max-age=0(;|$)/i.test(l))
  .map((l) => l.split("=")[0]);

/** Le bocal du navigateur : les Set-Cookie appliqués dans l'ordre d'arrivée des réponses. */
function appliquer(bocal: Map<string, string>, lignes: string[]) {
  for (const ligne of lignes) {
    const [nomValeur, ...attributs] = ligne.split(";");
    const i = nomValeur.indexOf("=");
    const [nom, valeur] = [nomValeur.slice(0, i), nomValeur.slice(i + 1)];
    if (attributs.some((a) => /^\s*max-age=0$/i.test(a))) bocal.delete(nom);
    else bocal.set(nom, valeur);
  }
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL_SUPABASE);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "cle-publique-fictive");
  vi.stubEnv("GERIMMO_SESSION_SECRET", "secret-fictif-local");
  vi.stubGlobal("fetch", vi.fn(async (entree: RequestInfo | URL) => {
    if (String(entree) === `${URL_SUPABASE}/auth/v1/user`) return sessionFermee();
    throw new Error(`appel inattendu : ${new URL(String(entree)).pathname}`);
  }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("une requête d'arrière-plan partie avec une session que le serveur vient de fermer", () => {
  const A = cookiesDeSession("session-du-lien");

  it("la session fictive est découpée en deux morceaux, comme en production", () => {
    expect(A.map(([nom]) => nom)).toEqual([`${CLE}.0`, `${CLE}.1`]);
  });

  it.each(["/", "/conditions", "/connexion", "/nimporte-quoi"])("%s : la réponse n'efface pas la session du navigateur", async (chemin) => {
    const r = await proxy(requete(chemin, A, "cors"));
    expect(effaces(r)).toEqual([]);
  });

  it("la page est quand même rendue sans session : les cookies transmis au rendu sont vidés", async () => {
    const r = await proxy(requete("/conditions", A, "cors"));
    const transmis = r.headers.get("x-middleware-request-cookie") ?? "";
    expect(transmis).toContain(`${CLE}.0=`);
    expect(transmis.includes(A[0][1])).toBe(false);
  });

  it("la session posée entre-temps par l'action survit à cette réponse tardive", async () => {
    const B = cookiesDeSession("session-mot-de-passe");
    const bocal = new Map<string, string>(A);
    appliquer(bocal, B.map(([n, v]) => `${n}=${v}; Path=/; Max-Age=34560000; Secure; SameSite=lax`)); // réponse de l'action
    appliquer(bocal, (await proxy(requete("/conditions", A, "cors"))).headers.getSetCookie()); // réponse tardive
    // Les noms, puis l'égalité des valeurs : un échec n'affiche aucune valeur de cookie.
    expect([...bocal.keys()]).toEqual(B.map(([nom]) => nom));
    expect(B.every(([nom, valeur]) => bocal.get(nom) === valeur)).toBe(true);
  });
});

describe("hors arrière-plan, le ménage d'une session fermée est inchangé", () => {
  it.each([["navigation de document", "navigate"], ["sans en-tête Sec-Fetch-Mode", undefined]])("%s : effacée", async (_cas, mode) => {
    const r = await proxy(requete("/conditions", cookiesDeSession("session-du-lien"), mode));
    expect(effaces(r)).toEqual([`${CLE}.0`, `${CLE}.1`]);
  });
});

describe("la session fermée entre la lecture du compte et celle du registre (fermeture par le proxy)", () => {
  /** GoTrue rend encore le compte, puis le registre ne connaît plus la session : le proxy la ferme (signOut local). */
  function fermetureParLeProxy(reponseDeconnexion: () => Response) {
    vi.stubGlobal("fetch", vi.fn(async (entree: RequestInfo | URL) => {
      const { pathname } = new URL(String(entree));
      if (pathname === "/auth/v1/user") return json(200, sessionFictive("session-du-lien", 3600).user);
      if (pathname === "/rest/v1/memberships") return json(200, []);
      if (pathname === "/rest/v1/rpc/ma_session_active") return json(200, []);
      if (pathname === "/auth/v1/logout") return reponseDeconnexion();
      throw new Error(`appel inattendu : ${pathname}`);
    }));
  }

  it.each(["/conditions", "/espaces"])("%s, arrière-plan, fermeture confirmée par Auth : aucun effacement", async (chemin) => {
    fermetureParLeProxy(sessionFermee);
    const r = await proxy(requete(chemin, cookiesDeSession("session-du-lien"), "cors"));
    expect(effaces(r)).toEqual([]);
    if (chemin === "/espaces") expect(r.headers.get("location")).toContain("raison=session-expiree");
  });

  it("arrière-plan, fermeture NON confirmée par Auth (panne) : l'effacement part, comme avant", async () => {
    fermetureParLeProxy(() => json(500, { code: "unexpected_failure", message: "panne simulée" }));
    const r = await proxy(requete("/espaces", cookiesDeSession("session-du-lien"), "cors"));
    expect(effaces(r)).toEqual([`${CLE}.0`, `${CLE}.1`]);
    expect(r.headers.get("location")).toContain("raison=session-expiree");
  });

  it("navigation de document : l'effacement part, comme avant", async () => {
    fermetureParLeProxy(sessionFermee);
    const r = await proxy(requete("/espaces", cookiesDeSession("session-du-lien"), "navigate"));
    expect(effaces(r)).toEqual([`${CLE}.0`, `${CLE}.1`]);
  });
});

describe("le filtre ne retient que les déconnexions", () => {
  it("des jetons renouvelés sont toujours écrits, même sur une requête d'arrière-plan", async () => {
    const neuve = sessionFictive("session-renouvelee", 3600);
    vi.stubGlobal("fetch", vi.fn(async (entree: RequestInfo | URL) => {
      const { pathname } = new URL(String(entree));
      if (pathname === "/auth/v1/token") return json(200, neuve);
      if (pathname === "/auth/v1/user") return json(200, neuve.user);
      if (pathname === "/rest/v1/memberships") return json(200, []);
      if (pathname === "/rest/v1/rpc/ma_session_active") return json(200, [{ id: "session-renouvelee", cree_le: new Date(Date.now() - 60_000).toISOString() }]);
      throw new Error(`appel inattendu : ${pathname}`);
    }));
    // Jeton qui expire dans 30 s : le client le renouvelle de lui-même (marge de 90 s).
    const r = await proxy(requete("/conditions", cookiesDeSession("session-a-renouveler", 30), "cors"));
    const ecrits = r.headers.getSetCookie().filter((l) => l.startsWith(CLE) && !/;\s*max-age=0(;|$)/i.test(l)).map((l) => l.split("=")[0]);
    expect(ecrits.length).toBeGreaterThan(0);
  });
});
