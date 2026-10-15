/**
 * Décision D22 : la réponse de l'artisan à une demande de report (actions accepterDateLocataire et
 * refuserDatesLocataire) et les trois courriers, exécutés de bout en bout sans base ni réseau.
 *
 * Contrairement à rendez-vous-locataire-ecrans.test.ts, `notifierEnCoulisses` n'est PAS remplacé : c'est la vraie
 * fonction qui obtient le client de service (ici un client factice en mémoire) et exécute le rappel ; seul l'envoi
 * de l'e-mail (`envoyerEmail`) est simulé. On observe à qui part le courrier, avec quelle clé d'idempotence et quels
 * mots — ou qu'il ne part pas.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Ligne = Record<string, unknown>;
const sim = vi.hoisted(() => ({
  envoyer: vi.fn(),
  service: null as unknown,
  artisan: null as unknown,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), unstable_rethrow: vi.fn() }));
vi.mock("@/lib/email", () => ({ envoyerEmail: sim.envoyer }));
vi.mock("@/lib/marque-organisation-serveur", () => ({ chargerMarque: async () => null }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => sim.service }));
vi.mock("@/app/artisan/acces", () => ({
  verifierArtisanAction: async () => ({ supabase: sim.artisan, fiche: { id: "art-1" } }),
}));
vi.mock("@/app/artisan/devis/actions-preparation", () => ({ envoyerDevisValide: vi.fn() }));

import { accepterDateLocataire, refuserDatesLocataire } from "@/app/actions/artisan";
import {
  demandeDuCreneau,
  notifierAnnulationRdvLocataire,
  notifierDemandeReportRdv,
  notifierReponseReportRdv,
} from "@/lib/notifications";

/** Un client Supabase en mémoire : `from(table)` filtre par égalité ; `rpc(nom)` lit `rpcs[nom]`. */
function client(tables: Record<string, Ligne[]>, rpcs: Record<string, unknown> = {}) {
  const appels: [string, unknown][] = [];
  return {
    appels,
    rpc: async (nom: string, args?: unknown) => {
      appels.push([nom, args]);
      const r = rpcs[nom];
      if (r && typeof r === "object" && "error" in (r as object)) return r;
      return { data: r ?? null, error: null };
    },
    from(table: string) {
      const filtres: ((l: Ligne) => boolean)[] = [];
      const lignes = () => (tables[table] ?? []).filter((l) => filtres.every((f) => f(l)));
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => { filtres.push((l) => l[c] === v); return q; },
        in: (c: string, v: unknown[]) => { filtres.push((l) => v.includes(l[c])); return q; },
        maybeSingle: async () => ({ data: lignes()[0] ?? null, error: null }),
        then: (suite: (r: { data: Ligne[]; error: null }) => unknown) => Promise.resolve({ data: lignes(), error: null }).then(suite),
      };
      return q;
    },
  };
}

const RDV = { debut: "2026-10-22T07:00:00Z", fin: "2026-10-22T09:00:00Z" };
function demande(partiel: Ligne = {}): Ligne {
  return {
    id: "d1", organization_id: "org-1", intervention_id: "iv-1", type: "report", statut: "en_attente",
    motif_code: "travail", motif_texte: "Réunion imprévue", rdv_debut: RDV.debut, rdv_fin: RDV.fin,
    expire_le: "2026-10-17T08:00:00Z", tardive: false, reponse_motif: null, creneau_accepte_id: null, ...partiel,
  };
}
function base(d: Ligne = demande()) {
  return {
    intervention_demandes_rdv: [d],
    incident_interventions: [{ id: "iv-1", organization_id: "org-1", incident_id: "inc-1", artisan_id: "art-1", debut_prevu: RDV.debut, fin_prevue: RDV.fin, refus_motif: null }],
    incidents: [{ id: "inc-1", organization_id: "org-1", numero: "INC-1", categorie: "plomberie_canalisation", piece: null, description: null, bail_id: "bail-1", declarant_person_id: null, responsable_account_id: null, lot_id: "lot-1" }],
    baux: [{ id: "bail-1", locataire_principal: "p-1" }],
    persons: [{ id: "p-1", organization_id: "org-1", email: "lea@example.invalid", prenom: "Léa" }],
    artisans: [{ id: "art-1", email: "artisan@example.invalid", raison_sociale: "TEST" }],
    intervention_creneaux: [
      { id: "cr-2", organization_id: "org-1", demande_id: "d1", debut: "2026-10-24T12:00:00Z", fin: "2026-10-24T16:00:00Z" },
      { id: "cr-libre", organization_id: "org-1", demande_id: null, debut: "2026-10-25T07:00:00Z", fin: "2026-10-25T09:00:00Z" },
    ],
  };
}
function service(d?: Ligne) {
  return client(base(d), { org_membres_gerants: [{ account_id: "g-1", email: "gerant@example.invalid", role: "admin_agence" }] });
}
function artisan(rpcs: Record<string, unknown> = {}) {
  return client({}, { mon_agenda_artisan: [{ intervention_id: "iv-1", organization_id: "org-1" }], ...rpcs });
}
function refus(motif = "Chantier à l'autre bout de la ville") {
  const f = new FormData();
  f.set("motif", motif);
  return f;
}
const envois = () => sim.envoyer.mock.calls.map(([p]) => p as { to: string; subject: string; html: string; cleIdempotence?: string });

