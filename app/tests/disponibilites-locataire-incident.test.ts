/**
 * LE LOCATAIRE DIT SES DISPONIBILITÉS DÈS QU'IL SIGNALE UN INCIDENT — audit palier 1 du 22/11/2026, P2-02. Côté
 * application, sans base.
 *
 * Ces tests tiennent :
 *  1. l'action enregistre les disponibilités APRÈS le signalement, sur le dossier qui vient d'être créé ; sans texte,
 *     elle n'appelle rien ;
 *  2. un texte trop long est refusé AVANT tout signalement ;
 *  3. si l'enregistrement des disponibilités échoue, le signalement reste envoyé et l'écran le dit ;
 *  4. la copie locale du formulaire garde le champ, et une copie d'avant ce champ reste valable.
 * La base est tenue par tests/disponibilites-locataire-incident-base.test.ts, les écrans par
 * e2e/disponibilites-locataire.spec.ts.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({ rpc: vi.fn(), documents: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({
  verifierLocataire: async () => ({ user: { id: "locataire-test" }, supabase: { rpc: banc.rpc, from: banc.documents, storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) } } }),
  verifierGerant: async () => ({ user: null, supabase: {} }),
}));
vi.mock("@/lib/notifications", () => ({
  notifierIncidentUrgentDeclare: vi.fn(), notifierDevisDemande: vi.fn(),
  notifierMissionAnnulee: vi.fn(), notifierMissionConfiee: vi.fn(), notifierRendezVousFixe: vi.fn(),
}));

import { declarerMonIncident } from "@/app/actions/incidents";
import { declarationDuBrouillon, validerBrouillonIncident, type BrouillonIncident } from "@/lib/brouillons-personne-incident";
import { DISPONIBILITES_LOCATAIRE_MAX } from "@/lib/incidents";

const COMMANDE = "11111111-1111-4111-8111-111111111111";
let echecDisponibilites = false;
// Lot 47 : le type de l'espace, lu dans `organisations_portail` pour nommer l'interlocuteur du locataire.
let typeEspace = "agence";

beforeEach(() => {
  vi.clearAllMocks();
  echecDisponibilites = false;
  typeEspace = "agence";
  banc.rpc.mockImplementation(async (nom: string) => {
    if (nom === "declarer_mon_incident_reprise") return { data: { incident_id: "incident-test", rejoue: false }, error: null };
    if (nom === "indiquer_mes_disponibilites_incident" && echecDisponibilites) return { data: null, error: { message: "Signalement introuvable" } };
    return { data: null, error: null };
  });
  const chaine = { eq: vi.fn(), then: (resolve: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve) };
  chaine.eq.mockReturnValue(chaine);
  banc.documents.mockImplementation((table: string) =>
    table === "organisations_portail"
      ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { type: typeEspace }, error: null }) }) }) }
      : { select: () => chaine });
});

function declaration(disponibilites?: string) {
  const f = new FormData();
  f.set("commande", COMMANDE);
  f.set("categorie", "plomberie_canalisation");
  f.set("piece", "Cuisine");
  f.set("description", "Fuite sous l'évier");
  f.set("urgence", "normale");
  if (disponibilites !== undefined) f.set("disponibilites", disponibilites);
  return f;
}
const appels = (nom: string) => banc.rpc.mock.calls.filter(([n]) => n === nom);

describe("signalement du locataire : ses disponibilités", () => {
  it("enregistrées après le signalement, sur le dossier créé, espaces de bord retirés", async () => {
    const r = await declarerMonIncident("org-test", {}, declaration("  En semaine après 18 h, samedi matin  "));
    expect(r.erreur).toBeUndefined();
    expect(r.avertissement).toBeUndefined();
    expect(r.succes).toContain("Signalement envoyé");
    expect(appels("indiquer_mes_disponibilites_incident")).toEqual([["indiquer_mes_disponibilites_incident", { p_incident: "incident-test", p_disponibilites: "En semaine après 18 h, samedi matin" }]]);
    // Le signalement d'abord, les disponibilités ensuite.
    const ordre = banc.rpc.mock.calls.map(([n]) => n as string);
    expect(ordre.indexOf("declarer_mon_incident_reprise")).toBeLessThan(ordre.indexOf("indiquer_mes_disponibilites_incident"));
  });

  it.each([undefined, "", "    "])("sans disponibilités (%j) : aucun appel de plus, le signalement part comme avant", async (texte) => {
    const r = await declarerMonIncident("org-test", {}, declaration(texte));
    expect(r.succes).toContain("Signalement envoyé");
    expect(appels("indiquer_mes_disponibilites_incident")).toEqual([]);
  });

  it("trop longues : refus avant tout signalement, la saisie est rendue", async () => {
    const r = await declarerMonIncident("org-test", {}, declaration("x".repeat(DISPONIBILITES_LOCATAIRE_MAX + 1)));
    expect(r.erreur).toBe("Indiquez vos disponibilités en 300 caractères au plus.");
    expect(r.valeurs).toMatchObject({ piece: "Cuisine" });
    expect(banc.rpc).not.toHaveBeenCalled();
    expect((await declarerMonIncident("org-test", {}, declaration("x".repeat(DISPONIBILITES_LOCATAIRE_MAX)))).erreur).toBeUndefined();
  });

  it("si leur enregistrement échoue, le signalement reste envoyé et l'écran le dit", async () => {
    echecDisponibilites = true;
    const r = await declarerMonIncident("org-test", {}, declaration("Samedi matin"));
    expect(r.erreur).toBeUndefined();
    expect(r.incidentId).toBe("incident-test");
    expect(r.succes).toContain("Signalement envoyé");
    expect(r.avertissement).toBe("Vos disponibilités n’ont pas pu être enregistrées : indiquez-les à votre gestionnaire par message.");
  });

  // Lot 47 : chez un propriétaire qui gère lui-même, le locataire écrit à son bailleur, pas à un gestionnaire.
  it("chez un propriétaire, l'avertissement et le succès nomment le bailleur", async () => {
    echecDisponibilites = true;
    typeEspace = "proprietaire_direct";
    const r = await declarerMonIncident("org-test", {}, declaration("Samedi matin"));
    expect(r.avertissement).toBe("Vos disponibilités n’ont pas pu être enregistrées : indiquez-les à votre bailleur par message.");
    expect(r.succes).toContain("Signalement envoyé — votre bailleur le verra dans son espace à sa prochaine connexion.");
    expect(`${r.succes} ${r.avertissement}`).not.toContain("gestionnaire");
  });
});

describe("copie locale du formulaire de signalement", () => {
  const brouillon = (sur: Partial<BrouillonIncident> = {}): BrouillonIncident => ({
    commande: COMMANDE, categorie: "plomberie_joint", piece: "Cuisine", description: "Fuite", anciennete: "", urgence: "normale", photos: [], envoye: false, bilan: {}, ...sur,
  });

  it("le champ part avec la déclaration quand il est rempli, et seulement alors", () => {
    expect(declarationDuBrouillon(brouillon({ disponibilites: "  Samedi matin " })).get("disponibilites")).toBe("Samedi matin");
    expect(declarationDuBrouillon(brouillon()).has("disponibilites")).toBe(false);
    expect(declarationDuBrouillon(brouillon({ disponibilites: "   " })).has("disponibilites")).toBe(false);
  });

  it("une copie d'avant ce champ reste valable ; une copie au champ trop long est écartée", () => {
    const ancienne = { commande: COMMANDE, categorie: "plomberie_joint", piece: "Cuisine", description: "Fuite", anciennete: "", urgence: "normale", photos: [], envoye: false, bilan: {} };
    expect(validerBrouillonIncident(ancienne)).toMatchObject({ categorie: "plomberie_joint" });
    expect(validerBrouillonIncident({ ...ancienne, disponibilites: "Samedi matin" })).toMatchObject({ disponibilites: "Samedi matin" });
    expect(validerBrouillonIncident({ ...ancienne, disponibilites: "x".repeat(301) })).toBeNull();
  });
});

// Défaut trouvé par le parcours navigateur le 22/11 : les disponibilités n'étaient affichées que dans la vue de
// l'agence ; le propriétaire en gestion directe ne les voyait pas. Ce test tient les deux vues du dossier.
describe("dossier d'incident : les disponibilités du locataire sont affichées dans les deux vues", () => {
  const ecran = readFileSync("src/app/agence/[orgId]/incidents/pane-incident.tsx", "utf8");
  it("vue du propriétaire : dans l'en-tête, sans avoir à déplier « Signalement, contacts et pièces jointes »", () => {
    const presentation = ecran.slice(ecran.indexOf("const presentationSignalement ="), ecran.indexOf("const blocDecision ="));
    const lieu = presentation.slice(presentation.indexOf("lieu={"), presentation.indexOf("informations={"));
    expect(lieu).toContain("{incident.disponibilites_locataire && <small data-disponibilites-locataire>Disponibilités du locataire : {incident.disponibilites_locataire}</small>}");
  });
  it("vue de l'agence : dans la carte du signalement ; aucune ligne conditionnée au propriétaire dans la vue de l'agence", () => {
    const carte = ecran.slice(ecran.indexOf('<Card className="incident-signalement">'));
    expect(carte).toContain('<div className="ligne-info" data-disponibilites-locataire>');
    expect(ecran).not.toContain("estProprietaire && incident.disponibilites_locataire");
    expect(ecran.match(/data-disponibilites-locataire/g)).toHaveLength(2);
  });
});
