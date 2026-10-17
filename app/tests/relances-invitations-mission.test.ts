/**
 * Relances d'invitation de locataire (décision X16 du 15/10/2026, fiche REP-05) : ce qui ne demande pas la base.
 *  - la mission « rappels » les envoie (entrée unique des missions, arrêt d'urgence propagé), et son bilan les compte ;
 *  - l'e-mail : gabarit de l'invitation, objet « Rappel : … », même destination que l'invitation, date d'expiration ;
 *  - la plage horaire à Paris (jamais la nuit), heure d'été comprise ;
 *  - la fiche personne : « Relancé le … ».
 * Aucun e-mail réel : le service d'e-mail et le service de liens sont des doublures.
 * La règle elle-même (J+3, J+10, états, limite, arrêt) est éprouvée sur la base : relances-invitations-locataires.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArretSupervision } from "@/lib/controle-effets";

// La carte de la fiche personne : ses actions serveur et son crochet d'état ne sont pas en cause ici.
vi.mock("@/app/actions/invitations", () => ({ inviterLocataire: vi.fn(), annulerInvitation: vi.fn() }));
vi.mock("@/lib/use-action-state-protegee", () => ({ useActionStateProtegee: () => [{}, () => {}, false] }));

const m = vi.hoisted(() => ({
  relancer: vi.fn(),
  service: vi.fn(),
  envoyerEmail: vi.fn(),
  generateLink: vi.fn(),
}));

describe("la mission « rappels » envoie les relances d'invitation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("CRON_SECRET", "secret_test");
    m.relancer.mockReset();
    vi.doMock("@/lib/relances-invitations", () => ({ envoyerRelancesInvitations: m.relancer }));
    vi.doMock("@/lib/notifications", () => ({
      envoyerRappelsGestes: async () => ({ envoyes: 0, echecs: 0, sans_adresse: 0, non_consignes: 0, par_type: {} }),
    }));
    const rpc = vi.fn(async (nom: string) => ({ data: nom === "verifier_arret_supervision" ? true : nom === "rendez_vous_a_rappeler" ? [] : null, error: null }));
    m.service.mockReturnValue({ rpc });
    vi.doMock("@/lib/supabase/service", () => ({ clientDeService: m.service }));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/relances-invitations");
    vi.doUnmock("@/lib/notifications");
    vi.doUnmock("@/lib/supabase/service");
    vi.doUnmock("@/lib/email");
  });
  const requete = () => new Request("http://localhost/api/cron/equipes?mission=rappels", { headers: { authorization: "Bearer secret_test" } });

  it("appelle la passe avec le contrôle d'arrêt de la mission, et met son bilan dans celui des rappels", async () => {
    m.relancer.mockResolvedValue({ envoyees: 2, echecs: 0, incertaines: 0, limitees: 1, ignorees: 0, non_notees: 0 });
    const { traiterRappels } = await import("@/lib/missions-planifiees/rappels");
    const r = await traiterRappels(requete());
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ rappeles: 0, invitations: { envoyees: 2, limitees: 1 } });
    expect(m.relancer).toHaveBeenCalledTimes(1);
    const [, options] = m.relancer.mock.calls[0];
    expect(typeof options.avantEffet).toBe("function");
    // Le contrôle passé est bien celui de la mission « rappels ».
    const { rpc } = m.service.mock.results[0].value;
    rpc.mockClear();
    await options.avantEffet();
    expect(rpc).toHaveBeenCalledWith("verifier_arret_supervision", { p_mission: "rappels", p_plan: null });
  });

  it("un jour avec des rendez-vous à rappeler : les relances partent aussi, après les rendez-vous, et figurent au bilan", async () => {
    const ordre: string[] = [];
    m.relancer.mockImplementation(async () => {
      ordre.push("relances");
      return { envoyees: 1, echecs: 0, incertaines: 0, limitees: 0, ignorees: 0, non_notees: 0, restantes: 0 };
    });
    // L'envoi du rappel de rendez-vous : une maquette, aucun e-mail réel.
    const envoyerEmail = vi.fn(async () => {
      ordre.push("rendez-vous");
      return { id: "email_test" };
    });
    vi.doMock("@/lib/email", () => ({ envoyerEmail }));
    const rendezVous = {
      intervention_id: "11111111-2222-4333-8444-555555555555", organization_id: "66666666-7777-4888-8999-000000000000",
      echeance: "veille", destinataire: "locataire", adresse: "locataire@exemple.fr", prenom: "Léa", emetteur: "Agence Test",
      artisan: "Plomberie Test", lot: "Lot 1", adresse_bien: "1 rue de Test, 75001 Paris", debut_prevu: "2026-11-06T08:00:00Z",
      fin_prevue: "2026-11-06T09:00:00Z", incident_numero: "INC-0001", categorie: "plomberie",
    };
    const rpc = vi.fn(async (nom: string) => ({
      data: nom === "verifier_arret_supervision" ? true : nom === "rendez_vous_a_rappeler" ? [rendezVous] : null,
      error: null,
    }));
    m.service.mockReturnValue({ rpc });
    const { traiterRappels } = await import("@/lib/missions-planifiees/rappels");
    const r = await traiterRappels(requete());
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ rappeles: 1, echecs: 0, invitations: { envoyees: 1 } });
    expect(envoyerEmail).toHaveBeenCalledTimes(1);
    expect(m.relancer).toHaveBeenCalledTimes(1);
    expect(ordre).toEqual(["rendez-vous", "relances"]);
  });

  it("un arrêt d'urgence pendant les relances interrompt la mission (jamais un succès)", async () => {
    // La classe du graphe de modules rechargé (vi.resetModules) : c'est elle que la mission reconnaît.
    const { ArretSupervision: Arret } = await import("@/lib/controle-effets");
    m.relancer.mockRejectedValue(new Arret());
    const { traiterRappels } = await import("@/lib/missions-planifiees/rappels");
    await expect(traiterRappels(requete())).rejects.toBeInstanceOf(Arret);
  });

  it("un incident des relances ne prive pas les rendez-vous de leur passe : bilan marqué, mission terminée", async () => {
    m.relancer.mockRejectedValue(new Error("panne"));
    const { traiterRappels } = await import("@/lib/missions-planifiees/rappels");
    const r = await traiterRappels(requete());
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ invitations: { echecs: 1, lecture_impossible: true } });
  });
});

describe("l'e-mail de relance : le gabarit et le lien de l'invitation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.gerimmo.app");
    m.envoyerEmail.mockReset().mockResolvedValue({ id: "email_test" });
    m.generateLink.mockReset().mockResolvedValue({ data: { properties: { hashed_token: "a".repeat(56) } }, error: null });
    m.service.mockReset().mockReturnValue({ auth: { admin: { generateLink: m.generateLink } } });
    vi.doMock("@/lib/supabase/service", () => ({ clientDeService: m.service }));
    vi.doMock("@/lib/email", () => ({ envoyerEmail: m.envoyerEmail }));
    vi.doMock("next/headers", () => ({ headers: vi.fn() }));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/supabase/service");
    vi.doUnmock("@/lib/email");
    vi.doUnmock("next/headers");
  });
  const ID = "11111111-2222-4333-8444-555555555555";

  it("objet « Rappel : … », même destination que l'invitation, date d'expiration et refus qui arrête les rappels", async () => {
    const { envoyerRappelInvitationLocataire, construireLien, sujetCourrier } = await import("@/lib/lien-mot-de-passe");
    const { suiteInvitationLocataire } = await import("@/lib/invitations-locataire");
    const r = await envoyerRappelInvitationLocataire({ email: " Locataire@Exemple.fr ", invitationId: ID, expireLe: "2026-12-02T08:00:00Z" });
    expect(r).toEqual({ envoye: true });
    expect(m.generateLink).toHaveBeenCalledWith({ type: "recovery", email: "locataire@exemple.fr" });
    const [envoi] = m.envoyerEmail.mock.calls[0];
    expect(envoi.subject).toBe(`Rappel : ${sujetCourrier("invitation_locataire")}`);
    expect(envoi.subject).toBe("Rappel : Votre invitation locataire Gerimmo");
    expect(envoi.to).toBe("locataire@exemple.fr");
    // Le lien : celui que bâtit l'invitation (même page de réponse, même invitation).
    const attendu = construireLien("https://www.gerimmo.app", "a".repeat(56), suiteInvitationLocataire(ID));
    expect(envoi.html).toContain(attendu.replace(/&/g, "&amp;"));
    expect(suiteInvitationLocataire(ID)).toBe(`/nouveau-mot-de-passe?suite=%2Finvitations%2F${ID}`);
    expect(envoi.html).toContain("valable jusqu’au 2 décembre 2026");
    expect(envoi.html).toContain("Si vous la refusez, vous ne recevrez plus de rappel.");
    expect(envoi.html).toContain("Vous êtes invité sur Gerimmo");
    expect(envoi.html).not.toContain("valable 30 jours");
  });

  it("délai dépassé : relance incertaine (jamais renvoyée) ; refus : échec certain", async () => {
    const { envoyerRappelInvitationLocataire } = await import("@/lib/lien-mot-de-passe");
    m.envoyerEmail.mockResolvedValueOnce({ erreur: "délai", incertain: true });
    expect(await envoyerRappelInvitationLocataire({ email: "a@exemple.fr", invitationId: ID, expireLe: "2026-12-02T08:00:00Z" }))
      .toMatchObject({ envoye: false, incertain: true });
    m.envoyerEmail.mockResolvedValueOnce({ erreur: "refus" });
    expect(await envoyerRappelInvitationLocataire({ email: "a@exemple.fr", invitationId: ID, expireLe: "2026-12-02T08:00:00Z" }))
      .toMatchObject({ envoye: false, incertain: false });
  });

  it("arrêt d'urgence : ni jeton fabriqué, ni e-mail", async () => {
    const { envoyerRappelInvitationLocataire } = await import("@/lib/lien-mot-de-passe");
    const arret = new ArretSupervision();
    await expect(envoyerRappelInvitationLocataire({ email: "a@exemple.fr", invitationId: ID, expireLe: "2026-12-02T08:00:00Z", avantEnvoi: async () => { throw arret; } }))
      .rejects.toBe(arret);
    expect(m.generateLink).not.toHaveBeenCalled();
    expect(m.envoyerEmail).not.toHaveBeenCalled();
  });

  it("arrêt d'urgence posé après la fabrication du jeton : le service d'e-mail reçoit le contrôle et s'arrête avant l'appel", async () => {
    const { envoyerRappelInvitationLocataire } = await import("@/lib/lien-mot-de-passe");
    const arret = new ArretSupervision();
    // Le premier contrôle (avant le jeton) passe ; l'arrêt est posé ensuite.
    const avantEnvoi = vi.fn<() => Promise<void>>().mockResolvedValueOnce(undefined).mockRejectedValue(arret);
    // Comme lib/email.ts : le contrôle reçu est lu avant tout appel au service.
    m.envoyerEmail.mockImplementation(async (p: { avantEnvoi?: () => Promise<void> }) => {
      await p.avantEnvoi?.();
      return { id: "email_test" };
    });
    await expect(envoyerRappelInvitationLocataire({ email: "a@exemple.fr", invitationId: ID, expireLe: "2026-12-02T08:00:00Z", avantEnvoi }))
      .rejects.toBe(arret);
    expect(m.generateLink).toHaveBeenCalledTimes(1);
    expect(m.envoyerEmail).toHaveBeenCalledTimes(1);
    expect(typeof m.envoyerEmail.mock.calls[0][0].avantEnvoi).toBe("function");
    expect(avantEnvoi).toHaveBeenCalledTimes(2);
  });
});

describe("le service d'e-mail dit quand un envoi est incertain", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it("délai dépassé → incertain ; refus → pas incertain", async () => {
    vi.stubEnv("RESEND_API_KEY", "cle-de-test");
    const { envoyerEmail } = await vi.importActual<typeof import("@/lib/email")>("@/lib/email");
    vi.stubGlobal("fetch", async () => { const e = new Error("délai"); e.name = "TimeoutError"; throw e; });
    expect(await envoyerEmail({ to: "a@exemple.fr", subject: "S", html: "<p>x</p>" })).toMatchObject({ incertain: true });
    vi.stubGlobal("fetch", async () => new Response("non", { status: 422 }));
    const refus = await envoyerEmail({ to: "a@exemple.fr", subject: "S", html: "<p>x</p>" });
    expect(refus.erreur).toBeTruthy();
    expect(refus.incertain).toBeUndefined();
  });
});

describe("jamais la nuit à Paris", () => {
  it("de 7 h (incluse) à 21 h (exclue), heure d'hiver et heure d'été", async () => {
    const { relancesInvitationPermises, heureDeParis } = await import("@/lib/relances-invitations");
    // Hiver (UTC+1) : 06:00 UTC = 7 h, l'heure de la mission « rappels ».
    expect(heureDeParis(new Date("2026-01-15T06:00:00Z"))).toBe(7);
    expect(relancesInvitationPermises(new Date("2026-01-15T05:59:59Z"))).toBe(false);
    expect(relancesInvitationPermises(new Date("2026-01-15T06:00:00Z"))).toBe(true);
    expect(relancesInvitationPermises(new Date("2026-01-15T19:59:59Z"))).toBe(true);
    expect(relancesInvitationPermises(new Date("2026-01-15T20:00:00Z"))).toBe(false);
    // Été (UTC+2) : 06:00 UTC = 8 h.
    expect(heureDeParis(new Date("2026-07-15T06:00:00Z"))).toBe(8);
    expect(relancesInvitationPermises(new Date("2026-07-15T04:59:59Z"))).toBe(false);
    expect(relancesInvitationPermises(new Date("2026-07-15T18:59:59Z"))).toBe(true);
    expect(relancesInvitationPermises(new Date("2026-07-15T19:00:00Z"))).toBe(false);
    // Minuit à Paris.
    expect(relancesInvitationPermises(new Date("2026-10-14T22:30:00Z"))).toBe(false);
  });
});

describe("le journal d'audit nomme les relances", () => {
  it("trois codes, trois libellés, aucun repli", async () => {
    const { libelleActionAudit } = await import("@/lib/libelles-journaux");
    for (const code of ["invitation_locataire_relancee", "invitation_locataire_relance_echec", "invitation_locataire_relance_incertaine"]) {
      expect(libelleActionAudit(code), code).toMatch(/^Relance automatique d’une invitation de locataire/);
    }
  });
});

describe("la fiche personne dit « Relancé le … »", () => {
  it("une, puis deux relances ; un envoi non confirmé se dit à part", async () => {
    const { phrasesRelances } = await import("@/lib/invitations-locataire");
    const r1 = { invitation_id: "i", rang: 1, jour: "2026-11-05", etat: "envoyee", envoyee_le: "2026-11-05T06:00:03Z" };
    const r2 = { invitation_id: "i", rang: 2, jour: "2026-11-12", etat: "envoyee", envoyee_le: "2026-11-12T06:00:04Z" };
    expect(phrasesRelances([])).toEqual([]);
    expect(phrasesRelances([r1])).toEqual(["Relancé le 05/11/2026"]);
    expect(phrasesRelances([r2, r1])).toEqual(["Relancé le 05/11/2026 et le 12/11/2026"]);
    expect(phrasesRelances([r1, { ...r2, etat: "incertaine", envoyee_le: null }])).toEqual([
      "Relancé le 05/11/2026",
      "Relance du 12/11/2026 : envoi non confirmé",
    ]);
    // Jour de Paris : envoyée à 23 h 30 UTC le 4, c'est le 5 à Paris.
    expect(phrasesRelances([{ ...r1, envoyee_le: "2026-11-04T23:30:00Z" }])).toEqual(["Relancé le 05/11/2026"]);
  });

  it("la carte « Accès locataire » affiche les relances de la dernière invitation, et dit quand aucune ne partira", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { FormulaireInvitation } = await import("@/app/agence/[orgId]/personnes/[personId]/formulaire-invitation");
    const invitation = { id: "inv-1", etat: "en_attente", email: "loc@exemple.fr", expire_le: "2099-01-01T00:00:00Z", cree_le: "2026-11-02T08:00:00Z", envoye_le: "2026-11-02T08:00:00Z", erreur_envoi: false, relances_prevues: true };
    const relance = { invitation_id: "inv-1", rang: 1, jour: "2026-11-05", etat: "envoyee", envoyee_le: "2026-11-05T06:00:03Z" };
    const rendu = (props: Record<string, unknown>) =>
      renderToStaticMarkup(createElement(FormulaireInvitation, { orgId: "org", personId: "p", email: "loc@exemple.fr", dejaInvite: false, ...props }));
    const avec = rendu({ historique: [invitation], relances: [relance, { ...relance, invitation_id: "ancienne", jour: "2026-10-01" }] });
    expect(avec).toContain("Relancé le 05/11/2026");
    expect(avec).not.toContain("01/10/2026");
    expect(avec).toContain("un rappel lui est envoyé par e-mail 3 jours puis 10 jours après l’envoi");
    expect(avec).not.toContain("aucun rappel ne partira");
    const ancienne = rendu({ historique: [{ ...invitation, relances_prevues: false }], relances: [] });
    expect(ancienne).toContain("aucun rappel ne partira pour elle");
    expect(ancienne).not.toContain("Relancé le");
  });
});
