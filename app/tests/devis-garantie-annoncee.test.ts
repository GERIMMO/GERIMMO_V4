/**
 * DEVIS : LA GARANTIE ANNONCÉE PAR L'ARTISAN — audit palier 1 du 22/11/2026, P2-02 (seconde partie). Sans base.
 *
 * Ces tests tiennent toute la chaîne côté application :
 *  1. la saisie : le brouillon, la saisie validée (celle qui génère le PDF) et la copie gardée sur l'appareil lisent
 *     la garantie, la bornent à 300 caractères, et restent compatibles avec ce qui a été saisi avant ce champ ;
 *  2. le document : la garantie est imprimée sur le devis, telle quelle, échappée ; sans garantie, rien n'est imprimé ;
 *  3. les écrans : le champ de l'artisan dit que c'est son engagement ; le gestionnaire la lit partout où il lit un
 *     devis, avec la mention « Engagement de l'artisan, pas de Gerimmo » ;
 *  4. la route du PDF transmet la garantie au document ET à la saisie que la base recopie à l'envoi.
 * La base est tenue par tests/devis-garantie-annoncee-base.test.ts, le parcours par e2e/devis-garantie-annoncee.spec.ts.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleDevisLocal, contenuDevisLocal, lireDevisLocal, sauverDevisLocal, CHAMPS_DEVIS_LOCAL, type BrouillonDevisLocal } from "@/lib/brouillon-devis-local";
import { calculerDevis } from "@/lib/devis-structure";
import { assemblerDevisArtisan, type DevisArtisanDocument } from "@/lib/documents/devis-artisan";
import { brouillonDepuisFormulaire, GARANTIE_ANNONCEE_MAX } from "@/lib/parcours-devis-artisan";
import { lireSaisieDevisArtisan } from "@/lib/saisie-devis-artisan";

const LIGNES = [{ code: "", libelle: "Remplacement du joint", quantite: 1, prix_unitaire_ht_cents: 5000, tva_bps: 1000 }];
function formulaire(plus: Record<string, string> = {}) {
  const f = new FormData();
  f.set("diagnostic", "Joint usé"); f.set("delai", "Sous cinq jours"); f.set("duree", "Une heure");
  f.set("contraintes", ""); f.set("observations", ""); f.set("valide_jusqu_au", "2099-01-01");
  f.set("lignes_devis", JSON.stringify(LIGNES));
  f.set("lignes_devis_saisie", JSON.stringify([{ code: "", libelle: "Remplacement du joint", quantite: "1", prix: "50", tva: "1000" }]));
  for (const [k, v] of Object.entries(plus)) f.set(k, v);
  return f;
}

describe("la saisie de l'artisan", () => {
  it("la borne est celle de la base : 300 caractères", () => {
    expect(GARANTIE_ANNONCEE_MAX).toBe(300);
    expect(CHAMPS_DEVIS_LOCAL).toContain("garantie");
  });

  it("brouillon enregistré : la garantie est lue, sans espaces autour, coupée à 300 caractères ; absente, elle est vide", () => {
    expect(brouillonDepuisFormulaire(formulaire({ garantie: "  Un an, pièces et main-d’œuvre " })).garantie).toBe("Un an, pièces et main-d’œuvre");
    expect(brouillonDepuisFormulaire(formulaire({ garantie: "g".repeat(400) })).garantie).toHaveLength(300);
    expect(brouillonDepuisFormulaire(formulaire()).garantie).toBe("");
  });

  it("saisie validée : la garantie accompagne le devis ; trop longue, elle est refusée avec une phrase claire", () => {
    expect(lireSaisieDevisArtisan(formulaire({ garantie: " Deux ans sur la robinetterie " })).garantie).toBe("Deux ans sur la robinetterie");
    expect(lireSaisieDevisArtisan(formulaire()).garantie).toBe("");
    expect(lireSaisieDevisArtisan(formulaire({ garantie: "g".repeat(300) })).garantie).toHaveLength(300);
    expect(() => lireSaisieDevisArtisan(formulaire({ garantie: "g".repeat(301) }))).toThrow("Raccourcissez la garantie annoncée (300 caractères au plus).");
    // Le reste de la saisie est celui d'avant.
    expect(lireSaisieDevisArtisan(formulaire({ garantie: "Un an" }))).toMatchObject({ diagnostic: "Joint usé", delai: "Sous cinq jours", duree: "Une heure", valideJusquAu: "2099-01-01" });
  });

  describe("copie gardée sur l'appareil", () => {
    const cle = cleDevisLocal("compte-a", "demande-a");
    beforeEach(() => {
      const donnees = new Map<string, string>();
      vi.stubGlobal("localStorage", { getItem: (k: string) => donnees.get(k) ?? null, setItem: (k: string, v: string) => donnees.set(k, v), removeItem: (k: string) => donnees.delete(k) });
    });
    afterEach(() => vi.unstubAllGlobals());

    it("la garantie est conservée avec le reste ; trop longue, la copie est refusée plutôt que tronquée en silence", () => {
      expect(contenuDevisLocal(formulaire({ garantie: "Un an" }))).toMatchObject({ garantie: "Un an", diagnostic: "Joint usé" });
      expect(contenuDevisLocal(formulaire()).garantie).toBe("");
      expect(() => contenuDevisLocal(formulaire({ garantie: "g".repeat(301) }))).toThrow();
    });

    it("une copie d'avant ce champ reste lisible, et la garantie y est simplement absente", () => {
      const ancienne = { version: 1, copieId: "d1d71ee6-931f-40be-9c34-3106053d4993", enregistreLe: Date.now(), revision: 1,
        contenu: { diagnostic: "Joint usé", delai: "", duree: "", contraintes: "", observations: "", valide_jusqu_au: "", lignes: [{ code: "", libelle: "Joint", quantite: "1", prix: "", tva: "" }] } } as BrouillonDevisLocal;
      expect(sauverDevisLocal(cle, ancienne)).toBe(true);
      expect(lireDevisLocal(cle)).toEqual(ancienne);
      expect(lireDevisLocal(cle)?.contenu.garantie).toBeUndefined();
      const nouvelle = { ...ancienne, contenu: { ...ancienne.contenu, garantie: "Six mois" } };
      expect(sauverDevisLocal(cle, nouvelle)).toBe(true);
      expect(lireDevisLocal(cle)?.contenu.garantie).toBe("Six mois");
    });
  });
});

describe("le document du devis", () => {
  const doc: DevisArtisanDocument = {
    id: "11111111-1111-4111-8111-111111111111", description: "Remplacement du joint", ...calculerDevis(LIGNES),
    diagnostic: "Joint usé", delai_intervention: "Sous cinq jours", duree_estimee: "Une heure", contraintes: null, observations: null,
    statut: "valide", depose_le: "2026-11-22T10:00:00Z", valide_jusqu_au: "2099-01-01", artisan_nom: "Plomberie Alpha", artisan_siret: "12345678901234",
    artisan_telephone: "0600000000", artisan_email: "alpha@example.invalid", agence_nom: "Parc Moreau", incident_numero: "INC-2026-0001", commune: "Lyon", code_postal: "69003",
  };
  const texte = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  it("la garantie est imprimée telle quelle, attribuée à l'entreprise, avec le reste de l'organisation", () => {
    const r = assemblerDevisArtisan({ ...doc, garantie_annoncee: "  Un an, pièces et main-d’œuvre " });
    expect(r.manquants).toEqual([]);
    expect(texte(r.html)).toContain("Garantie annoncée par l’entreprise : Un an, pièces et main-d’œuvre");
    expect(r.html.match(/data-garantie-annoncee/g)).toHaveLength(1);
    expect(r.html.indexOf("Durée estimée")).toBeLessThan(r.html.indexOf("data-garantie-annoncee"));
    // Le document ne prête aucune garantie à Gerimmo.
    expect(texte(r.html)).not.toMatch(/garanti(?:e|t) par Gerimmo|Gerimmo garantit/i);
  });

  it("la saisie de l'artisan est échappée", () => {
    const r = assemblerDevisArtisan({ ...doc, garantie_annoncee: 'Un an <img src=x onerror="alert(1)">' });
    expect(r.html).toContain("Un an &lt;img src=x");
    expect(r.html).not.toContain("<img src=x");
  });

  it.each([["absente", undefined], ["nulle", null], ["vide", ""], ["faite d'espaces", "  \n "]])("garantie %s : rien n'est imprimé, le document est celui d'avant", (_cas, valeur) => {
    const r = assemblerDevisArtisan({ ...doc, garantie_annoncee: valeur });
    expect(r.html).not.toContain("data-garantie-annoncee");
    expect(texte(r.html)).not.toContain("Garantie annoncée");
    expect(r.html).toBe(assemblerDevisArtisan(doc).html);
  });
});

describe("les écrans et la route", () => {
  const lire = (chemin: string) => readFileSync(chemin, "utf8");

  it("l'artisan : champ facultatif, borné, qui dit que c'est son engagement ; repris dans son récapitulatif et sa copie", () => {
    const ecran = lire("src/app/artisan/devis/[sollicitationId]/formulaire-devis.tsx");
    expect(ecran).toContain('<input id="garantie-annoncee" name="garantie" maxLength={GARANTIE_ANNONCEE_MAX}');
    expect(ecran).not.toMatch(/name="garantie"[^>]*\brequired\b/);
    expect(ecran).toContain("Reprise telle quelle sur votre devis et montrée au demandeur. C’est votre engagement : Gerimmo ne garantit rien à votre place.");
    expect(ecran).toContain('"note_revision", "garantie"].includes(cible.name)');
    expect(ecran).toContain("<strong>Garantie annoncée :</strong> {resume.garantie}");
    expect(lire("src/app/artisan/devis/[sollicitationId]/formulaire-avec-reprise.tsx")).toContain('["Garantie annoncée", b.contenu.garantie ?? ""]');
  });

  it("le gestionnaire : la garantie est lue avec le devis et affichée aux quatre endroits où il lit un devis, avec sa mention", () => {
    const ecran = lire("src/app/agence/[orgId]/incidents/volet-artisan.tsx");
    expect(ecran).toMatch(/\.from\("incident_devis"\)\s*\.select\(\s*"[^"]*\bnote_revision, garantie_annoncee"/);
    expect(ecran.match(/<GarantieAnnoncee texte=\{/g)).toHaveLength(4);
    const composant = ecran.slice(ecran.indexOf("function GarantieAnnoncee("), ecran.indexOf("type Devis = {"));
    expect(composant).toContain("if (!garantie) return null;");
    expect(composant).toContain("<span>Garantie annoncée par l’artisan</span>");
    expect(composant).toContain("Engagement de l’artisan, pas de Gerimmo.");
    expect(composant).toContain("data-garantie-annoncee");
  });

  it("la route du PDF : la garantie va au document et à la saisie que la base recopie à l'envoi", () => {
    const route = lire("src/app/api/devis/[sollicitationId]/pdf/route.ts");
    expect(route).toContain("garantie_annoncee:saisie.garantie||null,");
    expect(route).toContain("garantie:saisie.garantie},entreprise,");
  });

  it("le locataire ne lit toujours aucun devis : la garantie ne lui est pas montrée (décision notée dans QUESTIONS.md)", () => {
    for (const fichier of ["src/app/locataire/[orgId]/demandes/page.tsx", "src/app/locataire/[orgId]/demandes/suivi-intervention.tsx"]) {
      expect(lire(fichier), fichier).not.toMatch(/garantie_annoncee|Garantie annoncée/);
    }
  });
});
