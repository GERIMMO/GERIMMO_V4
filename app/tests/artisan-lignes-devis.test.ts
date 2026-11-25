/**
 * ARTISAN : SES LIGNES DE DEVIS RÉUTILISABLES — audit palier 1 du 22/11/2026, P2-04 (troisième partie). Sans base.
 *
 * Ces tests tiennent :
 *  1. les calculs : reprendre une ligne gardée la recopie dans la première ligne vide du devis, sinon à la suite,
 *     quantité 1, prix et TVA tels que gardés — jamais une valeur devinée ; garder une ligne lit le libellé, et le prix
 *     et la TVA seulement s'ils sont saisis et lisibles ;
 *  2. les actions : aucune n'accepte d'artisan en paramètre ; une saisie illisible est refusée avant la base ; le
 *     message de la base est rendu tel quel ;
 *  3. le bloc des lignes : sans la propriété, il est exactement celui d'avant (facture, bilan) ; avec elle, il montre
 *     les lignes gardées et leurs gestes ; lecture en échec = pas de geste et un message, jamais une liste vide ;
 *  4. le formulaire de devis transmet les lignes et compte « Ajouter au devis » comme une modification du brouillon.
 * La base est tenue par tests/artisan-lignes-devis-base.test.ts, le parcours par e2e/artisan-lignes-devis.spec.ts.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({
  fiche: { artisan_id: "artisan-test" } as null | Record<string, unknown>,
  appels: [] as [string, Record<string, unknown>][],
  reponse: { data: null as unknown, error: null as null | { message: string } },
}));
vi.mock("@/app/artisan/acces", () => ({
  verifierArtisanAction: async () => ({
    fiche: banc.fiche,
    supabase: { rpc: async (nom: string, args: Record<string, unknown>) => { banc.appels.push([nom, args]); return banc.reponse; } },
  }),
}));

import { garderMaLigneDevis, retirerMaLigneDevis } from "@/app/actions/lignes-devis-artisan";
import { LignesDevis, type MesLignesGardees } from "@/app/artisan/lignes-devis";
import { avecLigneGardee, detailLigneGardee, lireLigneAGarder, reprendreLigne, versLigneDeSaisie, type LigneGardee } from "@/lib/lignes-devis-gardees";

const ID = "11111111-1111-4111-8111-111111111111";
const JOINT: LigneGardee = { id: ID, libelle: "Remplacement du joint", prix_unitaire_ht_cents: 4500, tva_bps: 1000 };
const DEPLACEMENT: LigneGardee = { id: "22222222-2222-4222-8222-222222222222", libelle: "Déplacement", prix_unitaire_ht_cents: null, tva_bps: null };
const vide = () => ({ code: "", libelle: "", quantite: "1", prix: "", tva: "" });
const texte = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const lire = (chemin: string) => readFileSync(chemin, "utf8");

beforeEach(() => { banc.fiche = { artisan_id: "artisan-test" }; banc.appels = []; banc.reponse = { data: null, error: null }; });

describe("les calculs", () => {
  it("une ligne gardée devient une ligne de saisie : quantité 1, prix à la française, rien d'inventé", () => {
    expect(versLigneDeSaisie(JOINT)).toEqual({ code: "", libelle: "Remplacement du joint", quantite: "1", prix: "45,00", tva: "1000" });
    expect(versLigneDeSaisie(DEPLACEMENT)).toEqual({ code: "", libelle: "Déplacement", quantite: "1", prix: "", tva: "" });
    expect(versLigneDeSaisie({ ...JOINT, prix_unitaire_ht_cents: 0, tva_bps: 0 })).toMatchObject({ prix: "0,00", tva: "0" });
    expect(versLigneDeSaisie({ ...JOINT, prix_unitaire_ht_cents: 1899005 })).toMatchObject({ prix: "18990,05" });
  });

  it("reprendre : dans la première ligne vide, sinon à la suite ; au-delà de cent lignes, rien n'est ajouté", () => {
    expect(reprendreLigne([vide()], JOINT)).toEqual([versLigneDeSaisie(JOINT)]);
    const saisie = [{ code: "", libelle: "Main-d’œuvre", quantite: "2", prix: "50", tva: "1000" }, vide()];
    expect(reprendreLigne(saisie, JOINT)).toEqual([saisie[0], versLigneDeSaisie(JOINT)]);
    // Une ligne qui porte déjà un prix n'est pas « vide » : elle n'est jamais écrasée.
    const entamee = [{ code: "", libelle: "", quantite: "1", prix: "12", tva: "" }];
    expect(reprendreLigne(entamee, DEPLACEMENT)).toEqual([entamee[0], versLigneDeSaisie(DEPLACEMENT)]);
    const pleines = Array.from({ length: 100 }, (_, i) => ({ code: "", libelle: `Ligne ${i}`, quantite: "1", prix: "1", tva: "0" }));
    expect(reprendreLigne(pleines, JOINT)).toBe(pleines);
  });

  it("ce que l'artisan lit d'une ligne gardée", () => {
    expect(detailLigneGardee(JOINT)).toBe("45,00 € HT · TVA 10 %");
    expect(detailLigneGardee(DEPLACEMENT)).toBe("prix à saisir · TVA à choisir");
    expect(detailLigneGardee({ ...JOINT, tva_bps: 550 })).toBe("45,00 € HT · TVA 5,5 %");
    expect(detailLigneGardee({ ...JOINT, tva_bps: 0 })).toBe("45,00 € HT · TVA 0 % / non applicable");
  });

  it("garder : le libellé est obligatoire ; prix et TVA sont gardés s'ils sont lisibles, refusés s'ils sont faux", () => {
    expect(lireLigneAGarder({ libelle: "  Remplacement du joint ", prix: "45", tva: "1000" })).toEqual({ libelle: "Remplacement du joint", prixCents: 4500, tvaBps: 1000 });
    expect(lireLigneAGarder({ libelle: "Déplacement", prix: " ", tva: "" })).toEqual({ libelle: "Déplacement", prixCents: null, tvaBps: null });
    expect(lireLigneAGarder({ libelle: "Gratuit", prix: "0", tva: "0" })).toEqual({ libelle: "Gratuit", prixCents: 0, tvaBps: 0 });
    expect(lireLigneAGarder({ libelle: " ", prix: "45", tva: "1000" })).toEqual({ erreur: "Écrivez la prestation ou la fourniture avant de la garder." });
    expect(lireLigneAGarder({ libelle: "x".repeat(241), prix: "", tva: "" })).toEqual({ erreur: "Raccourcissez le libellé (240 caractères au plus)." });
    expect(lireLigneAGarder({ libelle: "Ligne", prix: "-3", tva: "" })).toEqual({ erreur: "Le prix ne peut pas être négatif." });
    expect(lireLigneAGarder({ libelle: "Ligne", prix: "quarante", tva: "" })).toEqual({ erreur: "Le prix doit être un montant en euros, par exemple 58,40." });
    expect(lireLigneAGarder({ libelle: "Ligne", prix: "45", tva: "1960" })).toEqual({ erreur: "Choisissez un taux de TVA de la liste avant de garder cette ligne." });
  });

  it("la liste après « garder » : la ligne du même identifiant est remplacée, l'ordre est celui des libellés", () => {
    expect(avecLigneGardee([JOINT], DEPLACEMENT).map((l) => l.libelle)).toEqual(["Déplacement", "Remplacement du joint"]);
    const maj = { ...JOINT, prix_unitaire_ht_cents: 5200 };
    expect(avecLigneGardee([DEPLACEMENT, JOINT], maj)).toEqual([DEPLACEMENT, maj]);
  });
});

describe("les actions", () => {
  it("garder : seuls le libellé, le prix et la TVA lus partent à la base ; l'identifiant rendu fait la ligne", async () => {
    banc.reponse = { data: ID, error: null };
    const r = await garderMaLigneDevis({ libelle: " Remplacement du joint ", prix: "45,00", tva: "1000", artisan_id: "un-autre" } as never);
    expect(r).toEqual({ ligne: JOINT });
    expect(banc.appels).toEqual([["garder_ma_ligne_devis", { p_libelle: "Remplacement du joint", p_prix_cents: 4500, p_tva_bps: 1000 }]]);
  });

  it("garder : saisie illisible refusée avant la base ; message de la base rendu tel quel ; réponse inattendue dite", async () => {
    expect(await garderMaLigneDevis({ libelle: "", prix: "", tva: "" })).toEqual({ erreur: "Écrivez la prestation ou la fourniture avant de la garder." });
    expect(await garderMaLigneDevis({ libelle: "Ligne", prix: "abc", tva: "" })).toEqual({ erreur: "Le prix doit être un montant en euros, par exemple 58,40." });
    expect(await garderMaLigneDevis(undefined as never)).toEqual({ erreur: "Écrivez la prestation ou la fourniture avant de la garder." });
    expect(banc.appels).toEqual([]);
    banc.reponse = { data: null, error: { message: "Vous gardez déjà 200 lignes : retirez-en une avant d'en garder une autre" } };
    expect(await garderMaLigneDevis({ libelle: "Ligne", prix: "", tva: "" })).toEqual({ erreur: "Vous gardez déjà 200 lignes : retirez-en une avant d'en garder une autre" });
    banc.reponse = { data: 42, error: null };
    expect(await garderMaLigneDevis({ libelle: "Ligne", prix: "", tva: "" })).toEqual({ erreur: "La ligne n’a pas pu être gardée. Réessayez dans un instant." });
  });

  it("retirer : un identifiant lisible seulement ; le message de la base est rendu tel quel", async () => {
    expect(await retirerMaLigneDevis("pas-un-identifiant")).toEqual({ erreur: "Ligne introuvable." });
    expect(banc.appels).toEqual([]);
    expect(await retirerMaLigneDevis(ID)).toEqual({ retiree: ID });
    expect(banc.appels).toEqual([["retirer_ma_ligne_devis", { p_ligne: ID }]]);
    banc.reponse = { data: null, error: { message: "Ligne introuvable" } };
    expect(await retirerMaLigneDevis(ID)).toEqual({ erreur: "Ligne introuvable" });
  });

  it("sans fiche d'artisan, aucune des deux n'appelle la base", async () => {
    banc.fiche = null;
    expect((await garderMaLigneDevis({ libelle: "Ligne", prix: "", tva: "" })).erreur).toBeTruthy();
    expect((await retirerMaLigneDevis(ID)).erreur).toBeTruthy();
    expect(banc.appels).toEqual([]);
  });
});

describe("le bloc des lignes du devis", () => {
  const gestes = { definir: () => {}, garder: async () => ({}), retirer: async () => ({}) };
  const rendre = (mesLignes?: MesLignesGardees) => renderToStaticMarkup(createElement(LignesDevis, { afficherHtIncomplet: true, mesLignes }));

  it("sans la propriété : le bloc est exactement celui d'avant (facture, bilan, chantier privé)", () => {
    const html = rendre();
    expect(html).not.toContain("data-mes-lignes");
    expect(html).not.toContain("data-garder-ligne");
    expect(html).not.toContain("data-avis-lignes-gardees");
    expect(texte(html)).not.toMatch(/gardée|Garder cette ligne/);
    // Les autres écrans ne la transmettent pas.
    for (const f of ["src/app/artisan/missions/[interventionId]/facture/formulaire-facture.tsx", "src/app/artisan/missions/[interventionId]/compte-rendu/bilan/formulaire-bilan.tsx"]) {
      expect(lire(f), f).not.toContain("mesLignes");
    }
  });

  it("aucune ligne gardée : le bloc dit comment en garder une, et chaque ligne du devis offre le geste", () => {
    const html = rendre({ lignes: [], ...gestes });
    expect(html).toContain("data-mes-lignes");
    const lu = texte(html);
    expect(lu).toContain("Mes lignes gardées");
    expect(lu).not.toMatch(/Mes lignes gardées \(\d/);
    expect(lu).toContain("Aucune ligne gardée pour l’instant. Sous une ligne de ce devis, « Garder cette ligne » la met de côté, avec son prix et sa TVA, pour vos prochains devis.");
    expect(html.match(/data-garder-ligne/g)).toHaveLength(1);
    expect(lu).toContain("Garder cette ligne pour mes prochains devis");
    // La ligne du devis est vide : le geste est inerte tant qu'il n'y a rien à garder.
    expect(html).toMatch(/<button[^>]*data-garder-ligne[^>]*disabled|<button[^>]*disabled[^>]*data-garder-ligne/);
    // Ce ne sont pas des boutons d'envoi : ils ne déposent pas le devis.
    for (const b of html.match(/<button[^>]*data-(?:garder-ligne|reprendre-ligne|retirer-ligne-gardee)[^>]*>/g) ?? []) expect(b).toContain('type="button"');
  });

  it("des lignes gardées : leur nombre, leur libellé, leur prix et leur TVA, et les deux gestes nommés par ligne", () => {
    const html = rendre({ lignes: [DEPLACEMENT, JOINT], ...gestes });
    const lu = texte(html);
    expect(lu).toContain("Mes lignes gardées (2)");
    expect(html.match(/data-ligne-gardee/g)).toHaveLength(2);
    expect(lu).toContain("Remplacement du joint 45,00 € HT · TVA 10 %");
    expect(lu).toContain("Déplacement prix à saisir · TVA à choisir");
    expect(html).toContain('aria-label="Ajouter au devis : Remplacement du joint"');
    expect(html).toContain('aria-label="Retirer de ma liste : Déplacement"');
    // Le nom accessible commence par le texte visible du bouton.
    expect(lu.match(/Ajouter au devis/g)).toHaveLength(2);
    expect(lu.match(/Retirer de ma liste/g)).toHaveLength(2);
    // La région d'annonce existe, vide, avant tout geste.
    expect(html).toMatch(/<p[^>]*role="status"[^>]*data-avis-lignes-gardees[^>]*><\/p>|<p[^>]*data-avis-lignes-gardees[^>]*role="status"[^>]*><\/p>/);
  });

  it("lecture en échec : un message, aucune liste vide trompeuse, et aucun geste « garder »", () => {
    const html = rendre({ lignes: null, ...gestes });
    expect(html).toContain("data-mes-lignes");
    expect(texte(html)).toContain("Vos lignes gardées n’ont pas pu être lues : rechargez la page avant d’en reprendre une.");
    expect(texte(html)).not.toContain("Aucune ligne gardée pour l’instant");
    expect(html).not.toContain("data-garder-ligne");
    expect(html).not.toContain("data-ligne-gardee");
  });
});

describe("le formulaire de devis", () => {
  it("la page lit les lignes gardées et les transmet jusqu'au bloc ; « Ajouter au devis » compte comme une modification", () => {
    const page = lire("src/app/artisan/devis/[sollicitationId]/page.tsx");
    expect(page).toContain("chargerMesLignesDevis(),");
    expect(page).toContain("lignesGardees={lignesGardees}");
    const formulaire = lire("src/app/artisan/devis/[sollicitationId]/formulaire-devis.tsx");
    // La liste vit dans le formulaire (qui ne se remonte pas), pas dans le bloc des lignes : une ligne gardée puis
    // « Repartir d'un devis vierge » la laisse proposée.
    expect(formulaire).toContain("const [gardees,setGardees]=useState(lignesGardees);");
    expect(formulaire).toContain("mesLignes={gardees===undefined?undefined:{lignes:gardees,definir:setGardees,garder:garderMaLigneDevis,retirer:retirerMaLigneDevis}}");
    const composant = lire("src/app/artisan/lignes-devis.tsx");
    expect(composant).toContain("const gardees = mesLignes?.lignes ?? [];");
    expect(composant).not.toMatch(/useState<LigneGardee\[\]>/);
    expect(formulaire).toContain("/Ajouter une prestation|Retirer cette ligne|Ajouter au devis/");
    // Une lecture en échec rend `null`, jamais une liste vide.
    const acces = lire("src/app/artisan/acces.ts");
    const bloc = acces.slice(acces.indexOf("export async function chargerMesLignesDevis"), acces.indexOf("/** P2-04 : où en est la relance"));
    expect(bloc).toContain('supabase.rpc("mes_lignes_devis")');
    expect(bloc).toContain("if (error || !Array.isArray(data)) return null;");
  });
});
