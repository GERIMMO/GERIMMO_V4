/**
 * L'AVENANT SIGNÉ : LES DATES PROPOSÉES, LES DEUX ACTIONS ET LA RUBRIQUE DE LA FICHE DU BAIL — audit palier 1 du
 * 22/11/2026, P1-14.
 *
 * Sans base (les règles de la base ont leur test : avenants-bail-base.test.ts). Tient :
 *  1. les dates d'effet proposées sont celles que la base acceptera : le 1er du mois qui suit le dernier loyer appelé,
 *     jamais avant l'entrée, jamais après la fin du bail ni au-delà de deux ans ;
 *  2. l'action d'enregistrement refuse sans compte gestionnaire, sans objet, sans dates, sans montants lisibles, sans
 *     pièce — et ne dépose alors RIEN ; quand la base refuse, la pièce déjà montée est abandonnée ; le message de
 *     succès dit si l'avenant est appliqué ou s'il attend ;
 *  3. l'action d'annulation exige un motif borné ;
 *  4. la rubrique : formulaire et « à savoir » quand rien n'attend ; l'avenant en attente et son annulation sinon ;
 *     l'historique dit l'état, les montants d'avant et d'après et donne la pièce ; une lecture en panne retire le
 *     formulaire ; la supervision en lecture seule ne voit aucun geste ; un bail terminé garde son historique ;
 *  5. l'écran ne cite aucun article de loi et ne promet aucune conformité.
 */
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fauxClient, table, type Ligne } from "./faux-postgrest";

const banc = vi.hoisted(() => ({
  rpc: vi.fn(), acces: vi.fn(), revalidatePath: vi.fn(), preparer: vi.fn(), abandonner: vi.fn(), depots: vi.fn(),
  aujourdhui: "2026-11-22",
}));
vi.mock("next/cache", () => ({ revalidatePath: banc.revalidatePath }));
vi.mock("next/navigation", async () => ({
  ...await vi.importActual<typeof import("next/navigation")>("next/navigation"),
  redirect: vi.fn(), usePathname: () => "/agence/org-a/baux/b", useSearchParams: () => new URLSearchParams(), useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: banc.acces }));
vi.mock("@/lib/ged-depot", () => ({ preparerFichierGed: banc.preparer, abandonnerPieceGed: banc.abandonner }));
vi.mock("@/lib/depot-direct", () => ({ resoudreDepotsFormulaire: banc.depots }));
vi.mock("@/lib/ged", async () => ({ ...await vi.importActual<typeof import("@/lib/ged")>("@/lib/ged"), aujourdhuiParis: () => banc.aujourdhui }));
vi.mock("@/components/bouton-generer-document", () => ({ BoutonGenererDocument: () => null }));

import { annulerAvenantBail, enregistrerAvenantBail } from "@/app/actions/avenant-bail";
import { RubriqueAvenantsBail } from "@/app/agence/[orgId]/baux/[bailId]/avenants-bail";
import {
  changementsAvenant, datesEffetProposees, decalerMois, etatAvenantBail, libelleMois, libellePremierDuMois, premiereDateEffetPossible,
} from "@/lib/avenants-bail";

