/**
 * Audit final du 27/10 (COD-11) : une seule version majeure de PostgreSQL dans les chantiers GitHub.
 *
 * Trois versions coexistaient : CI et bac à sable Stripe en 18, sauvegarde (pg_dump « même version que le serveur ») et
 * restauration en 17 — la production est donc en 17 —, banc local en 16. Une fonction ou un comportement du planificateur
 * présent en 18 et absent en 17 passait la CI et cassait en production. Ici : l'image `postgres:NN` de chaque chantier et
 * le client installé par les étapes « Client PostgreSQL » portent la même version majeure, celle de la sauvegarde. Le banc
 * local (e2e/local) n'est pas concerné : il utilise le PostgreSQL du poste. Sans base.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CHANTIERS = "../.github/workflows";
const lire = (nom: string) => readFileSync(`${CHANTIERS}/${nom}`, "utf8");
/** La version du serveur de production, lue dans le chantier de sauvegarde (le client pg_dump doit être de sa version). */
const PRODUCTION = /postgresql-client-(\d+)/.exec(lire("sauvegarde.yml"))?.[1];

describe("version de PostgreSQL des chantiers GitHub", () => {
  it("la sauvegarde nomme la version du serveur de production", () => {
    expect(PRODUCTION).toMatch(/^\d{2}$/);
    expect(lire("sauvegarde.yml")).toContain(`Client PostgreSQL ${PRODUCTION} (même version que le serveur)`);
  });

  it.each(["ci.yml", "stripe-bac-a-sable.yml", "restauration-sauvegarde.yml"])("%s démarre un serveur de cette version", (nom) => {
    const images = [...lire(nom).matchAll(/image:\s*postgres:(\d+)/g)].map((m) => m[1]);
    expect(images.length, "aucun service postgres").toBeGreaterThan(0);
    expect(images).toEqual(images.map(() => PRODUCTION));
  });

  it.each(["ci.yml", "restauration-sauvegarde.yml"])("%s installe un client de cette version, et le met seul en tête du PATH", (nom) => {
    const texte = lire(nom);
    const clients = [...texte.matchAll(/postgresql-client-(\d+)/g)].map((m) => m[1]);
    expect(clients.length).toBeGreaterThan(0);
    expect(clients).toEqual(clients.map(() => PRODUCTION));
    const chemins = [...texte.matchAll(/\/usr\/lib\/postgresql\/(\d+)\/bin/g)].map((m) => m[1]);
    expect(chemins).toEqual(chemins.map(() => PRODUCTION));
    expect(texte).not.toMatch(new RegExp(`PostgreSQL (?!${PRODUCTION}\\b)\\d{2}`));
  });
});
