/**
 * Plan de conformité du 23/10/2026, lot 4 (constat R47) : le tableau des durées de /confidentialite et sa liste de
 * référence (src/lib/durees-conservation.ts) disent la même chose.
 *
 * La page est RENDUE (identité fictive, sans base) ; chaque ligne des tableaux « Combien de temps » doit avoir sa
 * référence, et la durée écrite dans la cellule « Durée » doit être celle de la référence, en mois.
 *
 * À l'intégration, ce test sera complété par la comparaison avec la table `retention_rules` (durée et libellé exact du
 * déclencheur de chaque `data_type`, `reglesAnnoncees()`). D'ici là, la liste est comparée au tableau du lot 2 du plan
 * (PLAN_LOT_2 ci-dessous), qui fixe les règles nouvelles ou modifiées.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DUREES_CONSERVATION, dureesDuTexte, moisDeLExpression, reglesAnnoncees } from "../src/lib/durees-conservation";
import { PRESTATAIRES, cleCoordonnees } from "../src/lib/editeur";

const lecture = vi.hoisted(() => ({ valeurs: {} as Record<string, string | null> }));
vi.mock("@/lib/editeur-serveur", () => ({
  lireEditeur: async () => ({ editeur: lecture.valeurs, indisponible: false }),
}));
vi.mock("@/components/chrome-public", () => ({ EnTetePublic: () => null, PiedPublic: () => null }));
import Confidentialite from "../src/app/confidentialite/page";

beforeEach(() => {
  lecture.valeurs = {
    denomination: "Personne fictive EI", forme: "Entrepreneur individuel (EI)", siege: "1 rue Exemple, Paris",
    email: "contact@example.test", telephone: "01 00 00 00 00", localisationBan: "France",
    ...Object.fromEntries(PRESTATAIRES.map((p) => [cleCoordonnees(p), "Coordonnées fictives"])),
  };
});

const texte = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

type Ligne = { donnees: string; duree: string; depart: string };

/** Les lignes des tableaux de l'article « Combien de temps », telles que le visiteur les lit. */
async function lignesDuTableau(): Promise<Ligne[]> {
  const html = renderToStaticMarkup(await Confidentialite());
  const debut = html.indexOf(">Combien de temps</h2>");
  expect(debut, "article « Combien de temps » introuvable").toBeGreaterThan(0);
  const article = html.slice(debut, html.indexOf("</section>", debut));
  const lignes: Ligne[] = [];
  for (const [, corps] of article.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)) {
    for (const [, tr] of corps.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      const cellules = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => texte(m[1]));
      expect(cellules, tr).toHaveLength(3);
      lignes.push({ donnees: cellules[0], duree: cellules[1], depart: cellules[2] });
    }
  }
  return lignes;
}

const referencesDe = (l: Ligne) => DUREES_CONSERVATION.filter((d) => l.donnees.startsWith(d.donnees));

describe("le tableau des durées de /confidentialite et sa liste de référence", () => {
  it("chaque ligne du tableau a sa référence, et chaque référence sa ligne", async () => {
    const lignes = await lignesDuTableau();
    expect(lignes.length).toBeGreaterThanOrEqual(40);
    for (const l of lignes) expect(referencesDe(l).length, `sans référence : « ${l.donnees} »`).toBeGreaterThan(0);
    for (const d of DUREES_CONSERVATION) {
      const trouvees = lignes.filter((l) => l.donnees.startsWith(d.donnees));
      expect(trouvees, `référence sans ligne, ou ambiguë : « ${d.donnees} »`).toHaveLength(1);
    }
  });

  it("la durée écrite dans chaque ligne est celle de la référence, en mois", async () => {
    for (const l of await lignesDuTableau()) {
      const refs = referencesDe(l);
      for (const r of refs) expect(l.duree, `« ${l.donnees} »`).toContain(r.duree_affichee);
      const attendues = [...new Set(refs.map((r) => r.duree_mois).filter((m): m is number => m !== null))].sort((a, b) => a - b);
      const lues = [...new Set(dureesDuTexte(l.duree))].sort((a, b) => a - b);
      expect(lues, `« ${l.donnees} » : ${l.duree}`).toEqual(attendues);
    }
  });

  it("chaque référence est cohérente : durée affichée = durée en mois, règle tenue quelque part", () => {
    for (const d of DUREES_CONSERVATION) {
      expect(moisDeLExpression(d.duree_affichee), d.donnees).toBe(d.duree_mois);
      expect(d.declencheur.trim().length, d.donnees).toBeGreaterThan(0);
      if (d.data_type) {
        expect(d.data_type).toMatch(/^[a-z_]+:[a-z_]+$/);
        expect(d.actif_au_deploiement, d.data_type).not.toBeNull();
        expect(d.tenue_par, d.data_type).toBeUndefined();
      } else {
        expect(d.actif_au_deploiement, d.donnees).toBeNull();
        expect(d.tenue_par?.trim().length, d.donnees).toBeGreaterThan(0);
      }
    }
  });

  it("une même règle a partout la même durée et le même déclencheur", () => {
    for (const r of reglesAnnoncees()) {
      for (const d of DUREES_CONSERVATION.filter((x) => x.data_type === r.data_type)) {
        expect([d.duree_mois, d.declencheur], r.data_type).toEqual([r.duree_mois, r.declencheur]);
      }
    }
  });

  it("le parseur lit les formes de la page et ignore préavis et jours", () => {
    expect(moisDeLExpression("3 ans")).toBe(36);
    expect(moisDeLExpression("1 an")).toBe(12);
    expect(moisDeLExpression("vingt-quatre mois")).toBe(24);
    expect(moisDeLExpression("trois ans")).toBe(36);
    expect(moisDeLExpression("1 jour")).toBeNull();
    expect(moisDeLExpression("Tant que le compte existe")).toBeNull();
    expect(dureesDuTexte("Tant que le compte est utilisé ; suppression vingt-quatre mois après la dernière connexion (deux mois puis quinze jours avant)")).toEqual([24]);
    expect(dureesDuTexte("5 ans, puis suppression ; vous êtes prévenu 30 jours avant")).toEqual([60]);
    expect(dureesDuTexte("1 an ; 3 ans pour les accès de la supervision")).toEqual([12, 36]);
    expect(dureesDuTexte("au plus tard trois ans après votre inscription ; dans le mois de votre demande de retrait")).toEqual([36]);
  });
});

