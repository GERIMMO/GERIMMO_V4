import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => banc }));

import { IncidentsLot, PersonnesLot, type BailPersonnesLot } from "@/app/agence/[orgId]/parc/[bienId]/lots/[lotId]/personnes-incidents-lot";

type Ligne = Record<string, unknown>;
type Requete = { table: string; colonnes: string; filtres: [string, string, unknown][]; debut?: number; fin?: number; plafond?: number };
let donnees: Record<string, Ligne[]>;
let echec: (requete: Requete) => boolean;
let requetes: Requete[];
const props = { orgId: "org", lotId: "lot", base: "/espace/org", lectureSeule: false };
const bail = (id = "bail", etat = "actif", principal: string | null = "principal") => ({ id, etat, locataire_principal: principal, chambre_id: null, organization_id: "org", lot_id: "lot" });
const identite = (id: string, nom: string) => ({ id, nom, prenom: null, telephone: "0600000000", email: `${id}@exemple.fr`, organization_id: "org" });
const lien = (id: string, role = "colocataire", depart: string | null = null, garanti: string | null = null) => ({ bail_id: "bail", person_id: id, role, date_depart: depart, garant_de: garanti, organization_id: "org" });
const incident = (id: string, etat = "declare", urgence = "normale") => ({ id, etat, urgence, numero: `INC-${id}`, categorie: "chauffage_panne", description: `Dossier ${id}`, piece: "Cuisine", created_at: "2026-10-01T12:00:00Z", organization_id: "org", lot_id: "lot" });

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
  requetes = []; echec = () => false;
  donnees = { baux: [bail()], bail_personnes: [], persons: [identite("principal", "Dupont")], lot_chambres: [], incidents: [] };
  banc.from.mockImplementation((table: string) => {
    const requete: Requete = { table, colonnes: "", filtres: [] };
    requetes.push(requete);
    const q = {
      select: (colonnes: string) => { requete.colonnes = colonnes; return q; },
      eq: (cle: string, valeur: unknown) => { requete.filtres.push(["eq", cle, valeur]); return q; },
      neq: (cle: string, valeur: unknown) => { requete.filtres.push(["neq", cle, valeur]); return q; },
      in: (cle: string, valeur: unknown[]) => { requete.filtres.push(["in", cle, valeur]); return q; },
      order: () => q,
      range: (debut: number, fin: number) => { requete.debut = debut; requete.fin = fin; return q; },
      limit: (plafond: number) => { requete.plafond = plafond; return q; },
      then: (resolve: (value: unknown) => unknown) => {
        const lignes = (donnees[table] ?? []).filter(ligne => requete.filtres.every(([operation, cle, valeur]) => operation === "eq" ? ligne[cle] === valeur : operation === "neq" ? ligne[cle] !== valeur : (valeur as unknown[]).includes(ligne[cle])));
        return Promise.resolve(echec(requete) ? { data: null, error: { message: "Lecture refusée" }, count: null } : {
          data: lignes.slice(requete.debut ?? 0, requete.fin !== undefined ? requete.fin + 1 : requete.plafond), error: null, count: lignes.length,
        }).then(resolve);
      },
    };
    return q;
  });
});
afterEach(() => { vi.useRealTimers(); });

const rendrePersonnes = async (baux: BailPersonnesLot[] = [bail()], erreurBaux = false) => renderToStaticMarkup(await PersonnesLot({ ...props, baux, erreurBaux }));
const rendreIncidents = async (lectureSeule = false) => renderToStaticMarkup(await IncidentsLot({ ...props, lectureSeule }));

