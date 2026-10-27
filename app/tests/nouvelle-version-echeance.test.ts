/**
 * Audit #264, DOC-08 — une nouvelle version ne naît jamais « Expiré » parce
 * que l'ancienne échéance, dépassée, aurait été pré-remplie : le champ part
 * vide (l'ancienne date est rappelée en aide) et le serveur refuse une date
 * déjà passée, qui ne se corrigerait plus (fiche immuable, doublon refusé).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { remplacerDocument } from "@/app/actions/documents-ged";
import { FormulaireRemplacer } from "@/app/agence/[orgId]/documents/formulaire-remplacer";
import { aujourdhuiParis } from "@/lib/ged";

const m = vi.hoisted(() => ({ acces: vi.fn(), upload: vi.fn(), rpc: vi.fn(), from: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: m.acces }));
vi.mock("@/lib/depot-direct", () => ({ resoudreDepotsFormulaire: async () => null, limiteFichierDepose: () => 10 * 1024 * 1024 }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: m.redirect, unstable_rethrow: vi.fn(), useRouter: () => ({ push: vi.fn() }) }));

function jourDecale(jours: number) {
  const d = new Date(`${aujourdhuiParis()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}
function saisie(expire: string) {
  const f = new FormData();
  f.set("fichier", new File([new TextEncoder().encode("%PDF-1.4\n% attestation renouvelée\n%%EOF\n")], "attestation.pdf", { type: "application/pdf" }));
  f.set("expire_le", expire);
  return f;
}

beforeEach(() => {
  vi.resetAllMocks();
  // Aucun doublon, et aucun diagnostic en service sur la pièce (garde DOC-03 de remplacerDocument).
  const doublon = { select: () => doublon, eq: () => doublon, is: () => doublon, maybeSingle: async () => ({ data: null, error: null }), limit: async () => ({ data: [], error: null }) };
  m.from.mockReturnValue(doublon);
  m.upload.mockResolvedValue({ error: null });
  m.rpc.mockResolvedValue({ data: "version-2", error: null });
  m.redirect.mockImplementation((url: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { url }); });
  m.acces.mockResolvedValue({ supabase: { from: m.from, rpc: m.rpc, storage: { from: () => ({ upload: m.upload }) } }, user: { id: "compte" }, role: "proprietaire_direct" });
});

describe("remplacerDocument : échéance de la nouvelle version", () => {
  it("refuse une échéance déjà passée avant tout enregistrement, en gardant la saisie", async () => {
    const resultat = await remplacerDocument("org", "version-1", {}, saisie(jourDecale(-1)));
    expect(resultat.erreur).toMatch(/déjà passée/);
    expect(resultat.valeurs?.expire_le).toBeTruthy();
    expect(m.upload).not.toHaveBeenCalled();
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("refuse une date mal formée", async () => {
    const resultat = await remplacerDocument("org", "version-1", {}, saisie("30/06/2027"));
    expect(resultat.erreur).toMatch(/n'est pas valide/);
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it.each([["aujourd’hui", 0], ["une date future", 365]])("accepte %s et la transmet telle quelle", async (_cas, jours) => {
    const expire = jourDecale(jours);
    await expect(remplacerDocument("org", "version-1", {}, saisie(expire))).rejects.toMatchObject({ url: "/espace/org/documents?sel=version-2" });
    expect(m.rpc).toHaveBeenCalledWith("remplacer_document_ged", expect.objectContaining({ p_expire: expire }));
  });
});

describe("FormulaireRemplacer : l’ancienne échéance n’est jamais pré-remplie", () => {
  const rendu = (expireLe: string | null) =>
    renderToStaticMarkup(createElement(FormulaireRemplacer, { orgId: "org", documentId: "version-1", expireLe, integre: true }));

  it("une échéance dépassée est rappelée en aide, le champ reste vide et requis", () => {
    const passee = jourDecale(-119);
    const html = rendu(passee);
    const champ = html.match(/<input[^>]*name="expire_le"[^>]*>/)?.[0] ?? "";
    expect(champ).toContain("required");
    expect(champ).not.toContain(passee);
    expect(html).toContain(`Version actuelle : ${passee.split("-").reverse().join("/")} (dépassée)`);
  });

  it("une échéance encore valable n’est pas reprise non plus", () => {
    const future = jourDecale(200);
    const champ = rendu(future).match(/<input[^>]*name="expire_le"[^>]*>/)?.[0] ?? "";
    expect(champ).not.toContain(future);
  });

  it("une pièce sans échéance n’en demande pas", () => {
    expect(rendu(null)).not.toContain('name="expire_le"');
  });
});
