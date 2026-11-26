/**
 * Reprise du lot L4 (26/11/2026), point « poids » de la relecture : la santé du service (lib/sante-service.ts) importait
 * lib/ouverture-signatures.ts, donc lib/signature-bail.ts (modèles de documents, node:crypto) et lib/zoho-sign.ts, pour
 * une seule lecture de réglages. Cette lecture vit désormais dans lib/reglages-signature.ts, module léger que les deux
 * lisent. Ce fichier vérifie :
 *  — que la connexion lue par le module léger dit exactement ce que disait `configurationSuiviSignatureBail`, sur toutes
 *    les combinaisons des variables qu'elle lit (comportement inchangé) ;
 *  — que ni la santé ni la rubrique des signatures n'atteignent plus ces modules lourds, même par un import indirect.
 * Aucune clé réelle : des valeurs fictives.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { configurationSuiviSignatureBail } from "@/lib/signature-bail";
import { connexionSignatureProduction, motifFermetureSelonReglages } from "@/lib/reglages-signature";
import { DOCUMENTS_ZOHO, type ModeleSignature } from "@/lib/politique-signature";

const RACINE = path.resolve(__dirname, "..");

describe("connexion Zoho de production : même réponse que configurationSuiviSignatureBail", () => {
  const PRESTATAIRES = [undefined, "", "zoho", "youtrust", "autre"];
  const ENVIRONNEMENTS = [undefined, "", "sandbox", "production", "Production", " production", "prod"];
  const CLES = [undefined, "", "  ", "fictif"];
  const SUPABASE = [undefined, "http://127.0.0.1:54321", "https://projet-fictif.supabase.co", "pas une adresse"];
  const VERCEL = [undefined, "1"];

  it("sur toutes les combinaisons de prestataire, environnement, clés, adresse de la base et déploiement", () => {
    let essais = 0;
    const ecarts: string[] = [];
    for (const prestataire of PRESTATAIRES) for (const environnement of ENVIRONNEMENTS)
      for (const id of CLES) for (const secret of CLES) for (const jeton of CLES) for (const retour of CLES)
        for (const supabase of SUPABASE) for (const vercel of VERCEL) {
          const env = {
            SIGNATURE_BAIL_PRESTATAIRE: prestataire, ZOHO_SIGN_ENV: environnement, ZOHO_SIGN_CLIENT_ID: id,
            ZOHO_SIGN_CLIENT_SECRET: secret, ZOHO_SIGN_REFRESH_TOKEN: jeton, ZOHO_SIGN_WEBHOOK_SECRET: retour,
            NEXT_PUBLIC_SUPABASE_URL: supabase, VERCEL: vercel,
          };
          essais++;
          const attendu = configurationSuiviSignatureBail(env)?.environnement === "production";
          if (connexionSignatureProduction(env) !== attendu) ecarts.push(JSON.stringify(env));
        }
    expect(essais).toBe(5 * 7 * 4 ** 4 * 4 * 2);
    expect(ecarts).toEqual([]);
  });

  it("l'ancienne règle des motifs, réécrite avec configurationSuiviSignatureBail, donne les mêmes motifs pour chaque modèle", () => {
    // Texte de lib/ouverture-signatures.ts avant la reprise (commit edfe721), à l'appel de connexion près.
    const ancienne = (code: ModeleSignature, env: Record<string, string | undefined>) => {
      const connexion = configurationSuiviSignatureBail(env)?.environnement === "production";
      const valeur = (env.ZOHO_SIGN_CAUTIONNEMENT_FERME ?? "").trim();
      return (code === "cautionnement" && (valeur === "1" || valeur === "true") ? "fermé" : null)
        ?? (!connexion ? "Connexion Zoho à configurer" : null)
        ?? (env.ZOHO_SIGN_BAIL_ACTIF !== "true" ? "Envoi des baux désactivé" : null)
        ?? (code !== "bail" && env.ZOHO_SIGN_DOCUMENTS_ACTIF !== "true" ? "Envoi des autres actes désactivé" : null)
        ?? (code === "devis_artisan" && env.ZOHO_SIGN_DEVIS_ACTIF !== "true" ? "Envoi des devis désactivé" : null);
    };
    const CONNEXION = { ZOHO_SIGN_ENV: "production", ZOHO_SIGN_CLIENT_ID: "fictif", ZOHO_SIGN_CLIENT_SECRET: "fictif", ZOHO_SIGN_REFRESH_TOKEN: "fictif", ZOHO_SIGN_WEBHOOK_SECRET: "fictif" };
    const OUI_NON = [undefined, "true", "false"];
    for (const code of Object.keys(DOCUMENTS_ZOHO) as ModeleSignature[])
      for (const connexion of [CONNEXION, { ...CONNEXION, ZOHO_SIGN_ENV: "sandbox" }, {}])
        for (const ferme of [undefined, "1", "true", "non"]) for (const bail of OUI_NON) for (const documents of OUI_NON) for (const devis of OUI_NON) {
          const env = { ...connexion, ZOHO_SIGN_CAUTIONNEMENT_FERME: ferme, ZOHO_SIGN_BAIL_ACTIF: bail, ZOHO_SIGN_DOCUMENTS_ACTIF: documents, ZOHO_SIGN_DEVIS_ACTIF: devis };
          const motif = motifFermetureSelonReglages(code, env);
          const avant = ancienne(code, env);
          expect(avant === "fermé" ? motif?.startsWith("L’envoi en signature électronique de l’acte de cautionnement est suspendu") : motif === avant, `${code} ${JSON.stringify(env)}`).toBe(true);
        }
  });
});

/** Les imports de valeur d'un fichier (les `import type` / `export type` sont effacés à la compilation). */
function importsDe(fichier: string): string[] {
  const source = readFileSync(fichier, "utf8");
  const specs: string[] = [];
  for (const m of source.matchAll(/^\s*(?:import|export)\s+(type\s+)?(?:[^'";]*?\s+from\s+)?["']([^"']+)["']/gm)) if (!m[1]) specs.push(m[2]);
  for (const m of source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) specs.push(m[1]);
  return specs;
}
function resoudre(depuis: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(RACINE, "src", spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(depuis), spec) : null;
  if (!base) return null;
  for (const candidat of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")])
    if (existsSync(candidat) && /\.tsx?$/.test(candidat)) return candidat;
  throw new Error(`Import introuvable : ${spec} depuis ${path.relative(RACINE, depuis)}`);
}
/** Tout ce que charge un module, de proche en proche : fichiers du projet et paquets. */
function grapheDe(entree: string): { fichiers: Set<string>; paquets: Set<string> } {
  const fichiers = new Set<string>(), paquets = new Set<string>();
  const pile = [path.join(RACINE, entree)];
  while (pile.length) {
    const f = pile.pop()!;
    if (fichiers.has(f)) continue;
    fichiers.add(f);
    for (const spec of importsDe(f)) {
      const cible = resoudre(f, spec);
      if (cible) pile.push(cible); else paquets.add(spec);
    }
  }
  return { fichiers: new Set([...fichiers].map((f) => path.relative(RACINE, f).split(path.sep).join("/"))), paquets };
}

describe("poids : la santé et la rubrique des signatures ne chargent plus la signature des baux", () => {
  const LOURDS = ["src/lib/signature-bail.ts", "src/lib/zoho-sign.ts", "src/lib/signature-prestataire.ts", "src/lib/documents/modeles/index.ts", "src/lib/documents/modeles/communs.ts"];

  it("le relevé des imports voit bien les imports d'un module (garde du test lui-même)", () => {
    expect([...grapheDe("src/lib/signature-bail.ts").fichiers]).toEqual(expect.arrayContaining(["src/lib/zoho-sign.ts", "src/lib/documents/modeles/index.ts"]));
    expect(grapheDe("src/lib/signature-bail.ts").paquets.has("node:crypto")).toBe(true);
  });

  it.each(["src/lib/sante-service.ts", "src/lib/ouverture-signatures.ts", "src/lib/reglages-signature.ts"])("%s", (entree) => {
    const { fichiers, paquets } = grapheDe(entree);
    expect(LOURDS.filter((f) => fichiers.has(f))).toEqual([]);
    expect([...fichiers].filter((f) => f.startsWith("src/lib/documents/"))).toEqual([]);
    expect([...paquets].filter((p) => /^(node:)?crypto$|^libphonenumber-js/.test(p))).toEqual([]);
  });

  it("le module léger ne charge que les interrupteurs (la liste des modèles n'y est qu'un type)", () => {
    expect([...grapheDe("src/lib/reglages-signature.ts").fichiers].sort()).toEqual(["src/lib/reglages-signature.ts", "src/lib/signature-interrupteurs.ts"]);
  });
});
