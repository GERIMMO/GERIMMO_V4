import { createHash } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { remettreRapportMensuel } from "@/lib/rapports-mensuels";

const m = vi.hoisted(() => ({ email: vi.fn(), pdf: vi.fn(), assembler: vi.fn(), depot: vi.fn() }));
vi.mock("@/lib/email", () => ({ envoyerEmail: m.email }));
vi.mock("@/lib/documents/rendu", () => ({ rendrePdf: m.pdf }));
vi.mock("@/lib/documents/modeles/catalogue-gestion", () => ({ assemblerComplementGestion: m.assembler }));
vi.mock("@/lib/ged-depot", () => ({ deposerFichierGed: m.depot }));
const user = { id: "admin" } as User;
const pdf = new TextEncoder().encode("%PDF-1.7\nCompte rendu de recette\n%%EOF");
const empreinte = createHash("sha256").update(pdf).digest("hex");
function banc(statut = "a_valider") {
  const tables: Record<string, Record<string, unknown>[]> = {
    rapports_gestion: [{ id: "rapport", organization_id: "org", mandat_id: "mandat", mois: "2026-08-01", statut }],
    mandats: [{ id: "mandat", organization_id: "org", person_id: "personne" }],
    persons: [{ id: "personne", organization_id: "org", email: "mandant@recette.test" }],
    documents: [],
  };
  const erreurs = new Set<string>();
  const liens = vi.fn().mockResolvedValue({ error: null });
  const rpc = vi.fn().mockResolvedValue({ error: null });
  const download = vi.fn().mockResolvedValue({ data: new Blob([pdf]), error: null });
  const from = (table: string) => {
    const filtres: [string, unknown][] = [];
    const resultat = () => ({ error: erreurs.has(table) ? { message: "indisponible" } : null,
      data: erreurs.has(table) ? null : (tables[table] ?? []).filter(r => filtres.every(([k,v]) => r[k] === v)) });
    const q = {
      select: () => q, order: () => q, is: () => q,
      eq: (k: string, v: unknown) => { filtres.push([k,v]); return q; },
      limit: async () => resultat(),
      maybeSingle: async () => { const r = resultat(); return { ...r, data: r.data?.[0] ?? null }; },
      upsert: liens,
    };
    return q;
  };
  return { tables, erreurs, rpc, liens, download, db: { from, rpc, storage: { from: () => ({ download }) } } as unknown as SupabaseClient };
}
function archiver(b: ReturnType<typeof banc>) {
  b.tables.documents = [{ id: "doc", organization_id: "org", type: "rapport_gestion", titre: "Compte rendu mensuel · rapport", storage_path: "org/rapport.pdf", empreinte, mime_type: "application/pdf", taille_octets: pdf.length }];
}
beforeEach(() => {
  vi.clearAllMocks();
  m.email.mockResolvedValue({ id: "resend-test" });
  m.assembler.mockResolvedValue({ document: { html: "rapport détaillé", manquants: [] }, liens: [] });
  m.pdf.mockResolvedValue(pdf);
  m.depot.mockResolvedValue({ documentId: "doc" });
});

