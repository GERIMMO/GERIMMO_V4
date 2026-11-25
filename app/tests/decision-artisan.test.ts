/**
 * LE GESTE DU SUPERVISEUR ET L'E-MAIL DES MOTIFS (audit palier 1 du 22/11/2026, P1-16).
 *
 * Après un refus ou une suspension, l'action envoie à l'artisan les motifs de la décision, et dit à l'écran ce qu'il
 * en est de l'e-mail. Ce que ces tests tiennent :
 *  - l'e-mail vise la dernière décision, à l'adresse de la fiche, sans espace, avec une clé par décision ;
 *  - une décision enregistrée reste enregistrée quand l'e-mail ne part pas : l'écran le dit, sans annoncer un envoi ;
 *  - aucune autre opération (validation, constat de SIRET, réexamen) n'envoie quoi que ce soit ;
 *  - le renvoi depuis la fiche est réservé à la supervision.
 *
 * Seul `envoyerEmail` est remplacé. Les règles de la base ont leur test : decision-artisan-base.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ client: vi.fn(), revalidate: vi.fn(), envoyer: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.client }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("@/lib/email", async (original) => ({ ...(await original<typeof import("@/lib/email")>()), envoyerEmail: m.envoyer }));

import { renvoyerMotifsDecisionArtisan, traiterInscriptionArtisan } from "@/app/actions/supervision-artisans";

const DECISION = "5b1f0c3e-7a44-4b0e-9d6f-2c1a8e4f0a01";
type Banc = {
  sa?: boolean; statut?: string; erreurDecision?: string;
  derniere?: { id: string; decision: string; motif: string | null; created_at: string; notifie_le: string | null } | null;
  email?: string | null; erreurLecture?: boolean;
};
function banc({ sa = true, statut = "en_attente", erreurDecision = "", derniere, email = "atelier@example.invalid", erreurLecture = false }: Banc = {}) {
  const decision = derniere === undefined ? { id: DECISION, decision: "refus", motif: "Pièce illisible", created_at: "2026-11-22T09:30:00+01:00", notifie_le: null } : derniere;
  const rpc = vi.fn(async (nom: string) => ({
    data: nom === "is_super_admin" ? sa : null,
    error: nom === "traiter_inscription_artisan_atomique" && erreurDecision ? { message: erreurDecision } : null,
  }));
  const lectures: string[] = [];
  const from = vi.fn((table: string) => {
    const colonnes: string[] = [];
    const q = {
      select: (c: string) => { colonnes.push(c); return q; }, eq: () => q, order: () => q, limit: () => q,
      maybeSingle: async () => {
        lectures.push(`${table}:${colonnes.join("|")}`);
        if (table === "artisan_validations") return erreurLecture ? { data: null, error: { message: "indisponible" } } : { data: decision, error: null };
        // La fiche : relue une fois pour le contrôle d'état, une fois pour l'adresse de l'e-mail.
        return { data: { id: "artisan", statut_plateforme: statut, siret_etat: "verifie", raison_sociale: "Atelier fictif", email }, error: null };
      },
    };
    return q;
  });
  m.client.mockResolvedValue({ rpc, from });
  return { rpc, from, lectures };
}
const donnees = (operation: string, champs: Record<string, string> = {}) => { const f = new FormData(); f.set("operation", operation); for (const [k, v] of Object.entries(champs)) f.set(k, v); return f; };

beforeEach(() => { vi.clearAllMocks(); m.envoyer.mockResolvedValue({ id: "fictif" }); vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.gerimmo.app"); });

describe("après la décision", () => {
  it("un refus enregistré envoie les motifs à l'adresse de la fiche, sans espace, avec une clé par décision", async () => {
    banc();
    const r = await traiterInscriptionArtisan("artisan", {}, donnees("refus", { motif: "Pièce illisible" }));
    expect(r.erreur).toBeUndefined();
    expect(r.succes).toBe("Inscription refusée avec son motif. Les motifs ont été envoyés à l’artisan par e-mail.");
    expect(m.envoyer).toHaveBeenCalledTimes(1);
    const envoi = m.envoyer.mock.calls[0][0] as Record<string, unknown>;
    expect(envoi).toMatchObject({
      to: "atelier@example.invalid", subject: "Votre inscription sur Gerimmo n’a pas été retenue",
      cleIdempotence: `decision-artisan/${DECISION}`, contexteMetier: { type: "decision_artisan", id: DECISION },
    });
    expect("organisation" in envoi).toBe(false);
    expect(String(envoi.html)).toContain("Pièce illisible");
    expect(String(envoi.html)).toContain("Atelier fictif");
  });

  it("une suspension enregistrée envoie les motifs de même", async () => {
    banc({ statut: "valide", derniere: { id: DECISION, decision: "suspension", motif: "Deux interventions non honorées", created_at: "2026-11-22T09:30:00+01:00", notifie_le: null } });
    const r = await traiterInscriptionArtisan("artisan", {}, donnees("suspension", { motif: "Deux interventions non honorées", confirmation: "oui" }));
    expect(r.succes).toContain("Validation suspendue");
    expect(r.succes).toContain("Les motifs ont été envoyés à l’artisan par e-mail.");
    expect((m.envoyer.mock.calls[0][0] as { subject: string }).subject).toBe("Votre inscription sur Gerimmo est suspendue");
  });

  it.each([
    ["le service d'envoi répond par une erreur", () => m.envoyer.mockResolvedValue({ erreur: "Envoi des e-mails non configuré." }), {}, "n’est pas parti"],
    ["l'envoi lève une exception", () => m.envoyer.mockRejectedValue(new Error("réseau")), {}, "n’est pas parti"],
    ["la fiche n'a pas d'adresse", () => {}, { email: null }, "n’a pas d’adresse e-mail"],
    ["la décision ne peut pas être relue", () => {}, { erreurLecture: true }, "n’est pas parti"],
  ])("quand %s, la décision reste enregistrée et l'écran ne prétend pas que l'e-mail est parti", async (_libelle, preparer, options, attendu) => {
    banc(options as Banc);
    preparer();
    const r = await traiterInscriptionArtisan("artisan", {}, donnees("refus", { motif: "Pièce illisible" }));
    expect(r.erreur).toBeUndefined();
    expect(r.succes).toContain("Inscription refusée avec son motif.");
    expect(r.succes).toContain(attendu);
    expect(r.succes).not.toContain("ont été envoyés");
    expect(m.revalidate).toHaveBeenCalledWith("/admin/clients/artisans/artisan");
  });

  it("aucune autre opération n'envoie d'e-mail, et une décision refusée par la base non plus", async () => {
    banc();
    expect((await traiterInscriptionArtisan("artisan", {}, donnees("verifier_siret", { verification_effectuee: "oui" }))).succes).toBe("Vérification du SIRET enregistrée. L’inscription reste à examiner.");
    banc();
    expect(await traiterInscriptionArtisan("artisan", {}, donnees("validation", { pieces_relues: "oui" }))).toHaveProperty("succes");
    banc({ statut: "refuse" });
    expect(await traiterInscriptionArtisan("artisan", {}, donnees("remise_en_attente"))).toHaveProperty("succes");
    banc({ erreurDecision: "Cette inscription a déjà changé d’état. Rechargez la page." });
    expect(await traiterInscriptionArtisan("artisan", {}, donnees("refus", { motif: "Pièce illisible" }))).toEqual({ erreur: "Cette inscription a déjà changé d’état. Rechargez la page." });
    expect(m.envoyer).not.toHaveBeenCalled();
  });

  it("si la dernière décision lue n'est pas un refus ou une suspension motivé, rien ne part", async () => {
    banc({ derniere: { id: DECISION, decision: "validation", motif: null, created_at: "2026-11-22T09:30:00+01:00", notifie_le: null } });
    const r = await traiterInscriptionArtisan("artisan", {}, donnees("refus", { motif: "Pièce illisible" }));
    expect(r.succes).toContain("Aucun e-mail à envoyer");
    expect(m.envoyer).not.toHaveBeenCalled();
  });
});

describe("le renvoi depuis la fiche de l'artisan", () => {
  it("est réservé à la supervision : un autre compte ne lit rien et n'envoie rien", async () => {
    const b = banc({ sa: false });
    expect(await renvoyerMotifsDecisionArtisan("artisan", {}, new FormData())).toEqual({ erreur: "Accès réservé à la supervision Gerimmo." });
    expect(b.from).not.toHaveBeenCalled();
    expect(m.envoyer).not.toHaveBeenCalled();
  });

  it("envoie les motifs de la dernière décision et le dit ; une décision déjà notifiée ne repart pas", async () => {
    banc();
    expect(await renvoyerMotifsDecisionArtisan("artisan", {}, new FormData())).toEqual({ succes: "Les motifs ont été envoyés à l’artisan par e-mail." });
    expect(m.envoyer).toHaveBeenCalledTimes(1);
    expect(m.revalidate).toHaveBeenCalledWith("/admin/clients/artisans/artisan");
    banc({ derniere: { id: DECISION, decision: "refus", motif: "Pièce illisible", created_at: "2026-11-22T09:30:00+01:00", notifie_le: "2026-11-22T10:00:00+01:00" } });
    expect(await renvoyerMotifsDecisionArtisan("artisan", {}, new FormData())).toEqual({ succes: "Les motifs de cette décision ont déjà été envoyés à l’artisan par e-mail." });
    expect(m.envoyer).toHaveBeenCalledTimes(1);
  });

  it("dit l'échec comme un échec", async () => {
    banc();
    m.envoyer.mockResolvedValue({ erreur: "Envoi des e-mails non configuré." });
    const r = await renvoyerMotifsDecisionArtisan("artisan", {}, new FormData());
    expect(r.succes).toBeUndefined();
    expect(r.erreur).toContain("n’est pas parti");
    banc({ email: "" });
    expect((await renvoyerMotifsDecisionArtisan("artisan", {}, new FormData())).erreur).toContain("n’a pas d’adresse e-mail");
  });
});
