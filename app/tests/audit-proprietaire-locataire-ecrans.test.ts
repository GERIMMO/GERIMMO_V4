/**
 * Audit PROPRIÉTAIRE ET LOCATAIRE du 27/09 — les corrections d'écran.
 *
 * Chaque bloc correspond à un constat du relevé : une page 404 en français,
 * une promesse de prévenance exacte, des numéros d'urgence à 44 px, un
 * vocabulaire neutre pour le locataire, une seule promesse de conservation,
 * une attestation signée par un émetteur identifiable, l'avatar et le
 * « Bonjour » du propriétaire.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const banc = vi.hoisted(() => ({
  rpc: vi.fn(),
  notifierUrgence: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({
  verifierLocataire: async () => ({ user: { id: "loc" }, supabase: { rpc: banc.rpc } }),
  verifierGerant: async () => ({ user: null, supabase: {} }),
}));
vi.mock("@/lib/notifications", () => ({
  notifierIncidentUrgentDeclare: banc.notifierUrgence,
  notifierDevisDemande: vi.fn(),
  notifierMissionAnnulee: vi.fn(),
  notifierMissionConfiee: vi.fn(),
  notifierRendezVousFixe: vi.fn(),
}));

import PageIntrouvable from "@/app/not-found";
import { ReflexesUrgence } from "@/app/locataire/[orgId]/reflexes-urgence";
import { SUGGESTIONS } from "@/app/locataire/[orgId]/contact/fil-messages";
import { CONSERVATION_DOCUMENTS_LOCATAIRE } from "@/lib/locataire-textes";
import { emetteurAttestation } from "@/lib/attestation-emetteur";
import { initialesDe } from "@/lib/identite-compte";
import { contesterImputation, declarerMonIncident } from "@/app/actions/incidents";

beforeEach(() => {
  vi.clearAllMocks();
  banc.rpc.mockResolvedValue({ data: "incident-1", error: null });
});

function declaration(urgence: "normale" | "urgente") {
  const f = new FormData();
  f.set("categorie", "plomberie_canalisation");
  f.set("description", "Fuite sous l'évier");
  f.set("urgence", urgence);
  return f;
}

describe("page introuvable", () => {
  it("en français, sans le mot anglais, avec une sortie vers l'espace", () => {
    const html = renderToStaticMarkup(createElement(PageIntrouvable));
    expect(html).toContain("Cette page est introuvable");
    expect(html).toContain('href="/espaces"');
    expect(html).toContain("Retour à mon espace");
    expect(html).not.toMatch(/could not be found/i);
  });
});

describe("« prévenu immédiatement » ne se dit plus quand ce n'est pas vrai", () => {
  it("signalement ordinaire : le gestionnaire le verra à sa prochaine connexion", async () => {
    const r = await declarerMonIncident("org", {}, declaration("normale"));
    expect(banc.notifierUrgence).not.toHaveBeenCalled();
    expect(r.succes).toContain("à sa prochaine connexion");
    expect(r.succes).not.toMatch(/prévenu/);
  });

  it("urgence et e-mail parti : prévenu par e-mail", async () => {
    banc.notifierUrgence.mockResolvedValue({ envoyee: true });
    const r = await declarerMonIncident("org", {}, declaration("urgente"));
    expect(r.succes).toContain("prévenu par e-mail");
  });

  it("urgence mais e-mail non parti : on ne prétend pas l'avoir prévenu", async () => {
    banc.notifierUrgence.mockResolvedValue({ envoyee: false, motif: "sans_adresse" });
    const r = await declarerMonIncident("org", {}, declaration("urgente"));
    expect(r.succes).not.toMatch(/prévenu/);
  });

  it("la carte d'urgence ne promet plus « immédiatement », et dit comment prévenir", () => {
    const html = renderToStaticMarkup(ReflexesUrgence({ hrefSignalement: "/x" }));
    expect(html).not.toContain("immédiatement");
    expect(html).toContain("Est-ce urgent ?");
  });
});

describe("numéros d'urgence : des cibles de 44 px", () => {
  it("le gaz et le 112 sont des boutons d'appel min-h-11", () => {
    const html = renderToStaticMarkup(ReflexesUrgence());
    for (const tel of ["tel:0800473333", "tel:112"]) {
      const lien = html.match(new RegExp(`<a[^>]*href="${tel}"[^>]*>`))?.[0] ?? "";
      expect(lien).toContain("min-h-11");
    }
  });
});

describe("vocabulaire du locataire : « gestionnaire », pas « agence »", () => {
  it("la contestation est transmise au gestionnaire", async () => {
    banc.rpc.mockResolvedValue({ data: null, error: null });
    const f = new FormData();
    f.set("message", "Ce n'est pas de mon fait.");
    const r = await contesterImputation("org", "inc", {}, f);
    expect(r.succes).toContain("votre gestionnaire");
    expect(r.succes).not.toContain("agence");
  });

  it("les idées de message ne poussent plus à envoyer l'assurance par message", () => {
    expect(SUGGESTIONS.join(" ")).not.toMatch(/assurance/i);
  });
});

describe("une seule promesse de conservation", () => {
  it("sans « rien à archiver », et invite à garder son exemplaire", () => {
    expect(CONSERVATION_DOCUMENTS_LOCATAIRE).not.toMatch(/rien à archiver/);
    expect(CONSERVATION_DOCUMENTS_LOCATAIRE).toMatch(/Enregistrez-les en PDF/);
  });
});

describe("attestation de bon paiement : un émetteur identifiable", () => {
  const base = {
    nom: "Parc de Claire Moreau",
    adresse: "1 rue Haute",
    code_postal: "69007",
    ville: "Lyon",
    email: "claire@pd.test",
    siret: null,
    bailleurs: [{ nom: "Moreau", prenom: "Claire" }],
  };

  it("chez un propriétaire direct, le bailleur atteste — pas son « parc »", () => {
    const e = emetteurAttestation({ ...base, type: "proprietaire_direct" });
    expect(e.nom).toBe("Moreau Claire");
    expect(e.qualite).toMatch(/^bailleur du logement/);
    expect(e.adresse).toBe("1 rue Haute, 69007 Lyon");
    expect(e.manquants).toEqual([]);
  });

  it("chez une agence, l'agence atteste pour le compte du bailleur", () => {
    const e = emetteurAttestation({ ...base, type: "agence", nom: "Agence Alpha", siret: "123" });
    expect(e.nom).toBe("Agence Alpha");
    expect(e.qualite).toContain("pour le compte de Moreau Claire");
    expect(e.siret).toBe("123");
  });

  it("sans adresse, l'attestation n'est pas délivrable", () => {
    const e = emetteurAttestation({ ...base, type: "agence", adresse: null, ville: null });
    expect(e.manquants).toEqual(["son adresse", "sa commune"]);
  });
});

describe("le propriétaire est une personne", () => {
  it("ses initiales, prénom puis nom : « CM » pour Claire Moreau", () => {
    expect(initialesDe({ prenom: "Claire", nom: "Moreau" })).toBe("CM");
    expect(initialesDe({ prenom: null, nom: null })).toBeNull();
  });
});

describe("le parcours de démarrage mène au premier loyer encaissé", async () => {
  const { ParcoursDemarrage } = await import("@/components/parcours-demarrage");
  const etapes = ["identite", "bien", "lot_pret", "locataire", "bail", "loyer"].map((etape, i) => ({
    etape,
    faite: i < 5,
    detail: etape === "loyer" ? "Le loyer arrive sur votre compte : déclarez l'encaissement." : null,
    lot_id: null,
    bien_id: null,
  }));
  const supabase = (envoiAuto: boolean) => ({
    rpc: async () => ({ data: etapes, error: null }),
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { quittances_envoi_auto: envoiAuto, appels_envoi_auto: envoiAuto, relances_envoi_auto: false },
            error: null,
          }),
        }),
      }),
    }),
  });

  it("six étapes, la dernière mène à Loyers & charges, et plus de « rien à lancer »", async () => {
    const el = await ParcoursDemarrage({
      supabase: supabase(true) as never,
      orgId: "org",
      estProprietaire: true,
    });
    const html = renderToStaticMarkup(el!);
    expect(html).toContain("5 / 6");
    expect(html).toContain("Le premier loyer encaissé");
    expect(html).toContain('href="/agence/org/loyers"');
    expect(html).not.toContain("rien à lancer");
    expect(html).toContain("déclarer chaque encaissement");
  });
});