describe("Compte rendu mensuel sans compte propriétaire", () => {
  it("joint le PDF complet, l’archive et ne prétend pas prouver la réception", async () => {
    const b = banc();
    const r = await remettreRapportMensuel(b.db, user, "org", "rapport", "Commentaire", "admin_agence");
    expect(r).toMatchObject({ documentId: "doc", succes: expect.stringContaining("réception n’est pas encore confirmée") });
    expect(b.rpc).toHaveBeenCalledWith("envoyer_rapport", { p_rapport: "rapport", p_commentaire: "Commentaire" });
    expect(m.email).toHaveBeenCalledWith(expect.objectContaining({ to: "mandant@recette.test", piecesJointes: [{ nom: "compte-rendu-2026-08-rapport.pdf", contenuBase64: Buffer.from(pdf).toString("base64") }] }));
    expect(m.email.mock.calls[0][0].html).toContain("sans compte Gerimmo");
    expect(b.rpc).toHaveBeenCalledWith("log_tech", expect.objectContaining({ details: expect.objectContaining({ resultat: "accepte_prestataire", email_id: "resend-test" }) }));
  });
  it("refuse un rapport d’une autre agence avant toute écriture ou envoi", async () => {
    const b = banc(); const r = await remettreRapportMensuel(b.db, user, "autre-org", "rapport", null, "admin_agence");
    expect(r.erreur).toMatch(/inaccessible/); expect(b.rpc).not.toHaveBeenCalled(); expect(m.email).not.toHaveBeenCalled();
  });
  it("refuse un mandat non visible dans le portefeuille", async () => {
    const b = banc(); b.tables.mandats = [];
    expect((await remettreRapportMensuel(b.db, user, "org", "rapport", null, "admin_agence")).erreur).toMatch(/mandat/);
    expect(b.rpc).not.toHaveBeenCalled(); expect(m.email).not.toHaveBeenCalled();
  });
  it.each(["rapports_gestion", "mandats", "persons", "documents"])("n’envoie rien si la lecture %s échoue", async table => {
    const b = banc(); b.erreurs.add(table);
    expect((await remettreRapportMensuel(b.db, user, "org", "rapport", null, "admin_agence")).erreur).toBeTruthy();
    expect(m.email).not.toHaveBeenCalled();
  });
  it.each([null, "", "adresse-invalide", "a@b.fr\nBcc:autre@b.fr"])("refuse l’adresse %j avant validation", async email => {
    const b = banc(); b.tables.persons[0].email = email;
    expect((await remettreRapportMensuel(b.db, user, "org", "rapport", null, "admin_agence")).erreur).toMatch(/adresse e-mail valide/);
    expect(b.rpc).not.toHaveBeenCalled(); expect(m.email).not.toHaveBeenCalled();
  });
  it("réutilise la copie archivée en reprise, sans regénérer ni refaire la validation", async () => {
    const b = banc("envoye"); archiver(b);
    await remettreRapportMensuel(b.db, user, "org", "rapport", "Nouveau commentaire ignoré", "admin_agence");
    expect(m.assembler).not.toHaveBeenCalled(); expect(m.depot).not.toHaveBeenCalled();
    expect(b.rpc.mock.calls.some(c => c[0] === "envoyer_rapport")).toBe(false);
    expect(m.email).toHaveBeenCalledOnce();
  });
  it.each(["storage_path", "empreinte", "mime_type"])("refuse une archive incohérente (%s)", async champ => {
    const b = banc("envoye"); archiver(b); b.tables.documents[0][champ] = "autre";
    expect((await remettreRapportMensuel(b.db, user, "org", "rapport", null, "admin_agence")).erreur).toBeTruthy();
    expect(m.email).not.toHaveBeenCalled();
  });
  it("refuse d’envoyer un PDF dont l’archivage ou le rattachement a échoué", async () => {
    const b = banc(); m.depot.mockResolvedValueOnce({ erreur: "stockage" });
    expect((await remettreRapportMensuel(b.db, user, "org", "rapport", null, "admin_agence")).erreur).toMatch(/archivage/);
    b.liens.mockResolvedValue({ error: { message: "droits" } });
    expect((await remettreRapportMensuel(b.db, user, "org", "rapport", null, "admin_agence")).erreur).toMatch(/rattachement/);
    expect(m.email).not.toHaveBeenCalled();
  });
  it("ne rend ni n'envoie un compte rendu comportant des champs manquants", async () => {
    const b = banc();
    m.assembler.mockResolvedValueOnce({ document: { html: "rapport", manquants: ["adresse du mandant"] }, liens: [] });
    const retour = await remettreRapportMensuel(b.db, user, "org", "rapport", null, "admin_agence");
    expect(retour.erreur).toContain("adresse du mandant");
    expect(m.pdf).not.toHaveBeenCalled();
    expect(m.depot).not.toHaveBeenCalled();
    expect(m.email).not.toHaveBeenCalled();
  });
  it("un échec d’envoi garde la copie et une nouvelle tentative réutilise la même clé", async () => {
    const b = banc("envoye"); archiver(b); m.email.mockResolvedValueOnce({ erreur: "Indisponible" });
    const premier = await remettreRapportMensuel(b.db, user, "org", "rapport", null, "admin_agence");
    expect(premier).toMatchObject({ documentId: "doc", erreur: expect.stringContaining("réessayer") });
    expect(premier.succes).toBeUndefined();
    await remettreRapportMensuel(b.db, user, "org", "rapport", null, "admin_agence");
    expect(m.email.mock.calls[0][0]).toEqual(m.email.mock.calls[1][0]);
    expect(b.rpc).toHaveBeenCalledWith("log_tech", expect.objectContaining({ details: expect.objectContaining({ resultat: "echec" }) }));
  });
});

it("un agent ne remet pas le rapport d’un mandat confié à un collègue", async () => {
  const b = banc(); b.tables.mandats[0].agent_account_id = "autre-gestionnaire";
  const r = await remettreRapportMensuel(b.db, user, "org", "rapport", null, "agent");
  expect(r.erreur).toMatch(/portefeuille/); expect(b.rpc).not.toHaveBeenCalled(); expect(m.email).not.toHaveBeenCalled();
});
it.each(["locataire", "proprietaire_mandant", "artisan", ""])("refuse le rôle %j avant toute lecture métier", async role => {
  const b = banc();
  expect((await remettreRapportMensuel(b.db, user, "org", "rapport", null, role)).erreur).toBe("Accès refusé.");
  expect(b.rpc).not.toHaveBeenCalled(); expect(m.email).not.toHaveBeenCalled();
});
it("ne confirme pas l’envoi si le prestataire ne renvoie aucune référence", async () => {
  const b = banc("envoye"); archiver(b); m.email.mockResolvedValue({});
  const r = await remettreRapportMensuel(b.db, user, "org", "rapport", null, "admin_agence");
  expect(r.erreur).toContain("référence d’envoi"); expect(r.succes).toBeUndefined();
});