const ORG = "11111111-1111-4111-8111-111111111111";
const BAIL = "22222222-2222-4222-8222-222222222222";
const AVENANT = "33333333-3333-4333-8333-333333333333";
const PIECE = { chemin: `${ORG}/piece.pdf`, mime: "application/pdf", taille: 2048, empreinte: "abc" };
const DECODAGE: [RegExp, string][] = [[/&#x27;/g, "'"], [/&quot;/g, '"'], [/&amp;/g, "&"]];
const texte = (html: string) =>
  DECODAGE.reduce((t, [motif, remplacement]) => t.replace(motif, remplacement), html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

describe("dates d'effet proposées", () => {
  it("le mois se décale sans fuseau, y compris d'une année sur l'autre", () => {
    expect(decalerMois("2026-11-01", 1)).toBe("2026-12-01");
    expect(decalerMois("2026-11-01", 2)).toBe("2027-01-01");
    expect(decalerMois("2026-01-01", -1)).toBe("2025-12-01");
    expect(decalerMois("2026-03-01", 24)).toBe("2028-03-01");
    expect(libellePremierDuMois("2027-01-01")).toBe("1er janvier 2027");
    expect(libelleMois("2026-08-01")).toBe("août 2026");
  });

  it("la première date possible suit le dernier loyer appelé, et ne précède jamais l'entrée", () => {
    const aujourdhui = "2026-11-22";
    // Loyer de novembre déjà appelé : au plus tôt le 1er décembre.
    expect(premiereDateEffetPossible({ dernierAppel: "2026-11-01", dateDebut: "2025-10-01", aujourdhui })).toBe("2026-12-01");
    // Aucun loyer appelé : le mois d'entrée du bail.
    expect(premiereDateEffetPossible({ dernierAppel: null, dateDebut: "2026-11-10", aujourdhui })).toBe("2026-11-01");
    // Bail qui commence plus tard : pas avant son entrée.
    expect(premiereDateEffetPossible({ dernierAppel: null, dateDebut: "2027-02-15", aujourdhui })).toBe("2027-02-01");
    expect(premiereDateEffetPossible({ dernierAppel: null, dateDebut: null, aujourdhui })).toBe("2026-11-01");
    // Bail repris en cours, entré en 2024 : pas avant le mois où Gerimmo commence à appeler ses loyers.
    expect(premiereDateEffetPossible({ dernierAppel: null, dateDebut: "2024-03-15", suivisDepuis: "2026-11-01", aujourdhui })).toBe("2026-11-01");
    expect(premiereDateEffetPossible({ dernierAppel: "2026-11-01", dateDebut: "2024-03-15", suivisDepuis: "2026-11-01", aujourdhui })).toBe("2026-12-01");
  });

  it("douze mois proposés, bornés par la fin du bail et par la limite de deux ans", () => {
    const base = { dernierAppel: "2026-11-01", dateDebut: "2025-10-01", aujourdhui: "2026-11-22" };
    const douze = datesEffetProposees({ ...base, dateFin: null });
    expect(douze).toHaveLength(12);
    expect(douze[0]).toEqual({ valeur: "2026-12-01", libelle: "1er décembre 2026" });
    expect(douze.at(-1)?.valeur).toBe("2027-11-01");
    // Le bail se termine le 20 février : janvier et février sont encore couverts, mars ne l'est plus.
    expect(datesEffetProposees({ ...base, dateFin: "2027-02-20" }).map((d) => d.valeur)).toEqual(["2026-12-01", "2027-01-01", "2027-02-01"]);
    // Le bail se termine avant le prochain loyer à appeler : plus aucune date.
    expect(datesEffetProposees({ ...base, dateFin: "2026-11-30" })).toEqual([]);
    // Bail à venir dans vingt-trois mois : la limite de deux ans coupe la liste.
    expect(datesEffetProposees({ dernierAppel: null, dateDebut: "2028-10-05", dateFin: null, aujourdhui: "2026-11-22" }).map((d) => d.valeur))
      .toEqual(["2028-10-01", "2028-11-01"]);
  });

  it("l'état et les changements d'un avenant se disent avec des mots", () => {
    expect(etatAvenantBail({ applique_le: null, annule_le: null })).toBe("en_attente");
    expect(etatAvenantBail({ applique_le: "2026-12-01T00:00:00Z", annule_le: null })).toBe("applique");
    expect(etatAvenantBail({ applique_le: null, annule_le: "2026-11-25T00:00:00Z" })).toBe("annule");
    const e = (n: number) => `${n} €`;
    expect(changementsAvenant({ ancien_loyer_hc: "700.00", nouveau_loyer_hc: 650, anciennes_charges: 50, nouvelles_charges: "50.00" }, e)).toEqual(["Loyer hors charges : 700 € → 650 €"]);
    expect(changementsAvenant({ ancien_loyer_hc: 700, nouveau_loyer_hc: 700, anciennes_charges: 50, nouvelles_charges: 80 }, e, "Provision pour charges")).toEqual(["Provision pour charges : 50 € → 80 €"]);
    expect(changementsAvenant({ ancien_loyer_hc: 700, nouveau_loyer_hc: 650, anciennes_charges: 50, nouvelles_charges: 60 }, e)).toHaveLength(2);
  });
});

const fichier = () => new File([new Uint8Array([37, 80, 68, 70])], "avenant-signe.pdf", { type: "application/pdf" });
function formulaire(champs: Record<string, string | File | null>) {
  const f = new FormData();
  const defaut: Record<string, string | File> = { objet: "Baisse du loyer convenue avec le locataire", signe_le: "2026-11-20", date_effet: "2026-12-01", loyer_hc: "650", charges: "60", fichier: fichier() };
  for (const [k, v] of Object.entries({ ...defaut, ...champs })) if (v !== null) f.set(k, v);
  return f;
}
const enregistrer = (champs: Record<string, string | File | null> = {}, org = ORG, bail = BAIL) => enregistrerAvenantBail(org, bail, {}, formulaire(champs));

beforeEach(() => {
  vi.clearAllMocks();
  banc.aujourdhui = "2026-11-22";
  banc.acces.mockResolvedValue({ user: { id: "gerant" }, supabase: { rpc: banc.rpc } });
  banc.rpc.mockResolvedValue({ data: AVENANT, error: null });
  banc.depots.mockResolvedValue(null);
  banc.preparer.mockResolvedValue({ fichier: PIECE });
});

describe("action enregistrerAvenantBail", () => {
  it("sans compte gestionnaire, ou avec un identifiant qui n'en est pas un : accès refusé, rien n'est déposé", async () => {
    banc.acces.mockResolvedValue({ user: null, supabase: { rpc: banc.rpc } });
    expect(await enregistrer()).toEqual({ erreur: "Accès refusé." });
    banc.acces.mockResolvedValue({ user: { id: "gerant" }, supabase: { rpc: banc.rpc } });
    expect(await enregistrer({}, "org-a")).toEqual({ erreur: "Accès refusé." });
    expect(await enregistrer({}, ORG, "bail")).toEqual({ erreur: "Accès refusé." });
    expect(banc.preparer).not.toHaveBeenCalled();
    expect(banc.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["objet absent", { objet: "   " }, "Indiquez l’objet de l’avenant (5 à 500 caractères)."],
    ["objet trop long", { objet: "x".repeat(501) }, "Indiquez l’objet de l’avenant (5 à 500 caractères)."],
    ["date de signature absente", { signe_le: "" }, "Indiquez la date de signature de l’avenant."],
    ["date de signature illisible", { signe_le: "20/11/2026" }, "Indiquez la date de signature de l’avenant."],
    ["date de signature future", { signe_le: "2026-11-23" }, "La date de signature ne peut pas être dans le futur : l’avenant s’enregistre une fois signé."],
    ["date d'effet absente", { date_effet: "" }, "Choisissez le mois à partir duquel l’avenant s’applique."],
    ["date d'effet en cours de mois", { date_effet: "2026-12-15" }, "Choisissez le mois à partir duquel l’avenant s’applique."],
    ["loyer illisible", { loyer_hc: "1 250,00" }, "Nouveau loyer hors charges : montant invalide : écrivez 1234,50, sans espace ni point de milliers."],
    ["loyer nul", { loyer_hc: "0" }, "Nouveau loyer hors charges : montant invalide : écrivez 1234,50, sans espace ni point de milliers."],
    ["loyer au millième", { loyer_hc: "650,123" }, "Nouveau loyer hors charges : le montant s'exprime au centime près : deux décimales au plus."],
    ["charges illisibles", { charges: "soixante" }, "Nouvelles charges : montant invalide : écrivez 1234,50, sans espace ni point de milliers."],
    ["charges absentes", { charges: "" }, "Indiquez les charges après l’avenant (0 s’il n’y en a pas)."],
    ["pièce absente", { fichier: null }, "Joignez l’avenant signé par les parties : sans lui, rien n’est enregistré."],
  ])("%s : refus à l'écran, rien n'est déposé ni envoyé à la base", async (_cas, champs, attendu) => {
    const r = await enregistrer(champs as Record<string, string | null>);
    expect(r.erreur).toBe(attendu);
    // La saisie est rendue pour être reposée — jamais le fichier.
    expect(r.valeurs).toBeDefined();
    expect(Object.keys(r.valeurs ?? {})).not.toContain("fichier");
    expect(banc.preparer).not.toHaveBeenCalled();
    expect(banc.rpc).not.toHaveBeenCalled();
    expect(banc.revalidatePath).not.toHaveBeenCalled();
  });

  it("effet futur : la pièce et les montants partent à la base ; le message dit que l'avenant attend", async () => {
    const r = await enregistrer({ objet: "  Baisse du loyer convenue avec le locataire  ", loyer_hc: "650,50", charges: "0" });
    expect(r).toEqual({ succes: "Avenant enregistré. Il s’appliquera de lui-même au loyer du 1er décembre 2026 ; d’ici là, rien ne change." });
    expect(banc.preparer).toHaveBeenCalledTimes(1);
    expect(banc.rpc).toHaveBeenCalledTimes(1);
    expect(banc.rpc).toHaveBeenCalledWith("enregistrer_avenant_bail", {
      p_org: ORG, p_bail: BAIL, p_objet: "Baisse du loyer convenue avec le locataire", p_signe_le: "2026-11-20", p_date_effet: "2026-12-01",
      p_loyer_hc: 650.5, p_charges: 0, p_storage_path: PIECE.chemin, p_mime: PIECE.mime, p_taille: PIECE.taille, p_empreinte: PIECE.empreinte,
    });
    expect(banc.abandonner).not.toHaveBeenCalled();
    const chemins = banc.revalidatePath.mock.calls.map(([c]) => c);
    expect(chemins).toEqual(expect.arrayContaining([`/agence/${ORG}/baux/${BAIL}`, `/espace/${ORG}/baux/${BAIL}`, `/agence/${ORG}/loyers`, `/espace/${ORG}/loyers`, `/locataire/${ORG}`]));
  });

  it("effet déjà atteint : le message dit que le bail est à jour ; l'avertissement de dépôt est conservé", async () => {
    banc.aujourdhui = "2026-12-03";
    banc.preparer.mockResolvedValue({ fichier: PIECE, avertissement: "Ce fichier est en réalité un PDF, malgré son extension « .png ». Il a été enregistré comme tel." });
    const r = await enregistrer({ signe_le: "2026-12-02" });
    expect(r.succes).toBe("Avenant enregistré et appliqué : le loyer et les charges du bail sont à jour. Ce fichier est en réalité un PDF, malgré son extension « .png ». Il a été enregistré comme tel.");
  });

  it("le dépôt est refusé (format, doublon) : le refus est rendu, la base n'est pas appelée", async () => {
    banc.preparer.mockResolvedValue({ erreur: "Format refusé : seuls les fichiers PDF, JPEG et PNG sont acceptés (contenu réel vérifié)." });
    const r = await enregistrer();
    expect(r.erreur).toBe("Format refusé : seuls les fichiers PDF, JPEG et PNG sont acceptés (contenu réel vérifié).");
    expect(banc.rpc).not.toHaveBeenCalled();
    banc.depots.mockResolvedValue("Ce transfert a expiré. Sélectionnez à nouveau le fichier.");
    expect((await enregistrer()).erreur).toBe("Ce transfert a expiré. Sélectionnez à nouveau le fichier.");
    expect(banc.rpc).not.toHaveBeenCalled();
  });

  it("la base refuse : son motif est rendu en clair, la pièce déjà montée est abandonnée, rien n'est rafraîchi", async () => {
    banc.rpc.mockResolvedValue({ data: null, error: { message: "Des loyers sont déjà appelés jusqu'à 11/2026 : un avenant ne modifie pas un loyer déjà appelé. Sa date d'effet est au plus tôt le 01/12/2026" } });
    const r = await enregistrer({ date_effet: "2026-11-01" });
    expect(r.erreur).toBe("Des loyers sont déjà appelés jusqu'à 11/2026 : un avenant ne modifie pas un loyer déjà appelé. Sa date d'effet est au plus tôt le 01/12/2026");
    expect(r.valeurs?.objet).toBe("Baisse du loyer convenue avec le locataire");
    expect(banc.abandonner).toHaveBeenCalledTimes(1);
    expect(banc.abandonner).toHaveBeenCalledWith({ rpc: banc.rpc }, PIECE);
    expect(banc.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("action annulerAvenantBail", () => {
  const annuler = (motif: string | null, avenant = AVENANT) => {
    const f = new FormData();
    if (motif !== null) f.set("motif_annulation", motif);
    return annulerAvenantBail(ORG, BAIL, avenant, {}, f);
  };

  it("sans compte gestionnaire, ou identifiant invalide : accès refusé", async () => {
    expect(await annuler("Erreur de saisie.", "avenant")).toEqual({ erreur: "Accès refusé." });
    banc.acces.mockResolvedValue({ user: null, supabase: { rpc: banc.rpc } });
    expect(await annuler("Erreur de saisie.")).toEqual({ erreur: "Accès refusé." });
    expect(banc.rpc).not.toHaveBeenCalled();
  });

  it.each([[null], ["   "], ["non"], ["x".repeat(501)]])("motif %j : refus à l'écran, la base n'est pas appelée", async (motif) => {
    expect((await annuler(motif)).erreur).toBe("Indiquez le motif de l’annulation (5 à 500 caractères).");
    expect(banc.rpc).not.toHaveBeenCalled();
  });

  it("motif valable : transmis épuré ; le message dit que rien ne change et que la pièce reste", async () => {
    const r = await annuler("  Erreur de saisie sur le montant.  ");
    expect(r).toEqual({ succes: "Avenant annulé : le loyer et les charges du bail restent ceux d’avant. Sa pièce reste au dossier." });
    expect(banc.rpc).toHaveBeenCalledWith("annuler_avenant_bail", { p_org: ORG, p_avenant: AVENANT, p_motif: "Erreur de saisie sur le montant." });
    expect(banc.revalidatePath.mock.calls.map(([c]) => c)).toContain(`/agence/${ORG}/baux/${BAIL}`);
  });

  it("la base refuse (avenant déjà appliqué) : son motif est rendu, rien n'est rafraîchi", async () => {
    banc.rpc.mockResolvedValue({ data: null, error: { message: "Cet avenant est déjà appliqué au bail : il ne s'annule plus. Une nouvelle modification passe par un nouvel avenant" } });
    expect((await annuler("Trop tard pour revenir en arrière.")).erreur).toBe("Cet avenant est déjà appliqué au bail : il ne s'annule plus. Une nouvelle modification passe par un nouvel avenant");
    expect(banc.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("rubrique « Avenant au bail » de la fiche du bail", () => {
  const BAIL_EN_COURS = { etat: "actif", loyer_hc: 700, charges: 50.5, charges_mode: "provision", date_debut: "2025-10-01", date_fin: null };
  const ligne = (plus: Ligne = {}): Ligne => ({
    id: AVENANT, organization_id: ORG, bail_id: BAIL, objet: "Baisse du loyer convenue avec le locataire", signe_le: "2026-11-20", date_effet: "2026-12-01",
    ancien_loyer_hc: 700, nouveau_loyer_hc: 650, anciennes_charges: 50.5, nouvelles_charges: 50.5, document_id: "doc-1",
    enregistre_le: "2026-11-21T09:00:00Z", applique_le: null, annule_le: null, annulation_motif: null, ...plus,
  });
  async function rendre(o: { avenants?: Ligne[]; appels?: Ligne[]; bail?: Record<string, unknown>; lectureSeule?: boolean; erreurAvenants?: string; erreurAppels?: string } = {}) {
    const supabase = fauxClient({
      avenants_bail: table("avenants_bail", o.avenants ?? [], o.erreurAvenants),
      appels_loyer: table("appels_loyer", o.appels ?? [{ id: "a1", organization_id: ORG, bail_id: BAIL, periode: "2026-10-01" }, { id: "a2", organization_id: ORG, bail_id: BAIL, periode: "2026-11-01" }], o.erreurAppels),
    });
    const element = await RubriqueAvenantsBail({
      supabase: supabase as never, orgId: ORG, bailId: BAIL, base: `/agence/${ORG}`,
      bail: { ...BAIL_EN_COURS, ...(o.bail ?? {}) } as never, lectureSeule: o.lectureSeule,
    });
    return element ? renderToStaticMarkup(element) : "";
  }

  it("rien n'attend : les deux temps, le formulaire prérempli aux montants actuels, et ce qu'il faut savoir", async () => {
    const html = await rendre();
    const t = texte(html);
    expect(t).toContain("Préparer une modification, puis enregistrer l’avenant signé");
    expect(t).toContain("1. Préparer l’avenant à faire signer");
    expect(t).toContain("2. Enregistrer l’avenant signé");
    expect(html).toContain("data-enregistrer-avenant");
    // La première date proposée suit le dernier loyer appelé (novembre) ; douze mois en tout.
    expect(html).toMatch(/<select[^>]*name="date_effet"[^>]*>\s*<option value="2026-12-01"[^>]*>1er décembre 2026<\/option>/);
    expect(html.match(/<option value="/g)).toHaveLength(12);
    expect(html).toMatch(/name="loyer_hc"[^>]*value="700"/);
    // 50.5 s'écrit « 50,5 » : c'est ainsi que le serveur le relit.
    expect(html).toMatch(/name="charges"[^>]*value="50,5"/);
    expect(html).toMatch(/<input(?=[^>]*name="signe_le")(?=[^>]*max="2026-11-22")(?=[^>]*type="date")[^>]*>/);
    expect(html).toMatch(/type="file"[^>]*name="fichier"|name="fichier"[^>]*type="file"/);
    expect(t).toContain("Provision pour charges après l’avenant");
    expect(t).toContain("un loyer déjà appelé n’est jamais modifié");
    expect(t).toContain("Le dépôt de garantie ne change pas.");
    expect(t).toContain("Gerimmo ne contrôle pas ici l’encadrement des loyers");
    expect(t).toContain("la hausse du loyer est refusée, par prudence");
    expect(html).not.toContain("data-annuler-avenant");
    expect(html).not.toContain("data-avenants-enregistres");
    // Rubrique repliée tant que rien n'attend.
    expect(html).not.toMatch(/<details id="avenant"[^>]* open/);
  });

  it("bail repris en cours sans loyer encore appelé : la première date proposée est le mois de la reprise, pas 2024", async () => {
    const html = await rendre({ appels: [], bail: { date_debut: "2024-03-15", loyers_suivis_depuis: "2026-11-01" } });
    expect(html).toMatch(/<select[^>]*name="date_effet"[^>]*>\s*<option value="2026-11-01"/);
    expect(html).not.toContain('value="2024-');
  });

  it("forfait de charges : le champ le dit", async () => {
    expect(texte(await rendre({ bail: { charges_mode: "forfait" } }))).toContain("Forfait de charges après l’avenant");
  });

  it("un avenant attend : le résumé de la rubrique dit le mois, elle montre l'avenant et son annulation — plus de formulaire", async () => {
    const html = await rendre({ avenants: [ligne()] });
    const t = texte(html);
    // Jamais ouverte d'office : elle se refermerait seule à l'annulation, en emportant la confirmation. Le résumé,
    // lisible rubrique fermée, porte l'information.
    expect(html).not.toMatch(/<details id="avenant"[^>]* open/);
    expect(html).toMatch(/<span class="dossier-rubrique-resume">Un avenant s’appliquera au loyer de décembre 2026<\/span>/);
    expect(t).toContain("Un avenant s’appliquera au loyer de décembre 2026");
    expect(t).toContain("Un avenant attend sa date d’effet.");
    expect(t).toContain("En attente de sa date d’effet · signé le 20/11/2026 · effet au 1er décembre 2026");
    expect(t).toMatch(/Loyer hors charges : 700,00\s€ → 650,00\s€/);
    // Les charges n'ont pas bougé : elles ne sont pas listées comme un changement.
    expect(t).not.toMatch(/Provision pour charges : 50,50/);
    expect(html).toContain(`href="/agence/${ORG}/documents/doc-1/fichier"`);
    expect(html).toContain("data-annuler-avenant");
    expect(html).toContain('name="motif_annulation"');
    expect(html).not.toContain("data-enregistrer-avenant");
    expect(html).not.toContain("data-avenant-a-savoir");
  });

  it("« de » s'élide devant un mois qui commence par une voyelle : « au loyer d’août », jamais « de août »", async () => {
    for (const [effet, attendu] of [["2027-08-01", "d’août 2027"], ["2027-04-01", "d’avril 2027"], ["2027-10-01", "d’octobre 2027"]] as const) {
      const t = texte(await rendre({ avenants: [ligne({ date_effet: effet })] }));
      expect(t).toContain(`Un avenant s’appliquera au loyer ${attendu}`);
      expect(t).toContain(`Il s’appliquera de lui-même au loyer ${attendu} ;`);
      expect(t).not.toMatch(/\bde (août|avril|octobre)\b/);
    }
  });

  it("historique : l'avenant appliqué et l'avenant annulé se lisent avec leur état, leurs montants et leur pièce", async () => {
    const html = await rendre({ avenants: [
      ligne({ id: "44444444-4444-4444-8444-444444444444", objet: "Provision portée à 80 euros", date_effet: "2026-06-01", signe_le: "2026-05-12", enregistre_le: "2026-05-13T09:00:00Z",
        applique_le: "2026-06-01T04:00:00Z", ancien_loyer_hc: 700, nouveau_loyer_hc: 700, anciennes_charges: 50.5, nouvelles_charges: 80, document_id: "doc-2" }),
      ligne({ id: "55555555-5555-4555-8555-555555555555", objet: "Hausse abandonnée", date_effet: "2026-09-01", signe_le: "2026-08-02", enregistre_le: "2026-08-03T09:00:00Z",
        annule_le: "2026-08-10T10:00:00Z", annulation_motif: "Les parties y ont renoncé.", nouveau_loyer_hc: 720, document_id: "doc-3" }),
    ] });
    const t = texte(html);
    expect(html).toContain("data-avenants-enregistres");
    expect(html).toContain('data-etat-avenant="applique"');
    expect(html).toContain('data-etat-avenant="annule"');
    expect(t).toContain("Appliqué au bail · signé le 12/05/2026 · effet au 1er juin 2026");
    expect(t).toMatch(/Provision pour charges : 50,50\s€ → 80,00\s€/);
    expect(t).toContain("Annulé · signé le 02/08/2026 · effet au 1er septembre 2026");
    expect(t).toContain("Annulé le 10/08/2026 : Les parties y ont renoncé.");
    expect(html).toContain("/documents/doc-2/fichier");
    expect(html).toContain("/documents/doc-3/fichier");
    // Aucun n'attend : le formulaire reste proposé.
    expect(html).toContain("data-enregistrer-avenant");
  });

  it("une lecture en panne (avenants ou loyers) se dit, et retire le formulaire plutôt que de proposer une date fausse", async () => {
    for (const panne of [{ erreurAvenants: "panne" }, { erreurAppels: "panne" }]) {
      const html = await rendre(panne);
      expect(texte(html)).toContain("Les avenants de ce bail ne peuvent pas être lus pour le moment : rechargez la page avant d’en enregistrer un.");
      expect(html).not.toContain("data-gestes-avenant");
      // Préparer le texte à faire signer reste possible : cela n'écrit rien.
      expect(texte(html)).toContain("1. Préparer l’avenant à faire signer");
    }
  });

  it("le bail se termine avant le prochain loyer à appeler : aucun formulaire, et la raison", async () => {
    const html = await rendre({ bail: { etat: "preavis", date_fin: "2026-11-30" } });
    expect(html).toContain("data-avenant-sans-date");
    expect(html).not.toContain("data-enregistrer-avenant");
  });

  it("supervision en lecture seule : l'historique et l'avenant en attente se lisent, aucun geste n'est proposé", async () => {
    const html = await rendre({ avenants: [ligne()], lectureSeule: true });
    expect(texte(html)).toContain("Un avenant attend sa date d’effet.");
    expect(html).not.toContain("data-gestes-avenant");
    expect(html).not.toContain("data-annuler-avenant");
  });

  it("bail terminé : seul l'historique reste ; sans avenant, la rubrique n'existe pas ; un brouillon n'en a jamais", async () => {
    expect(await rendre({ bail: { etat: "termine" } })).toBe("");
    expect(await rendre({ bail: { etat: "brouillon" }, avenants: [ligne()] })).toBe("");
    const html = await rendre({ bail: { etat: "termine" }, avenants: [ligne({ applique_le: "2026-12-01T04:00:00Z" })] });
    const t = texte(html);
    expect(t).toContain("Avenants enregistrés pendant la location");
    expect(t).toContain("Appliqué au bail");
    expect(t).not.toContain("1. Préparer l’avenant à faire signer");
    expect(html).not.toContain("data-gestes-avenant");
  });

  it("l'écran et les actions ne citent aucun article de loi et ne promettent aucune conformité", () => {
    for (const f of ["src/app/agence/[orgId]/baux/[bailId]/avenants-bail.tsx", "src/app/agence/[orgId]/baux/[bailId]/gestes-avenant-signe.tsx", "src/app/actions/avenant-bail.ts", "src/lib/avenants-bail.ts"]) {
      const source = readFileSync(f, "utf8");
      expect(source, f).not.toMatch(/\b(art\.|article|loi n°|décret)\s*\d/i);
      expect(source, f).not.toMatch(/conforme (à la loi|au droit)|légalement valable/i);
    }
  });
});
