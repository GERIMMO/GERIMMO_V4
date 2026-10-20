/**
 * Les sous-traitants que le code utilise sont ceux que les pages légales
 * déclarent (audit 25/09, C2). Le code envoyait des données à Yousign, OpenAI
 * et Meta sans les nommer — infraction RGPD dès le premier visiteur.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CHAMPS_PRESTATAIRES, PRESTATAIRES, cleCoordonnees, cleLocalisation } from "../src/lib/editeur";
import { CHAMPS_EDITEUR } from "../src/lib/identite-editeur";

const SRC = path.resolve(__dirname, "..", "src");
const lire = (p: string) => fs.readFileSync(path.join(SRC, p), "utf8");
const lireApp = (p: string) => fs.readFileSync(path.resolve(__dirname, "..", p), "utf8");

describe("PRESTATAIRES", () => {
  it("nomme chaque prestataire auquel le code envoie des données", () => {
    const attendus: [string, string][] = [
      ["Supabase", "lib/supabase/service.ts"],
      ["Stripe", "lib/stripe.ts"],
      ["Resend", "lib/email.ts"],
      ["Zoho Sign", "lib/zoho-sign.ts"],
      ["OpenAI", "lib/visuel-marketing.ts"],
      ["Meta", "lib/facebook.ts"],
    ];
    for (const [nom, fichier] of attendus) {
      expect(fs.existsSync(path.join(SRC, fichier))).toBe(true);
      expect(PRESTATAIRES.some((p) => p.nom.includes(nom))).toBe(true);
    }
  });

  it("dit pour chacun ce qui lui est transmis, en une phrase lisible", () => {
    for (const p of PRESTATAIRES) {
      expect(p.role.length).toBeGreaterThan(15);
      expect(p.role).not.toMatch(/undefined|null/);
    }
  });

  it("nomme les transferts hors UE au lieu de les taire", () => {
    const openai = PRESTATAIRES.find((p) => p.nom === "OpenAI")!;
    expect(openai.localisation).toMatch(/États-Unis/);
    // La page confidentialité ne prétend plus que TOUT est hébergé dans l'UE.
    expect(lire("app/confidentialite/page.tsx")).toMatch(/hors de\s+l&apos;Union/);
  });
});

// 19/10 : la localisation de la Base Adresse Nationale et les coordonnées de chaque prestataire se saisissent dans
// /admin/parametres. La base n'admet que des clés connues (contrainte `identite_champs_connus`, liste fermée) : la
// migration doit ouvrir EXACTEMENT les clés du formulaire, sinon le premier enregistrement est refusé.
const MIGRATION = "20261019123000_identite_editeur_prestataires";
describe("prestataires saisissables (19/10) : clés du formulaire et de la base", () => {
  it("chaque prestataire a une clé propre, lisible et unique", () => {
    const cles = PRESTATAIRES.map((p) => p.cle);
    for (const c of cles) expect(c).toMatch(/^[a-z][a-zA-Z]*$/);
    expect(new Set(cles).size).toBe(cles.length);
  });

  it("le formulaire offre une clé de coordonnées par prestataire, et une clé de localisation pour ceux que le code ne localise pas", () => {
    for (const p of PRESTATAIRES) {
      expect(CHAMPS_EDITEUR).toHaveProperty(cleCoordonnees(p));
      expect((CHAMPS_EDITEUR as Record<string, string>)[cleCoordonnees(p)]).toContain(p.nom);
      // Un séparateur plutôt qu'une seconde parenthèse : « GitHub (Actions) (dénomination, …) » se lisait mal (relecture du 19/10).
      expect((CHAMPS_EDITEUR as Record<string, string>)[cleCoordonnees(p)]).toBe(`Coordonnées de ${p.nom} : dénomination, adresse, téléphone`);
      if (p.localisation) expect(CHAMPS_EDITEUR).not.toHaveProperty(cleLocalisation(p));
      else expect((CHAMPS_EDITEUR as Record<string, string>)[cleLocalisation(p)]).toBe(`Localisation de ${p.nom} : pays ou région des serveurs`);
    }
    for (const libelle of Object.values(CHAMPS_PRESTATAIRES)) expect(libelle).not.toMatch(/\) \(/);
    expect(Object.keys(CHAMPS_PRESTATAIRES)).toHaveLength(PRESTATAIRES.length + PRESTATAIRES.filter((p) => !p.localisation).length);
    // Les hébergeurs d'abord : l'ordre des champs est celui du tableau des pages légales.
    expect(Object.keys(CHAMPS_PRESTATAIRES).filter((k) => k.startsWith("coordonnees")).slice(0, 2)).toEqual(["coordonneesSupabase", "coordonneesVercel"]);
  });

  it("la migration ouvre la liste fermée des clés à exactement celles du formulaire, porte la borne à 40 000 octets et ferme les fonctions à anon", () => {
    const sql = lireApp(`supabase/migrations/${MIGRATION}.sql`);
    const listes = [...sql.matchAll(/array\[([^\]]+)\]::text\[\]/g)].map((m) => [...m[1].matchAll(/'([A-Za-z]+)'/g)].map((c) => c[1]));
    expect(listes).toHaveLength(1);
    expect(listes[0]).toEqual(Object.keys(CHAMPS_EDITEUR));
    expect(sql).toMatch(/octet_length\(valeurs::text\)\s*<\s*40000/);
    expect(sql).toMatch(/^select public\.fermer_fonctions_a_anon\(\);\s*$/m);
    expect(sql).toContain("lock_timeout");
  });

  it("le retour arrière nomme les clés nouvelles, refuse d'en retirer une saisie, et retire sa seule version", () => {
    const sql = lireApp(`supabase/retours-arriere/${MIGRATION}.retour.sql`);
    for (const k of Object.keys(CHAMPS_PRESTATAIRES)) expect(sql).toContain(`'${k}'`);
    expect(sql).toMatch(/raise exception 'Retour refusé/);
    expect(sql).toContain("delete from supabase_migrations.schema_migrations where version = '20261019123000'");
    // Il se joue dans une transaction externe, comme 20261018231827, dans la chaîne « Ordre complet » (après 20261019124000,
    // avant 20261018231827).
    expect(sql).not.toMatch(/^begin;$/m);
    expect(sql).not.toMatch(/^commit;$/m);
  });

  it("la migration est au manifeste une seule fois, après la dernière appliquée en production, et son retour est au LISEZ-MOI, dans la chaîne « Ordre complet » après 20261019124000 et avant 20261018231827", () => {
    const manifeste = lireApp("e2e/local/ordre-migrations.txt").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${MIGRATION}.sql`)).toHaveLength(1);
    expect(manifeste.indexOf(`${MIGRATION}.sql`)).toBeGreaterThan(manifeste.indexOf("20261018231827_abonnement_jour_paris.sql"));
    const lisezMoi = lireApp("supabase/retours-arriere/LISEZ-MOI.md");
    expect(lisezMoi).toContain(`${MIGRATION}.retour.sql`);
    // Ordre relatif, pas « en tête » : la chaîne s'ouvre par le dernier retour intégré (20261019124000 depuis le 19/10).
    const chaine = lisezMoi.match(/Ordre complet si tout doit être défait :([\s\S]*?)puis `500000`/)?.[1] ?? "";
    const codes = [...chaine.matchAll(/`(\d{14}|\d{6})`/g)].map((m) => m[1]);
    const position = (code: string) => {
      const i = codes.indexOf(code);
      expect(i, `${code} : absent de la chaîne`).toBeGreaterThanOrEqual(0);
      return i;
    };
    expect(position("20261019123000")).toBeGreaterThan(position("20261019124000"));
    expect(position("20261019123000")).toBeLessThan(position("20261018231827"));
  });
});
