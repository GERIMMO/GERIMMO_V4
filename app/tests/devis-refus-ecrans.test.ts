/**
 * Décision D18 du 14/10/2026, livraison 1 (option B : refus motivé d'un devis). La base est essayée dans
 * devis-refus-motive.test.ts ; ici, la partie application : les libellés des nouveaux états et du nouvel événement
 * (un type sans libellé s'afficherait en clair technique, ce qui est interdit), l'action du gérant (motif, clé
 * d'envoi, e-mail seulement si la décision est nouvelle) et les écrans (bouton « Refuser » à côté de « Retenir »,
 * devis refusé en lecture seule avec le motif).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({ rpc: vi.fn(), notifier: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), useRouter: () => ({ push() {}, refresh() {} }), notFound: () => { throw new Error("notFound"); } }));
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({ user: { id: "gerant" }, role: "admin_agence", supabase: { rpc: banc.rpc } }),
  verifierLocataire: async () => ({ user: null, supabase: {} }),
}));
vi.mock("@/lib/notifications", async (importOriginal) => {
  const reel = await importOriginal<typeof import("@/lib/notifications")>();
  return { ...reel, notifierDevisRefuse: banc.notifier };
});
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { refuserDevis } from "@/app/actions/incidents";
import { ConsultationOuverte } from "@/app/agence/[orgId]/incidents/volet-artisan";
import { STATUTS_DEVIS, STATUTS_SOLLICITATION as STATUTS_SOLLICITATION_GERANT } from "@/app/agence/[orgId]/artisans/referentiel";
import { STATUTS_SOLLICITATION as STATUTS_SOLLICITATION_ARTISAN } from "@/app/artisan/libelles";
import { MOTIF_DECISION_DEVIS, TYPES_EVENEMENT_INCIDENT } from "@/lib/incidents";
import { messageDevisRefuse } from "@/lib/notifications";

const CLE = "11111111-1111-4111-8111-111111111111";
const MOTIF = "Le montant dépasse le budget prévu pour cette réparation.";

function formulaire(champs: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(champs)) form.set(k, v);
  return form;
}

describe("libellés des nouveaux états (aucun état en clair technique)", () => {
  it("nomme l'événement, le devis refusé et la demande refusée, côté gérant et côté artisan", () => {
    expect(TYPES_EVENEMENT_INCIDENT.devis_refuse).toBe("Devis refusé");
    expect(STATUTS_DEVIS.refuse).toBe("Refusé");
    expect(STATUTS_SOLLICITATION_GERANT.refusee).toBe("Devis refusé");
    expect(STATUTS_SOLLICITATION_ARTISAN.refusee).toBe("Devis refusé");
    expect(MOTIF_DECISION_DEVIS).toEqual({ min: 10, max: 4000 });
  });
});

describe("l'action « refuser le devis »", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    banc.rpc.mockResolvedValue({ data: true, error: null });
    banc.notifier.mockResolvedValue({ envoyee: true });
  });

  it("refuse un motif de moins de dix caractères avant tout appel en base, et garde la saisie", async () => {
    const r = await refuserDevis("org", "devis", {}, formulaire({ motif: "Trop cher", cle_envoi: CLE }));
    expect(r.erreur).toMatch(/dix caractères au moins/);
    expect(r.valeurs?.motif).toBe("Trop cher");
    expect(banc.rpc).not.toHaveBeenCalled();
  });

  it("refuse un envoi sans clé (« Rechargez la page ») avant tout appel en base", async () => {
    const r = await refuserDevis("org", "devis", {}, formulaire({ motif: MOTIF }));
    expect(r.erreur).toMatch(/Rechargez la page/);
    expect(banc.rpc).not.toHaveBeenCalled();
  });

  it("appelle refuser_devis avec le motif et la clé, puis prévient l'artisan une fois", async () => {
    const r = await refuserDevis("org", "devis", {}, formulaire({ motif: ` ${MOTIF} `, cle_envoi: CLE.toUpperCase() }));
    expect(banc.rpc).toHaveBeenCalledWith("refuser_devis", { p_org: "org", p_devis: "devis", p_motif: MOTIF, p_cle: CLE });
    expect(banc.notifier).toHaveBeenCalledTimes(1);
    expect(r.succes).toMatch(/Devis refusé — l'artisan est prévenu/);
    expect(r.avertissement).toBeUndefined();
  });

  it("un e-mail qui ne part pas ne défait pas le refus : le succès reste, avec un avertissement", async () => {
    banc.notifier.mockResolvedValue({ envoyee: false, motif: "echec_envoi" });
    const r = await refuserDevis("org", "devis", {}, formulaire({ motif: MOTIF, cle_envoi: CLE }));
    expect(r.succes).toMatch(/Devis refusé/);
    expect(r.avertissement).toMatch(/n'a pas pu partir/);
  });

  it("un envoi rejoué (la base répond « déjà prise ») n'envoie pas de second e-mail", async () => {
    banc.rpc.mockResolvedValue({ data: false, error: null });
    const r = await refuserDevis("org", "devis", {}, formulaire({ motif: MOTIF, cle_envoi: CLE }));
    expect(r.succes).toMatch(/déjà refusé/);
    expect(banc.notifier).not.toHaveBeenCalled();
  });

  it("rend le message de la base tel quel, sans référence interne", async () => {
    banc.rpc.mockResolvedValue({ data: null, error: { message: "Ce devis a déjà été retenu : la mission est confiée à l'artisan." } });
    const r = await refuserDevis("org", "devis", {}, formulaire({ motif: MOTIF, cle_envoi: CLE }));
    expect(r.erreur).toBe("Ce devis a déjà été retenu : la mission est confiée à l'artisan.");
    expect(banc.notifier).not.toHaveBeenCalled();
  });
});

describe("l'e-mail à l'artisan", () => {
  it("porte le montant, le dossier et le motif, et dit qu'il n'y a rien d'autre à faire", () => {
    const m = messageDevisRefuse({ emetteur: "Agence Test", categorie: "plomberie_canalisation", numero: "INC-0007", montantCents: 48000, motif: MOTIF, lien: null });
    expect(m.sujet).toBe("Votre devis a été refusé — Agence Test — dossier INC-0007");
    expect(m.html).toContain("480,00");
    expect(m.html).toContain("INC-0007");
    expect(m.html).toContain("Motif transmis : Le montant dépasse le budget prévu pour cette réparation.");
    expect(m.html).toContain("Cette demande est close pour vous");
  });
});

describe("le volet artisan du gérant", () => {
  const consultation = {
    id: "c1", metier: "plomberie", nature_travaux: "entretien_courant", decennale_requise: false,
    devis_unique_assume: false, validite_jours: 30, statut: "ouverte", created_at: "2026-09-20T08:00:00.000Z",
  };
  const sollicitation = (id: string, artisan: string, statut: string) =>
    ({ id, consultation_id: "c1", artisan_id: artisan, statut, envoyee_le: "2026-09-21T08:00:00.000Z", repondue_le: null, refus_motif: null });
  const devis = (id: string, s: string, artisan: string, statut: string, extra: Record<string, unknown> = {}) => ({
    id, sollicitation_id: s, artisan_id: artisan, montant_ttc_cents: 34000, description: "Remplacement du flexible",
    lignes: [], valide_jusqu_au: "2026-12-31", document_id: null, statut, depose_le: "2026-09-22T08:00:00.000Z", ...extra,
  });
  const NOMS: Record<string, string> = { a1: "Plomberie Martin", a2: "Dubois Sanitaire" };
  const rendre = (props: { sollicitations: ReturnType<typeof sollicitation>[]; devis: ReturnType<typeof devis>[] }) =>
    renderToStaticMarkup(createElement(ConsultationOuverte, {
      orgId: "o1", consultation, sollicitations: props.sollicitations, devis: props.devis,
      affectables: [] as never, noteDe: new Map(), nom: (id: string) => NOMS[id] ?? "Artisan",
      aujourdhui: "2026-10-14", commune: "Paris",
    }));

  it("propose « Refuser » à côté de « Retenir ce devis » pour un devis reçu", () => {
    const html = rendre({ sollicitations: [sollicitation("s1", "a1", "devis_depose")], devis: [devis("d1", "s1", "a1", "depose")] });
    expect(html).toContain("Retenir ce devis");
    expect(html).toContain("Refuser");
    expect(html).toContain("le devis de Plomberie Martin");
    expect(html).toContain("libère la place pour en solliciter un autre");
  });

  it("montre un devis refusé en lecture seule, avec sa date et le motif transmis, sans bouton", () => {
    const html = rendre({
      sollicitations: [sollicitation("s1", "a1", "refusee"), sollicitation("s2", "a2", "envoyee")],
      devis: [devis("d1", "s1", "a1", "refuse", { decision: "refus", decision_motif: MOTIF, decide_le: "2026-10-13T09:30:00.000Z" })],
    });
    expect(html).toContain("1 devis refusé");
    expect(html).toContain("Refusé le");
    expect(html).toContain("13/10/2026");
    expect(html).toContain(`Motif transmis à l&#x27;artisan : « ${MOTIF} »`);
    expect(html).not.toContain("Retenir ce devis");
    expect(html).not.toContain("Confirmer le refus");
    // L'état de la demande refusée est nommé, jamais en clair technique.
    expect(html).toContain("Devis refusé");
    expect(html).not.toContain(">refusee<");
    // La place est libre : la recherche d'un autre artisan est de nouveau proposée (un seul artisan en lice).
    expect(html).not.toContain("Deux artisans sont déjà en lice");
  });
});
