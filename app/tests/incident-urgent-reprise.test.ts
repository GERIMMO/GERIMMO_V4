/**
 * X15 (REP-02, décision du 14/10/2026) — l'e-mail d'urgence au gestionnaire n'est plus perdu à la reprise.
 *
 * Hypothèse de l'audit, vérifiée ici : le courriel n'était envoyé qu'à la PREMIÈRE exécution
 * (`!declaration.rejoue`). Si la première tentative créait l'incident puis s'arrêtait avant l'e-mail (action
 * interrompue pendant l'envoi des photos, ou réponse de la base perdue après l'enregistrement), la reprise
 * (même clé de commande, `rejoue: true`) sautait l'e-mail, et rien ne mémorisait s'il était parti : ni la
 * reprise ni une tâche ne pouvait le renvoyer.
 *
 * Correction décidée : mémoriser l'envoi. La base garde `notifie_le` sur la commande ; la reprise envoie l'e-mail
 * d'urgence tant que le gestionnaire n'a pas été prévenu, et ne le renvoie pas une fois parti.
 *
 * Banc : la base est simulée par un petit automate qui reproduit le protocole des fonctions SQL (la vraie base
 * est testée dans incident-urgent-notifie-base.test.ts) ; aucun e-mail n'est envoyé, le notifieur est un
 * simulateur.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({
  rpc: vi.fn(), upload: vi.fn(), documents: vi.fn(), remove: vi.fn(), notifier: vi.fn(),
  commandes: new Map<string, { incident: string; notifie: boolean }>(),
  erreurReponse: false, erreurMarque: false,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({
  verifierLocataire: async () => ({
    user: { id: "locataire-test" },
    supabase: { rpc: banc.rpc, from: banc.documents, storage: { from: () => ({ upload: banc.upload, remove: banc.remove }) } },
  }),
  verifierGerant: async () => ({ user: null, supabase: {} }),
}));
vi.mock("@/lib/notifications", () => ({
  notifierIncidentUrgentDeclare: banc.notifier, notifierDevisDemande: vi.fn(),
  notifierMissionAnnulee: vi.fn(), notifierMissionConfiee: vi.fn(), notifierRendezVousFixe: vi.fn(),
}));
import { declarerMonIncident } from "@/app/actions/incidents";

const COMMANDE = "11111111-1111-4111-8111-111111111111";
const jpeg = () => new File([new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1])], "fuite.jpg", { type: "image/jpeg" });

function declaration(urgence: "urgente" | "normale" = "urgente", photos: File[] = [], commande = COMMANDE) {
  const f = new FormData();
  f.set("commande", commande);
  f.set("categorie", "plomberie_canalisation");
  f.set("piece", "Cuisine");
  f.set("description", "Dégât des eaux");
  f.set("urgence", urgence);
  photos.forEach((p) => f.append("photos", p));
  return f;
}

/** Le protocole de `declarer_mon_incident_reprise` et `marquer_incident_urgent_notifie`, côté base. */
function installerBase({ migree = true }: { migree?: boolean } = {}) {
  banc.rpc.mockImplementation(async (nom: string, args: Record<string, unknown>) => {
    if (nom === "declarer_mon_incident_reprise") {
      const cle = String(args.p_commande);
      const existante = banc.commandes.get(cle);
      const rejoue = Boolean(existante);
      const ligne = existante ?? { incident: "incident-test", notifie: false };
      banc.commandes.set(cle, ligne);
      // La réponse peut se perdre APRÈS l'enregistrement en base.
      if (banc.erreurReponse) { banc.erreurReponse = false; return { data: null, error: { message: "Failed to fetch" } }; }
      return { data: { incident_id: ligne.incident, rejoue, ...(migree ? { notifie: ligne.notifie } : {}) }, error: null };
    }
    if (nom === "marquer_incident_urgent_notifie") {
      if (banc.erreurMarque) return { data: null, error: { message: "indisponible" } };
      const ligne = banc.commandes.get(String(args.p_commande));
      if (ligne) ligne.notifie = true;
      return { data: true, error: null };
    }
    if (nom === "preparer_photo_incident") return { data: { id: "depot-test", storage_path: "org-test/photo.jpg", etat: "en_attente" }, error: null };
    if (nom === "finaliser_photo_incident") return { data: { document_id: "document-test" }, error: null };
    return { data: null, error: null };
  });
}

const lectureDepotsOk = () => {
  const chaine = { eq: vi.fn(), then: (resolve: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve) };
  chaine.eq.mockReturnValue(chaine);
  banc.documents.mockReturnValue({ select: () => chaine });
};

beforeEach(() => {
  vi.clearAllMocks();
  banc.commandes.clear();
  banc.erreurReponse = false; banc.erreurMarque = false;
  installerBase();
  banc.upload.mockResolvedValue({ error: null });
  banc.remove.mockResolvedValue({ data: [], error: null });
  banc.notifier.mockResolvedValue({ envoyee: true });
  lectureDepotsOk();
});