beforeEach(() => {
  sim.envoyer.mockReset();
  sim.envoyer.mockResolvedValue({ id: "courriel-1" });
  sim.service = null;
  sim.artisan = null;
});

describe("refuserDatesLocataire — refus d'une demande de report (D22)", () => {
  it("une demande attend : « Report refusé… », et le locataire reçoit le refus avec le motif, une seule clé par demande", async () => {
    sim.artisan = artisan({ mes_demandes_rdv_artisan: [{ demande_id: "d1", intervention_id: "iv-1", type: "report", statut: "en_attente" }] });
    sim.service = service(demande({ statut: "refusee", reponse_motif: "Chantier à l'autre bout de la ville" }));
    const r = await refuserDatesLocataire("iv-1", {}, refus());
    expect(r.succes).toMatch(/^Report refusé : le rendez-vous actuel est maintenu/);
    const a = sim.artisan as ReturnType<typeof client>;
    expect(a.appels.map(([n]) => n)).toEqual(["mes_demandes_rdv_artisan", "refuser_creneaux_locataire", "mon_agenda_artisan"]);
    expect(envois()).toHaveLength(1);
    expect(envois()[0]).toMatchObject({ to: "lea@example.invalid", cleIdempotence: "rdv-locataire:reponse:d1:refusee:locataire" });
    expect(envois()[0].html).toMatch(/Chantier à l(&#39;|&#x27;|')autre bout de la ville/);
    expect(envois()[0].html).toMatch(/est maintenu/);
  });

  it("une demande d'une AUTRE mission, ou déjà traitée : refus ordinaire, aucun courrier au locataire", async () => {
    sim.artisan = artisan({ mes_demandes_rdv_artisan: [
      { demande_id: "d9", intervention_id: "iv-9", type: "report", statut: "en_attente" },
      { demande_id: "d1", intervention_id: "iv-1", type: "report", statut: "expiree" },
    ] });
    sim.service = service();
    const r = await refuserDatesLocataire("iv-1", {}, refus());
    expect(r.succes).toMatch(/^Dates refusées/);
    expect(sim.envoyer).not.toHaveBeenCalled();
  });

  it("un refus de la base ne prévient personne", async () => {
    sim.artisan = artisan({
      mes_demandes_rdv_artisan: [{ demande_id: "d1", intervention_id: "iv-1", type: "report", statut: "en_attente" }],
      refuser_creneaux_locataire: { data: null, error: { message: "Accès refusé" } },
    });
    sim.service = service();
    const r = await refuserDatesLocataire("iv-1", {}, refus());
    expect(r.erreur).toBeTruthy();
    expect(sim.envoyer).not.toHaveBeenCalled();
  });
});

describe("accepterDateLocataire — accord sur une date de report (D22)", () => {
  it("la date répond à une demande : le locataire reçoit son nouveau rendez-vous", async () => {
    sim.artisan = artisan();
    sim.service = service(demande({ statut: "acceptee", creneau_accepte_id: "cr-2" }));
    const r = await accepterDateLocataire("iv-1", "cr-2");
    expect(r.succes).toMatch(/Rendez-vous confirmé/);
    expect(envois()).toHaveLength(1);
    expect(envois()[0]).toMatchObject({ to: "lea@example.invalid", cleIdempotence: "rdv-locataire:reponse:d1:acceptee:locataire" });
    expect(envois()[0].subject).toMatch(/^Rendez-vous reporté — samedi 24 octobre/);
  });

  it("une date sans demande (contre-proposition ordinaire) : aucun courrier de report", async () => {
    sim.artisan = artisan();
    sim.service = service(demande({ statut: "acceptee", creneau_accepte_id: "cr-2" }));
    await accepterDateLocataire("iv-1", "cr-libre");
    expect(sim.envoyer).not.toHaveBeenCalled();
  });

  it("la mission est d'une autre organisation que la demande : rien ne part (garde et lecture par organisation)", async () => {
    sim.artisan = client({}, { mon_agenda_artisan: [{ intervention_id: "iv-1", organization_id: "org-AUTRE" }] });
    sim.service = service(demande({ statut: "acceptee", creneau_accepte_id: "cr-2" }));
    await accepterDateLocataire("iv-1", "cr-2");
    expect(sim.envoyer).not.toHaveBeenCalled();
  });

  it("sans client de service : la trace « notification_sans_service » est journalisée, rien ne part", async () => {
    sim.artisan = artisan();
    sim.service = null;
    await accepterDateLocataire("iv-1", "cr-2");
    expect(sim.envoyer).not.toHaveBeenCalled();
    expect((sim.artisan as ReturnType<typeof client>).appels).toContainEqual(["log_tech", expect.objectContaining({ evenement: "notification_sans_service" })]);
  });
});

describe("les trois courriers, lus en base par le client de service", () => {
  it("demande de report → l'artisan : motif en mots, échéance, clé par demande ; une annulation n'est pas un report", async () => {
    const r = await notifierDemandeReportRdv(service() as never, "org-1", "d1");
    expect(r).toEqual({ envoyee: true });
    expect(envois()[0]).toMatchObject({ to: "artisan@example.invalid", cleIdempotence: "rdv-locataire:report:d1:artisan" });
    expect(envois()[0].html).toContain("Une contrainte de travail");
    expect(envois()[0].html).toContain("Réunion imprévue");
    sim.envoyer.mockClear();
    expect(await notifierDemandeReportRdv(service(demande({ type: "annulation" })) as never, "org-1", "d1")).toMatchObject({ envoyee: false, motif: "introuvable" });
    expect(await notifierDemandeReportRdv(service() as never, "org-AUTRE", "d1")).toMatchObject({ envoyee: false, motif: "introuvable" });
    expect(sim.envoyer).not.toHaveBeenCalled();
  });

  it("annulation tardive → l'artisan (sans un mot de délai) et le gestionnaire (« moins de 24 heures »)", async () => {
    const r = await notifierAnnulationRdvLocataire(service(demande({ type: "annulation", statut: "acceptee", tardive: true })) as never, "org-1", "d1");
    expect(r).toEqual({ artisan: { envoyee: true }, agence: { envoyee: true } });
    const parDestinataire = Object.fromEntries(envois().map((e) => [e.to, e]));
    expect(parDestinataire["artisan@example.invalid"].cleIdempotence).toBe("rdv-locataire:annulation:d1:artisan");
    expect(parDestinataire["artisan@example.invalid"].html).not.toMatch(/tardi|24 heures/i);
    expect(parDestinataire["gerant@example.invalid"].cleIdempotence).toBe("rdv-locataire:annulation:d1:agence");
    expect(parDestinataire["gerant@example.invalid"].html).toMatch(/moins de 24 heures/);
  });

  it("réponse au locataire : rien tant que la demande n'est ni acceptée ni refusée", async () => {
    expect(await notifierReponseReportRdv(service() as never, "org-1", "d1")).toMatchObject({ envoyee: false, motif: "introuvable" });
    expect(await notifierReponseReportRdv(service(demande({ statut: "expiree" })) as never, "org-1", "d1")).toMatchObject({ envoyee: false });
    expect(sim.envoyer).not.toHaveBeenCalled();
  });

  it("demandeDuCreneau : la demande d'une date du locataire, rien pour une autre date", async () => {
    expect(await demandeDuCreneau(service() as never, "cr-2")).toEqual({ orgId: "org-1", demandeId: "d1" });
    expect(await demandeDuCreneau(service() as never, "cr-libre")).toBeNull();
    expect(await demandeDuCreneau(service() as never, "inconnu")).toBeNull();
  });
});