/**
 * Le lot 2 du plan du 23/10 (règles nouvelles ou modifiées), libellés de déclencheur exacts. Remplacé à l'intégration
 * par la lecture de `retention_rules`.
 */
const PLAN_LOT_2: [string, number, string][] = [
  ["document:bail", 36, "Fin du bail"],
  ["document:etat_des_lieux", 36, "Fin du bail"],
  ["document:courrier", 36, "Fin du bail"],
  ["document:attestation_assurance", 36, "Fin du bail"],
  ["document:reglement_copropriete", 36, "Fin du bail"],
  ["document:piece_identite", 36, "Fin du dernier bail"],
  ["document:justificatif", 36, "Fin du dernier bail"],
  ["document:autre", 60, "Dépôt"],
  ["document:quittance", 36, "Fin du bail"],
  ["document:rapport_gestion", 120, "Émission"],
  ["document:mandat", 60, "Fin du mandat"],
  ["preuve:signature", 36, "Fin du bail"],
  ["journal:audit_log", 12, "Action"],
  ["journal:audit_controle_interne", 36, "Action"],
  ["invitation:locataire", 3, "Expiration ou refus/annulation"],
  ["invitation:artisan", 3, "Expiration ou refus/annulation"],
  ["compte:invitation_jamais_utilisee", 3, "Expiration, refus ou annulation de la dernière invitation"],
  ["compte:inscription_non_confirmee", 1, "Création de l'inscription"],
  ["compte:inactif", 24, "Dernière connexion d'un membre ou fin du dernier abonnement payé"],
  ["dossier:sans_bail", 3, "Dernier dépôt de pièce sur une personne sans bail"],
  ["personne:fiche", 36, "Fin du dernier bail et clôture des comptes"],
  ["message:locatif", 24, "Fin du dernier bail et clôture des comptes"],
  ["comptable:loyers", 36, "Fin du dernier bail et clôture des comptes"],
  ["incident:dossier", 24, "Clôture de l'incident"],
  ["archive:preuve_contrat", 120, "Fin du dernier abonnement payé"],
  ["contrat:retractation", 120, "Date de la rétractation"],
  ["support:demande_droits", 36, "Clôture de la demande"],
  ["support:question_idee", 24, "Dernier échange"],
  ["support:contestation", 36, "Clôture de la contestation"],
  ["artisan:evaluation", 36, "Dépôt de l'évaluation"],
  ["contact:attente", 36, "Inscription"],
  ["contact:attente_agences", 36, "Inscription"],
  ["contact:prospect", 36, "Dernier contact émanant du prospect"],
  ["prospect:opposition", 36, "Opposition"],
  ["journal:abonnement_evenements", 6, "Traitement de l'événement"],
  ["journal:effacements_a_reappliquer", 4, "Exécution de la fermeture"],
];

describe("la liste de référence reprend le lot 2 du plan du 23/10", () => {
  it("chaque règle du lot 2 est annoncée par la page, avec sa durée et son déclencheur exact", () => {
    const annoncees = new Map(reglesAnnoncees().map((r) => [r.data_type, r]));
    for (const [dataType, mois, declencheur] of PLAN_LOT_2) {
      const r = annoncees.get(dataType);
      expect(r, `${dataType} n'est pas annoncée`).toBeDefined();
      expect([r?.duree_mois, r?.declencheur], dataType).toEqual([mois, declencheur]);
    }
  });

  it("décision du 23/10 (éditeur non commerçant) : factures de Gerimmo six ans, preuve du contrat dix ans", () => {
    const factures = DUREES_CONSERVATION.find((d) => d.donnees === "Factures d’abonnement émises par Gerimmo");
    expect(factures?.duree_mois).toBe(72);
    expect(DUREES_CONSERVATION.find((d) => d.data_type === "archive:preuve_contrat")?.duree_mois).toBe(120);
    expect(DUREES_CONSERVATION.find((d) => d.data_type === "contrat:retractation")?.duree_mois).toBe(120);
    // Les rapports de gestion des agences gardent leurs dix ans (C. com. L. 123-22, propre aux agences commerçantes).
    expect(DUREES_CONSERVATION.find((d) => d.data_type === "document:rapport_gestion")?.duree_mois).toBe(120);
  });
});
