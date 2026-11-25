import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { baseSimulee, type BaseSimulee } from "./fixtures/base-simulee";
import type { EcritureFinances } from "@/lib/finances";
import { PageFinances } from "@/components/page-finances";

const banc = vi.hoisted(() => ({ db: null as BaseSimulee | null, quittancement: [] as { lignes: Record<string, unknown>[] }[] }));
vi.mock("@/lib/espace", () => ({
  verifierAccesEspace: async () => ({ supabase: banc.db!.client }),
}));
vi.mock("@/components/recapitulatif-fiscal", () => ({ RecapitulatifFiscal: () => null }));
// Le tableau du mois n'est pas rendu ici ; ce qu'il reçoit est consigné (phase 3, lot 44, reprise : l'état du plan d'apurement).
vi.mock("@/app/agence/[orgId]/comptabilite/quittancement-mois", () => ({
  QuittancementMois: (p: { lignes: Record<string, unknown>[] }) => { banc.quittancement.push(p); return null; },
}));
vi.mock("@/lib/entites-patrimoine", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/entites-patrimoine")>(),
  lireEntitesPatrimoine: async () => ({
    entites: [
      { id: "sci", nom: "SCI des Amandiers", qualite: "SCI", lots: ["A"] },
      { id: "perso", nom: "Claire", qualite: null, lots: ["A", "B", "C"] },
    ],
    periodes: [
      { lot_id: "A", titulaire: "perso", quote_part: 100, date_debut: "2026-01-01", date_fin: "2026-06-30" },
      { lot_id: "A", titulaire: "sci", quote_part: 100, date_debut: "2026-11-16", date_fin: null },
      { lot_id: "B", titulaire: "perso", quote_part: 100, date_debut: "2026-11-16", date_fin: null },
      { lot_id: "C", titulaire: "perso", quote_part: 100, date_debut: "2026-01-01", date_fin: null },
    ],
    erreur: false,
  }),
}));

function depense(id: string, lot: string | null, bien: string, date: string, montant: number): EcritureFinances {
  return { id, lot_id: lot, bien_id: bien, date_imputation: date, montant, sens: "depense",
    categorie: "travaux", libelle: id, contre_ecriture_de: null };
}

beforeEach(() => {
  banc.quittancement = [];
  const org = { organization_id: "parc" };
  banc.db = baseSimulee({
    biens: [{ ...org, id: "immeuble", nom: "Immeuble" }, { ...org, id: "maison", nom: "Maison" }],
    lots: [{ ...org, id: "A", bien_id: "immeuble" }, { ...org, id: "B", bien_id: "maison" },
      { ...org, id: "C", bien_id: "immeuble" }],
    journal_par_bien: [
      { ...org, ...depense("Facture eau avant acquisition", "A", "immeuble", "2026-11-05", 180) },
      { ...org, ...depense("Facture du seul autre patrimoine", "B", "maison", "2026-11-05", 75) },
      { ...org, ...depense("Facture d’un autre lot du même immeuble", "C", "immeuble", "2026-11-05", 90) },
      { organization_id: "tiers", ...depense("Confidentiel", "A", "immeuble", "2026-11-05", 100) },
    ],
  }, { rpc: { quittancement_mois: () => ({ data: [], error: null }) } });
});

