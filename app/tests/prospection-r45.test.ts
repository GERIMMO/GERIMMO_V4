/**
 * Prospection (plan de conformité du 23/10/2026, lot 1F, R45) — partie application, sans base : origine en liste fermée
 * et qualité, mention du premier message (texte du plan), fiche créée depuis une demande de contact seulement si son
 * auteur demande une offre ou une démonstration, dernier contact émanant du prospect, opposition (« Stop »).
 * La partie base (contrainte, refus après opposition, purge) est dans tests/conservation-prospection-base.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONSIGNE_MENTION_PROSPECT, lireProspect, mentionPremierMessageProspect, ORIGINES_PROSPECT, QUALITES_PROSPECT, refusMentionProspect } from "@/lib/prospects-supervision";

const mock = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => mock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { enregistrerOppositionProspect, enregistrerProspect } from "@/app/actions/prospects-supervision";

const form = (valeurs: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(valeurs)) f.set(k, v); return f; };
const BASE = { nom: "Agence fictive", email: "contact@agence.example.invalid", origine: "formulaire", qualite: "professionnel", etape: "nouveau", prochaine_action: "Rappeler", echeance: "2026-11-20", notes: "" };
const DEMANDE = "11111111-1111-4111-8111-111111111111";
const PROSPECT = "22222222-2222-4222-8222-222222222222";

describe("origine et qualité du prospect", () => {
  it("l'origine est l'une des trois valeurs de la base ; la qualité, particulier ou professionnel", () => {
    expect(Object.keys(ORIGINES_PROSPECT)).toEqual(["formulaire", "échange direct", "recommandation"]);
    expect(Object.keys(QUALITES_PROSPECT)).toEqual(["particulier", "professionnel"]);
    for (const origine of Object.keys(ORIGINES_PROSPECT)) expect(lireProspect(form({ ...BASE, origine })).champs?.origine).toBe(origine);
    expect(lireProspect(form({ ...BASE, origine: "Formulaire du site" })).erreur).toMatch(/origine/);
    expect(lireProspect(form({ ...BASE, qualite: "" })).erreur).toMatch(/qualité/);
  });
});

describe("mention du premier message (texte du plan)", () => {
  it("cite la dénomination, l'origine, la durée, le « Stop » et le lien de la page confidentialité", () => {
    expect(mentionPremierMessageProspect({ denomination: "Prénom Nom EI", origine: "formulaire", lienConfidentialite: "https://gerimmo.example/confidentialite" })).toBe(
      "Vous recevez ce message de Prénom Nom EI, éditeur de Gerimmo, parce que vous nous avez communiqué votre adresse (formulaire de contact du site). Nous conservons vos coordonnées trois ans au plus après votre dernier contact. Pour ne plus recevoir de message, répondez simplement « Stop » : nous supprimons alors vos coordonnées dans le mois. Détails : https://gerimmo.example/confidentialite."
    );
    expect(mentionPremierMessageProspect({ denomination: "Prénom Nom EI", origine: "échange direct", lienConfidentialite: "https://x.example/confidentialite" })).toContain("(échange direct)");
  });
  it("rien n'est préparé sans dénomination saisie, ni pour une origine hors liste", () => {
    expect(mentionPremierMessageProspect({ denomination: null, origine: "formulaire", lienConfidentialite: "https://x.example/confidentialite" })).toBeNull();
    expect(mentionPremierMessageProspect({ denomination: "  ", origine: "formulaire", lienConfidentialite: "https://x.example/confidentialite" })).toBeNull();
    expect(mentionPremierMessageProspect({ denomination: "Prénom Nom EI", origine: "Contact", lienConfidentialite: "https://x.example/confidentialite" })).toBeNull();
  });
});

// Relecture du 24/10 — décision 8 du plan : jamais de courriel commercial à un particulier sans sa demande ;
// professionnels seulement si l'adresse vient d'eux ; possibilité d'opposition dans CHAQUE message.
describe("cadre de la mention (décision 8)", () => {
  it("refusée pour une adresse reçue par recommandation (elle ne vient pas de la personne)", () => {
    expect(refusMentionProspect({ origine: "recommandation", qualite: "professionnel", demande: false })).toMatch(/recommandation/);
    expect(refusMentionProspect({ origine: "recommandation", qualite: "particulier", demande: true })).toMatch(/recommandation/);
  });
  it("refusée pour un particulier sans demande de contact rattachée ; admise s'il l'a demandé", () => {
    expect(refusMentionProspect({ origine: "échange direct", qualite: "particulier", demande: false })).toMatch(/particulier/);
    expect(refusMentionProspect({ origine: "formulaire", qualite: "particulier", demande: true })).toBeNull();
  });
  it("admise pour un professionnel dont l'adresse vient de lui", () => {
    expect(refusMentionProspect({ origine: "formulaire", qualite: "professionnel", demande: false })).toBeNull();
    expect(refusMentionProspect({ origine: "échange direct", qualite: "professionnel", demande: false })).toBeNull();
  });
  it("la consigne vise chaque message, pas seulement le premier", () => {
    expect(CONSIGNE_MENTION_PROSPECT).toContain("chacun de vos messages");
  });
});

describe("actions de la fiche prospect", () => {
  const insert = vi.fn();
  const update = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    mock.rpc.mockResolvedValue({ data: true, error: null });
    insert.mockReturnValue({ select: () => ({ single: async () => ({ data: { id: PROSPECT, revision: 0 }, error: null }) }) });
    update.mockReturnValue({ eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: { id: PROSPECT, revision: 1 }, error: null }) }) }) }) });
    mock.from.mockImplementation((table: string) => table === "demandes_devis"
      ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: DEMANDE, created_at: "2026-09-01T10:00:00Z" }, error: null }) }) }) }
      : { insert, update });
  });

  it("depuis une demande de contact : refus sans « offre ou démonstration demandée », création avec", async () => {
    const refus = await enregistrerProspect({}, form({ ...BASE, demande_id: DEMANDE }));
    expect(refus.erreur).toMatch(/offre ou une démonstration/);
    expect(insert).not.toHaveBeenCalled();
    const ok = await enregistrerProspect({}, form({ ...BASE, demande_id: DEMANDE, demande_offre: "1" }));
    expect(ok.succes).toBeTruthy();
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ demande_id: DEMANDE, origine: "formulaire", qualite: "professionnel" }));
    // Relecture du 24/10 : le dernier contact émanant du prospect est sa demande, pas la création de la fiche.
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ dernier_contact_prospect_le: "2026-09-01T10:00:00Z" }));
  });

  it("le dernier contact émanant du prospect ne bouge que s'il a répondu", async () => {
    await enregistrerProspect({}, form({ ...BASE, id: PROSPECT, revision: "0" }));
    expect(update.mock.calls[0][0]).not.toHaveProperty("dernier_contact_prospect_le");
    await enregistrerProspect({}, form({ ...BASE, id: PROSPECT, revision: "0", a_repondu: "1" }));
    expect(update.mock.calls[1][0]).toHaveProperty("dernier_contact_prospect_le");
  });

  it("opposition : supervision permanente exigée, puis enregistrée par la base", async () => {
    mock.rpc.mockResolvedValueOnce({ data: false, error: null });
    expect((await enregistrerOppositionProspect(PROSPECT)).erreur).toMatch(/supervision permanent/);
    expect(mock.rpc).toHaveBeenCalledTimes(1);
    mock.rpc.mockResolvedValue({ data: true, error: null });
    const fait = await enregistrerOppositionProspect(PROSPECT);
    // Relecture du 24/10 : la fiche et son historique partent aussitôt ; l'écran revient à la liste.
    expect(fait).toEqual({ succes: "Opposition enregistrée : la fiche et son historique sont supprimés. Seule l’empreinte de l’adresse est gardée trois ans, pour qu’aucun message ne lui soit plus envoyé.", supprime: true });
    expect(mock.rpc).toHaveBeenLastCalledWith("enregistrer_opposition_prospection", { p_prospect: PROSPECT });
    expect((await enregistrerOppositionProspect("pas-un-uuid")).erreur).toBeTruthy();
  });
});
