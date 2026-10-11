import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const banc = vi.hoisted(() => ({ rpc: vi.fn(), acces: vi.fn() }));
vi.mock("@/lib/espace", () => ({ verifierAccesEspace: banc.acces }));
vi.mock("@/app/actions/messages", () => ({ repondreMessagePersonne: vi.fn() }));
import PageMessages from "@/app/agence/[orgId]/messages/page";

const fil = { person_id: "personne-autorisee", nom: "Martin", prenom: "Camille", dernier: "Une question", dernier_le: "2026-10-11T08:00:00Z", dernier_auteur: "locataire", non_lus: 2 };
const message = { id: "message-1", auteur: "locataire", texte: "Bonjour, une question sur le logement.", cree_le: "2026-10-11T08:00:00Z" };
const rendre = async (personne?: string | string[]) => renderToStaticMarkup(await PageMessages({ params: Promise.resolve({ orgId: "org-proprietaire" }), searchParams: Promise.resolve({ personne }) }));

beforeEach(() => {
  vi.resetAllMocks();
  banc.acces.mockResolvedValue({ supabase: { rpc: banc.rpc }, role: "proprietaire_direct" });
  banc.rpc.mockImplementation(async (nom: string) => ({ data: nom === "fils_messages_gerant" ? [fil] : [message], error: null }));
});

describe("ouverture des conversations du propriétaire", () => {
  it("ne marque aucune conversation comme lue en ouvrant simplement la liste", async () => {
    const html = await rendre();
    expect(banc.rpc).toHaveBeenCalledExactlyOnceWith("fils_messages_gerant", { p_org: "org-proprietaire" });
    expect(html).toContain("2 messages non lus");
    expect(html).not.toContain(message.texte);
  });
  it.each(["personne-hors-perimetre", ["personne-autorisee", "intrus"]])("refuse de charger une sélection non autorisée (%s)", async (personne) => {
    await rendre(personne);
    expect(banc.rpc).toHaveBeenCalledTimes(1);
  });
  it("ouvre seulement la personne sélectionnée dans l'organisation autorisée", async () => {
    const html = await rendre(fil.person_id);
    expect(banc.rpc).toHaveBeenCalledWith("messages_personne", { p_org: "org-proprietaire", p_person: fil.person_id });
    expect(html).toContain(message.texte);
    expect(html).toContain("Tout est lu");
    expect(html).toContain("Votre message");
  });
  it("garde les non-lus et signale l'échec si la conversation ne peut pas être lue", async () => {
    banc.rpc.mockImplementation(async (nom: string) => nom === "fils_messages_gerant" ? { data: [fil], error: null } : { data: null, error: { message: "indisponible" } });
    const html = await rendre(fil.person_id);
    expect(html).toContain("2 messages non lus");
    expect(html).toContain("cette conversation");
    expect(html).not.toContain('name="texte"');
  });
  it("ne présente pas un échec de liste comme une messagerie vide", async () => {
    banc.rpc.mockResolvedValue({ data: null, error: { message: "indisponible" } });
    const html = await rendre();
    expect(html).toContain("les conversations");
    expect(html).not.toContain("Votre première conversation");
  });
  it("préserve le parcours de l'agence sans charger un message à sa place", async () => {
    banc.acces.mockResolvedValue({ supabase: { rpc: banc.rpc }, role: "admin_agence" });
    const html = await rendre(fil.person_id);
    expect(banc.rpc).toHaveBeenCalledTimes(1);
    expect(html).toContain(`/personnes/${fil.person_id}#messages`);
  });
});
