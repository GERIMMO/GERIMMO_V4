import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({ acces: vi.fn() }));
vi.mock("@/lib/espace", () => ({ verifierAccesEspace: banc.acces }));
vi.mock("@/lib/documents/modeles/communs", () => ({ signatureOrganisation: async () => null }));
vi.mock("@/app/agence/[orgId]/profil/formulaire-profil", () => ({
  FormulaireProfilOrganisation: ({ lectureSeule }: { lectureSeule: boolean }) =>
    lectureSeule ? createElement("p", null, "Coordonnées consultables") : createElement("form", { "aria-label": "Modifier mes coordonnées" }),
}));
vi.mock("@/app/agence/[orgId]/profil/formulaire-signature", () => ({ FormulaireSignature: () => null }));
vi.mock("@/app/agence/[orgId]/profil/bouton-copier-lien", () => ({ BoutonsLienParrainage: () => null }));

import PageProfil from "@/app/agence/[orgId]/profil/page";

describe("le profil du client ne confond pas consultation et responsabilité", () => {
  for (const estProprietaire of [true, false]) {
    for (const traverseeLectureSeule of [true, false]) {
      it(`${estProprietaire ? "propriétaire" : "agence"}, supervision=${traverseeLectureSeule}`, async () => {
        const profil = { name: "Client fictif", address_line1: null, city: null, email_contact: null };
        const supabase = {
          from: (table: string) => {
            const reponse = { data: table === "organizations" ? profil : [], error: null };
            const q: unknown = new Proxy({}, { get: (_, cle) => cle === "then"
              ? (ok: (v: unknown) => void) => Promise.resolve(reponse).then(ok)
              : () => q });
            return q;
          },
          rpc: async () => ({ data: false, error: null }),
        };
        banc.acces.mockResolvedValue({ supabase, estProprietaire, traverseeLectureSeule,
          role: estProprietaire ? "proprietaire_direct" : "admin_agence", organisation: profil });
        const html = renderToStaticMarkup(await PageProfil({ params: Promise.resolve({ orgId: "org-test" }),
          searchParams: Promise.resolve({ retour: "nouveau-lot" }) } as never));
        if (traverseeLectureSeule) {
          expect(html).toContain("Coordonnées consultables");
          expect(html).not.toContain("<form");
          expect(html).not.toContain("Avant de générer vos documents");
          expect(html).not.toContain("Reprendre la création du lot");
          if (estProprietaire) expect(html).toContain("Profil du propriétaire");
        } else {
          expect(html).toContain('aria-label="Modifier mes coordonnées"');
          expect(html).toContain("Avant de générer vos documents");
          if (estProprietaire) expect(html).toContain("Reprendre la création du lot");
        }
      });
    }
  }
});
