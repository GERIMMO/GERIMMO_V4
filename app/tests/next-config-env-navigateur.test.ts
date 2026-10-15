/**
 * X03 (relecture) — le navigateur reçoit l'environnement de production SANS réglage du tableau de bord Vercel.
 *
 * Constat : `cookies.ts` lit `process.env.VERCEL_ENV || process.env.NEXT_PUBLIC_VERCEL_ENV`. Dans le code du navigateur,
 * `VERCEL_ENV` n'existe pas (seules les variables `NEXT_PUBLIC_*` sont incorporées au code) et `NEXT_PUBLIC_VERCEL_ENV` n'existe
 * que si le projet coche « exposer les variables système ». Sinon, et si `NEXT_PUBLIC_SITE_URL` est absente ou en http, le
 * client navigateur réécrit le cookie de session SANS `Secure` : le défaut AUD-B-03 subsistait de ce côté (le serveur et le proxy,
 * eux, lisent `VERCEL_ENV` à l'exécution et posent `Secure`).
 *
 * Correction : `next.config.ts` déclare `env.NEXT_PUBLIC_VERCEL_ENV`, dérivée de `VERCEL_ENV` (présente pendant la construction
 * sur Vercel). Le navigateur reçoit ainsi la valeur dans son code, quel que soit le réglage du tableau de bord.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

type Env = { vercel?: string; vercelPublic?: string };

/** Charge la configuration comme le fait la construction : avec les variables de l'environnement de construction. */
async function configurationConstruite(env: Env) {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv("VERCEL_ENV", env.vercel ?? "");
  vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", env.vercelPublic ?? "");
  return (await import("../next.config")).default;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("X03 — next.config.ts transmet l'environnement de production au navigateur", () => {
  it("production Vercel à la construction : NEXT_PUBLIC_VERCEL_ENV vaut « production »", async () => {
    const config = await configurationConstruite({ vercel: "production" });
    expect(config.env?.NEXT_PUBLIC_VERCEL_ENV).toBe("production");
  });

  it("prévisualisation et développement Vercel : la valeur est transmise telle quelle (rien de plus strict)", async () => {
    expect((await configurationConstruite({ vercel: "preview" })).env?.NEXT_PUBLIC_VERCEL_ENV).toBe("preview");
    expect((await configurationConstruite({ vercel: "development" })).env?.NEXT_PUBLIC_VERCEL_ENV).toBe("development");
  });

  it("construction hors Vercel (banc, CI) : chaîne vide, le cookie reste lisible en http", async () => {
    const config = await configurationConstruite({});
    expect(config.env?.NEXT_PUBLIC_VERCEL_ENV).toBe("");
  });

  it("si le projet expose déjà NEXT_PUBLIC_VERCEL_ENV, la valeur n'est pas écrasée par du vide", async () => {
    const config = await configurationConstruite({ vercelPublic: "production" });
    expect(config.env?.NEXT_PUBLIC_VERCEL_ENV).toBe("production");
  });

  it("VERCEL_ENV, posée par la plateforme elle-même, l'emporte sur une valeur exposée à la main", async () => {
    const config = await configurationConstruite({ vercel: "production", vercelPublic: "preview" });
    expect(config.env?.NEXT_PUBLIC_VERCEL_ENV).toBe("production");
  });
});

describe("X03 — de bout en bout, côté navigateur", () => {
  /**
   * Le navigateur n'a ni VERCEL_ENV ni l'adresse du site : seule la valeur incorporée par la construction (`env` de la
   * configuration) lui parvient. On la rejoue ici : variables de construction → configuration → code du navigateur, où seule
   * NEXT_PUBLIC_VERCEL_ENV existe.
   */
  async function cookieDuNavigateur(construction: Env, site?: string) {
    const config = await configurationConstruite(construction);
    const incorporee = config.env?.NEXT_PUBLIC_VERCEL_ENV as string | undefined;
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", site ?? "");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", incorporee ?? "");
    return (await import("../src/lib/supabase/cookies")).COOKIES_SESSION;
  }

  it("production Vercel, adresse du site absente, réglage « variables système » non coché : Secure", async () => {
    expect((await cookieDuNavigateur({ vercel: "production" })).secure).toBe(true);
  });

  it("production Vercel, adresse du site mal posée en http : Secure quand même", async () => {
    expect((await cookieDuNavigateur({ vercel: "production" }, "http://gerimmo.example")).secure).toBe(true);
  });

  it("banc et CI en http, hors Vercel : le cookie reste lisible (rien ne change)", async () => {
    expect((await cookieDuNavigateur({}, "http://localhost:3100")).secure).toBe(false);
  });

  it("prévisualisation Vercel en http : pas de Secure forcé (décision inchangée)", async () => {
    expect((await cookieDuNavigateur({ vercel: "preview" })).secure).toBe(false);
  });
});