describe("Personnes de la fiche lot", () => {
  it("distingue une absence de location d'une lecture des baux impossible", async () => {
    expect(await rendrePersonnes([])).toContain("Aucun locataire ni garant");
    const html = await rendrePersonnes([], true);
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("Aucun locataire");
    expect(requetes).toHaveLength(0);
  });

  it("conserve les colocataires et leurs garants, sépare les départs, sans lire de données de naissance", async () => {
    donnees.bail_personnes = [lien("principal"), lien("coloc"), lien("ancien", "colocataire", "2026-09-01"), lien("garant", "garant", null, "coloc")];
    donnees.persons.push(identite("coloc", "Martin"), identite("ancien", "Bernard"), identite("garant", "Petit"));
    const html = await rendrePersonnes();
    expect(html.match(/href="\/espace\/org\/personnes\/principal"/g)).toHaveLength(1);
    expect(html).toContain("Garant de Martin");
    expect(html).toContain("Anciens colocataires · 1");
    expect(html.indexOf("Bernard")).toBeGreaterThan(html.indexOf("<details"));
    expect(html).toContain('href="tel:0600000000"');
    for (const requete of requetes) expect(requete.filtres).toContainEqual(["eq", "organization_id", "org"]);
    expect(requetes.find(q => q.table === "baux")?.filtres).toContainEqual(["eq", "lot_id", "lot"]);
    expect(requetes.find(q => q.table === "bail_personnes")?.filtres).toContainEqual(["in", "bail_id", ["bail"]]);
    expect(requetes.find(q => q.table === "persons")?.colonnes).not.toContain("date_naissance");
  });

  it("ne présente pas un bail clôturé entre deux lectures comme une occupation actuelle", async () => {
    donnees.baux = [bail("bail", "termine")];
    expect(await rendrePersonnes()).toContain("Aucun locataire ni garant");
    expect(requetes.map(q => q.table)).toEqual(["baux"]);
  });

  it("ne transforme pas une erreur de liaison en absence de garant", async () => {
    echec = q => q.table === "bail_personnes";
    const html = await rendrePersonnes();
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("Aucun garant");
  });

  it("signale une identité inaccessible et distingue le bail en préparation", async () => {
    donnees.baux = [bail("bail", "brouillon")]; donnees.persons = [];
    const html = await rendrePersonnes([bail("bail", "brouillon")]);
    expect(html).toContain("En préparation");
    expect(html).toContain("Identité indisponible");
    expect(html).toContain("Locataire prévu");
    expect(html).toContain('href="/espace/org/baux/bail#etape-bail-2"');
    expect(html).not.toContain("Aucun locataire actuel");
  });
});

describe("Incidents de la fiche lot", () => {
  it("affiche les urgences avant les autres, avec leur lien direct et un historique replié", async () => {
    donnees.incidents = [incident("normal"), incident("urgent", "en_cours", "urgente"), incident("clos", "clos"), { ...incident("autre-lot"), lot_id: "autre" }];
    const html = await rendreIncidents(true);
    expect(html.indexOf("Dossier urgent")).toBeLessThan(html.indexOf("Dossier normal"));
    expect(html).toContain('href="/espace/org/incidents?sel=urgent"');
    expect(html).toContain('href="/espace/org/incidents?vue=clos&amp;sel=clos"');
    expect(html).toContain("Historique · 1 clôturé");
    expect(html).not.toContain("Dossier autre-lot");
    expect(html).not.toContain("Signaler un incident");
    for (const requete of requetes) {
      expect(requete.filtres).toContainEqual(["eq", "organization_id", "org"]);
      expect(requete.filtres).toContainEqual(["eq", "lot_id", "lot"]);
    }
  });

  it("lit une deuxième page sans perdre les anciens incidents ouverts", async () => {
    donnees.incidents = Array.from({ length: 501 }, (_, i) => incident(String(i)));
    const html = await rendreIncidents();
    expect(html).toContain("Dossier 500");
    expect(requetes.filter(q => q.debut !== undefined).map(q => q.debut)).toEqual([0, 500]);
  });

  it("distingue une erreur des incidents ouverts d'un lot sans incident", async () => {
    echec = q => q.table === "incidents" && q.filtres.some(([operation]) => operation === "neq");
    const html = await rendreIncidents();
    expect(html).toContain("Les incidents en cours n’ont pas pu être chargés");
    expect(html).not.toContain("Aucun incident en cours");
  });
});