async function operations() {
  const html = renderToStaticMarkup(await PageFinances({ orgId: "parc", recherche: { annee: "2026", entite: "sci" } }));
  return html.split('id="operations"')[1].split('id="declaration"')[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

it("montre la facture de 180 € antérieure à la détention sans la compter dans les dépenses de la SCI", async () => {
  const texte = await operations();
  expect(texte).toContain("Recettes 0,00 € Dépenses 0,00 € Recettes − dépenses 0,00 €");
  expect(texte).toContain("1 opération à rattacher");
  expect(texte).toContain("Facture eau avant acquisition");
  expect(texte).toContain("−180,00 €");
  expect(texte).not.toContain("Aucune opération");
  expect(texte).not.toMatch(/Confidentiel|Facture du seul autre patrimoine|Facture d’un autre lot/);
});

it("sépare les écritures certaines, les écritures communes du bâtiment mixte et les opérations annulées", async () => {
  const org = { organization_id: "parc" };
  banc.db!.tables.journal_par_bien.push(
    { ...org, ...depense("Dépense confirmée", "A", "immeuble", "2026-11-16", 40) },
    { ...org, ...depense("Réparation commune", null, "immeuble", "2026-11-20", 30) },
    { ...org, ...depense("Opération annulée", "A", "immeuble", "2026-11-06", 10) },
    { ...org, ...depense("Annulation", "A", "immeuble", "2027-01-01", 10), contre_ecriture_de: "Opération annulée" },
  );
  const texte = await operations();
  expect(texte).toContain("Recettes 0,00 € Dépenses 40,00 € Recettes − dépenses -40,00 €");
  expect(texte).toContain("2 opérations à rattacher");
  expect(texte).toContain("210,00 €");
  expect(texte).toContain("Réparation commune");
  expect(texte).not.toContain("Opération annulée");
  const html = renderToStaticMarkup(await PageFinances({ orgId: "parc", recherche: { annee: "2026", entite: "sci" } }));
  const depenses = html.split('id="depenses"')[1].split('id="operations"')[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  expect(depenses).toContain("Dépenses enregistrées 40,00 €");
  expect(depenses).toContain("210,00 € de dépenses restent à rattacher");
  expect(depenses).not.toMatch(/Opération annulée|Confidentiel/);
});

it("réserve la créance et son action au titulaire à l’échéance après une cession", async () => {
  const ligne = { lot_id: "A", appel_id: "appel", bail_id: "bail", lot_nom: "Les Ormes",
    montant_du: 640, montant_couvert: 0 };
  banc.db = baseSimulee({
    biens: [{ organization_id: "parc", id: "immeuble", nom: "Les Ormes" }],
    lots: [{ organization_id: "parc", id: "A", bien_id: "immeuble" }],
    appels_loyer: [{ organization_id: "parc", id: "appel", periode: "2026-12-01", date_echeance: "2026-12-05" }],
    journal_par_bien: [],
  }, { rpc: { quittancement_mois: () => ({ data: [ligne], error: null }) } });
  async function loyers(entite: string) {
    const html = renderToStaticMarkup(await PageFinances({ orgId: "parc", recherche: { annee: "2026", mois: "12", entite } }));
    return html.split('id="loyers"')[1].split('id="operations"')[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  }
  const ancien = await loyers("perso");
  expect(ancien).toContain("Attendu 0,00 €");
  expect(ancien).not.toContain("Voir le loyer");
  expect(await loyers("sci")).toContain("Attendu 640,00 €");
  expect(await loyers("")).toContain("Attendu 640,00 €");
});

it("regroupe les trois entrées et conserve tous les outils avancés sans modifier les totaux", async () => {
  const html = renderToStaticMarkup(await PageFinances({orgId:"parc",recherche:{annee:"2026",entite:"sci"}}));
  expect(html).toContain('aria-label="Rubriques des finances"');
  for (const texte of ["Loyers", "Dépenses", "Bilan de l’année", "Ajouter une dépense", "Pour mon comptable", "Livre complet et exports", "Saisir une écriture", "Clôturer un mois", "Reprise des comptes"]) expect(html).toContain(texte);
  expect(html).toContain('/espace/parc/comptabilite?vue=saisie');
  const depenses = html.split('id="depenses"')[1].split('id="operations"')[0].replace(/<[^>]+>/g," ").replace(/\s+/g," ");
  expect(depenses).toContain("Dépenses enregistrées 0,00 €");
  expect(depenses).toContain("180,00 € de dépenses restent à rattacher");
  expect(depenses).not.toContain("Confidentiel");
});

it("guide le compte neuf sans afficher des totaux à zéro ni perdre l’accès au livre", async () => {
  banc.db = baseSimulee({biens:[],lots:[],journal_par_bien:[],baux:[]},{rpc:{quittancement_mois:()=>({data:[],error:null})}});
  const html = renderToStaticMarkup(await PageFinances({orgId:"parc",recherche:{}}));
  expect(html).toContain("Vos finances commencent avec votre premier bien");
  expect(html).toContain('/espace/parc/parc/nouveau');
  expect(html).not.toContain('class="chiffres-finances');
  expect(html).toContain("Livre complet et exports");
});

it("ne présente pas un échec de lecture du livre comme une absence de dépenses", async () => {
  banc.db = baseSimulee({biens:[],lots:[]},{lecturesEnErreur:{journal_par_bien:"indisponible"},rpc:{quittancement_mois:()=>({data:[],error:null})}});
  const html = renderToStaticMarkup(await PageFinances({orgId:"parc",recherche:{}}));
  expect(html).toContain("Impossible de lire les dépenses");
  expect(html).not.toContain("Vos finances commencent avec votre premier bien");
  expect(html).not.toContain("Dépenses enregistrées");
});

it("conserve les montants attendus, couverts et restant dus sans compter deux fois les avances", async () => {
  banc.db = baseSimulee({biens:[{id:"b",nom:"Maison",organization_id:"parc"}],lots:[{id:"A",bien_id:"b",organization_id:"parc"}],journal_par_bien:[]}, {rpc:{quittancement_mois:()=>({data:[
    {lot_id:"A",appel_id:"1",bail_id:"bail1",montant_du:1000,montant_couvert:750},
    {lot_id:"A",appel_id:"2",bail_id:"bail2",montant_du:200,montant_couvert:400},
  ],error:null})}});
  const html=renderToStaticMarkup(await PageFinances({orgId:"parc",recherche:{annee:"2026",mois:"12"}}));
  const texte=html.split('id="loyers"')[1].split('id="depenses"')[0].replace(/<[^>]+>/g," ").replace(/\s+/g," ");
  expect(texte).toContain("Attendu 1 200,00 € Encaissé ou compensé 950,00 € Restant dû 250,00 €");
  expect(texte).toContain("hors avances");
});

it("garde une sélection devenue indisponible explicite et refuse d’afficher un total trompeur", async () => {
  const html=renderToStaticMarkup(await PageFinances({orgId:"parc",recherche:{annee:"2025",entite:"inconnue"}}));
  expect(html).toContain("Sélection indisponible pour 2025");
  expect(html).toContain("Ce patrimoine n’est pas disponible pour cette année");
  expect(html).not.toContain('class="chiffres-finances');
});

// Phase 3, lot 44 (reprise, C65) : le tableau du mois en cours invitait à « Relancer sur le bail » un terme impayé sous plan
// d'apurement en cours, où les relances sont suspendues. Ses termes non couverts lui arrivent avec l'état du plan de leur bail,
// lu sous la RLS du propriétaire et limité à son espace ; un terme réglé n'est pas touché.
it("donne au tableau du mois en cours l'état du plan d'apurement de chaque terme non couvert", async () => {
  const org = { organization_id: "parc" };
  const terme = (appel: string, bail: string, du: number, couvert: number, statut: string) =>
    ({ lot_id: "A", appel_id: appel, bail_id: bail, lot_nom: "Les Ormes", locataire: "Durand Lucie", montant_du: du, montant_couvert: couvert, statut });
  banc.db = baseSimulee({
    biens: [{ ...org, id: "immeuble", nom: "Les Ormes" }], lots: [{ ...org, id: "A", bien_id: "immeuble" }], journal_par_bien: [],
    plans_apurement: [
      { ...org, bail_id: "bail-plan", etat: "actif" },
      { ...org, bail_id: "bail-ancien-plan", etat: "solde" },
      { organization_id: "tiers", bail_id: "bail-libre", etat: "actif" },
    ],
  }, { rpc: { quittancement_mois: () => ({ data: [
    terme("1", "bail-plan", 770.5, 0, "impaye"), terme("2", "bail-ancien-plan", 650, 0, "impaye"),
    terme("3", "bail-libre", 500, 100, "partiel"), terme("4", "bail-paye", 400, 400, "paye"),
  ], error: null }) } });
  renderToStaticMarkup(await PageFinances({ orgId: "parc", recherche: {} }));
  expect(banc.quittancement).toHaveLength(1);
  expect(banc.quittancement[0].lignes.map((l) => [l.appel_id, l.plan_apurement])).toEqual([
    ["1", "en_cours"], ["2", "aucun"], ["3", "aucun"], ["4", undefined],
  ]);
});
