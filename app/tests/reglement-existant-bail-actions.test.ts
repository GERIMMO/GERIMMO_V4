import { beforeEach, expect, it, vi } from "vitest";

const ORG = "00000000-0000-4000-8000-000000000001";
const BAIL = "00000000-0000-4000-8000-000000000002";
const LOT = "00000000-0000-4000-8000-000000000003";
const DOC = "00000000-0000-4000-8000-000000000004";
const AUTRE = "00000000-0000-4000-8000-000000000005";
const m = vi.hoisted(() => ({
  autorise: true, etat: "brouillon", actuel: null as string | null,
  horsPortefeuille: false, erreurPortefeuille: false,
  type: "reglement_copropriete", mime: "application/pdf", purge: false, remplace: false,
  erreurLecture: "", erreurEcriture: false, confirmation: "ok",
  rpc: vi.fn(), revalidate: vi.fn(),
  lectures: [] as { table: string; filtres: Record<string, unknown> }[],
  ecritures: [] as { table: string; ligne: unknown; filtres: Record<string, unknown> }[],
}));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: async () => ({
  user: m.autorise ? { id: "moi" } : null,
  supabase: {
    rpc: async (nom: string, args: unknown) => {
      m.rpc(nom, args);
      return { data: m.horsPortefeuille, error: m.erreurPortefeuille ? { message: "indisponible" } : null };
    },
    from(table: string) {
      const filtres: Record<string, unknown> = {};
      let mutation = false;
      const q = {
        select: () => q, limit: () => q,
        eq: (champ: string, valeur: unknown) => { filtres[champ] = valeur; return q; },
        is: (champ: string, valeur: unknown) => { filtres[champ] = valeur; return q; },
        update: (ligne: unknown) => { mutation = true; m.ecritures.push({ table, ligne, filtres }); return q; },
        maybeSingle: async () => {
          if (mutation) return {
            data: m.confirmation === "vide" ? null : { id: BAIL, reglement_copropriete: m.confirmation === "autre" ? AUTRE : DOC },
            error: m.erreurEcriture ? { message: "Ce bail est verrouillé par une signature." } : null,
          };
          m.lectures.push({ table, filtres });
          const source = filtres.remplace_id ? "version" : table;
          const data = table === "baux"
            ? filtres.organization_id === ORG && filtres.id === BAIL ? { id: BAIL, lot_id: LOT, etat: m.etat, reglement_copropriete: m.actuel } : null
            : source === "version" ? m.remplace ? { id: AUTRE } : null
              : filtres.organization_id === ORG && filtres.id === DOC ? { id: DOC, type: m.type, mime_type: m.mime, purged_at: m.purge ? "2026-10-01" : null } : null;
          return { data, error: m.erreurLecture === source ? { message: "lecture indisponible" } : null };
        },
      };
      return q;
    },
  },
}) }));
import { utiliserReglementExistantBail } from "@/app/actions/reglement-existant-bail";

function envoyer(documentId = DOC, orgId = ORG, bailId = BAIL) {
  const form = new FormData();
  form.set("document_id", documentId);
  form.set("lot_id", AUTRE);
  return utiliserReglementExistantBail(orgId, bailId, {}, form);
}
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(m, { autorise: true, etat: "brouillon", actuel: null, horsPortefeuille: false, erreurPortefeuille: false, type: "reglement_copropriete", mime: "application/pdf", purge: false, remplace: false, erreurLecture: "", erreurEcriture: false, confirmation: "ok" });
  m.lectures.length = 0;
  m.ecritures.length = 0;
});

it("rattache seulement le PDF à un règlement vide et confirme la ligne, sans activer le bail", async () => {
  expect(await envoyer()).toEqual({ succes: "Règlement associé au bail." });
  expect(m.ecritures).toEqual([{ table: "baux", ligne: { reglement_copropriete: DOC }, filtres: { id: BAIL, organization_id: ORG, etat: "brouillon", reglement_copropriete: null } }]);
  expect(m.rpc).toHaveBeenCalledExactlyOnceWith("lot_hors_portefeuille", { p_org: ORG, p_lot: LOT });
  expect(m.revalidate).toHaveBeenCalledWith(`/agence/${ORG}/baux/${BAIL}`);
  expect(m.revalidate).toHaveBeenCalledWith(`/espace/${ORG}/baux/${BAIL}`);
  expect(m.lectures.find(l => l.table === "documents")?.filtres).toEqual({ id: DOC, organization_id: ORG });
});

it.each(["session", "bail_actif", "deja_present", "portefeuille", "erreur_portefeuille", "autre_org", "autre_bail"])("refuse avant toute écriture : %s", async cas => {
  if (cas === "session") m.autorise = false;
  if (cas === "bail_actif") m.etat = "actif";
  if (cas === "deja_present") m.actuel = AUTRE;
  if (cas === "portefeuille") m.horsPortefeuille = true;
  if (cas === "erreur_portefeuille") m.erreurPortefeuille = true;
  expect(await envoyer(DOC, cas === "autre_org" ? AUTRE : ORG, cas === "autre_bail" ? AUTRE : BAIL)).toHaveProperty("erreur");
  expect(m.ecritures).toEqual([]);
});

it.each(["", "invalide", AUTRE])("refuse un document absent ou inaccessible : %s", async documentId => {
  expect(await envoyer(documentId)).toHaveProperty("erreur");
  expect(m.ecritures).toEqual([]);
});

it.each(["type", "mime", "purge", "remplace"])("refuse une pièce impropre au rattachement : %s", async cas => {
  if (cas === "type") m.type = "attestation_assurance";
  if (cas === "mime") m.mime = "image/png";
  if (cas === "purge") m.purge = true;
  if (cas === "remplace") m.remplace = true;
  expect(await envoyer()).toHaveProperty("erreur");
  expect(m.ecritures).toEqual([]);
});

it.each(["baux", "documents", "version"])("ne confond pas une erreur de lecture %s avec une absence", async source => {
  m.erreurLecture = source;
  expect(await envoyer()).toHaveProperty("erreur");
  expect(m.ecritures).toEqual([]);
});

it.each(["vide", "autre"])("ne confirme pas une affectation concurrente : %s", async confirmation => {
  m.confirmation = confirmation;
  expect(await envoyer()).toEqual({ erreur: expect.stringContaining("a changé") });
  expect(m.revalidate).not.toHaveBeenCalled();
});

it("conserve le refus des gardes de signature sans faux succès", async () => {
  m.erreurEcriture = true;
  expect(await envoyer()).toEqual({ erreur: "Ce bail est verrouillé par une signature." });
  expect(m.revalidate).not.toHaveBeenCalled();
});