describe("X15 — la reprise d'une déclaration urgente envoie l'e-mail tant qu'il n'est pas parti", () => {
  it("cas de l'audit : la première tentative s'arrête pendant les photos, la reprise envoie UN e-mail", async () => {
    // Tentative 1 : l'incident est créé, l'action est interrompue avant l'e-mail (la lecture des dépôts de photos plante).
    banc.documents.mockImplementationOnce(() => { throw new Error("action interrompue"); });
    await expect(declarerMonIncident("org-test", {}, declaration("urgente", [jpeg()]))).rejects.toThrow("action interrompue");
    expect(banc.notifier).not.toHaveBeenCalled();
    expect(banc.commandes.get(COMMANDE)).toEqual({ incident: "incident-test", notifie: false });

    // Tentative 2 : même commande, la base répond « rejouée, gestionnaire pas encore prévenu ».
    lectureDepotsOk();
    const r = await declarerMonIncident("org-test", {}, declaration("urgente", [jpeg()]));
    expect(r.erreur).toBeUndefined();
    expect(banc.notifier).toHaveBeenCalledTimes(1);
    expect(banc.notifier).toHaveBeenCalledWith(expect.anything(), "org-test", "incident-test", expect.objectContaining({ categorie: "plomberie_canalisation" }));
    expect(r.succes).toMatch(/prévenu par e-mail/);
    expect(banc.commandes.get(COMMANDE)?.notifie).toBe(true);
  });

  it("réponse de la base perdue après l'enregistrement : la reprise envoie l'e-mail", async () => {
    banc.erreurReponse = true;
    const premiere = await declarerMonIncident("org-test", {}, declaration());
    expect(premiere.erreur).toBeTruthy();
    expect(banc.notifier).not.toHaveBeenCalled();
    const reprise = await declarerMonIncident("org-test", {}, declaration());
    expect(reprise.erreur).toBeUndefined();
    expect(banc.notifier).toHaveBeenCalledTimes(1);
    expect(reprise.succes).toMatch(/prévenu par e-mail/);
  });

  it("jamais deux e-mails : une fois parti et mémorisé, une reprise ne le renvoie pas (et le dit encore)", async () => {
    const premiere = await declarerMonIncident("org-test", {}, declaration());
    expect(banc.notifier).toHaveBeenCalledTimes(1);
    expect(premiere.succes).toMatch(/prévenu par e-mail/);
    expect(banc.rpc).toHaveBeenCalledWith("marquer_incident_urgent_notifie", { p_org: "org-test", p_commande: COMMANDE });
    const reprise = await declarerMonIncident("org-test", {}, declaration());
    expect(banc.notifier).toHaveBeenCalledTimes(1);
    expect(reprise.succes).toMatch(/prévenu par e-mail/);
  });

  it("un e-mail qui n'est pas parti n'est pas mémorisé : la reprise réessaie", async () => {
    banc.notifier.mockResolvedValueOnce({ envoyee: false, motif: "echec_envoi" });
    const premiere = await declarerMonIncident("org-test", {}, declaration());
    expect(premiere.succes).toMatch(/prochaine connexion/);
    expect(banc.rpc).not.toHaveBeenCalledWith("marquer_incident_urgent_notifie", expect.anything());
    const reprise = await declarerMonIncident("org-test", {}, declaration());
    expect(banc.notifier).toHaveBeenCalledTimes(2);
    expect(reprise.succes).toMatch(/prévenu par e-mail/);
  });

  it("une mémorisation qui échoue ne fait pas échouer la déclaration", async () => {
    banc.erreurMarque = true;
    const r = await declarerMonIncident("org-test", {}, declaration());
    expect(r.erreur).toBeUndefined();
    expect(r.succes).toMatch(/prévenu par e-mail/);
    expect(banc.notifier).toHaveBeenCalledTimes(1);
  });

  it("une déclaration normale n'envoie jamais d'e-mail d'urgence, même rejouée", async () => {
    await declarerMonIncident("org-test", {}, declaration("normale"));
    await declarerMonIncident("org-test", {}, declaration("normale"));
    expect(banc.notifier).not.toHaveBeenCalled();
    expect(banc.rpc).not.toHaveBeenCalledWith("marquer_incident_urgent_notifie", expect.anything());
  });

  it("première exécution ordinaire : un e-mail, comme avant", async () => {
    const r = await declarerMonIncident("org-test", {}, declaration());
    expect(banc.notifier).toHaveBeenCalledTimes(1);
    expect(r.succes).toMatch(/Signalement envoyé — urgence/);
  });

  it("compatibilité de déploiement : une base pas encore migrée (pas de « notifie ») garde l'ancien comportement à la reprise", async () => {
    installerBase({ migree: false });
    await declarerMonIncident("org-test", {}, declaration());
    expect(banc.notifier).toHaveBeenCalledTimes(1);
    const reprise = await declarerMonIncident("org-test", {}, declaration());
    expect(reprise.erreur).toBeUndefined();
    expect(banc.notifier).toHaveBeenCalledTimes(1); // pas de doublon : rien ne dit s'il est parti
  });
});
