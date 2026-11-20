/**
 * « Être rappelé » (20/11/2026) : un visiteur laisse son numéro et son accord pour qu'on l'appelle.
 *
 * Ce que ces tests tiennent :
 *  1. les règles de saisie (numéro français, créneau, page d'origine) et le message composé, reconnaissable ;
 *  2. l'action serveur : rien n'est écrit sans nom, numéro valide, adresse et accord ; le pot de miel n'écrit rien ;
 *     une seule ligne, dans la table des demandes de contact, par le client de service ;
 *  3. la carte : une demande explicite (case d'accord obligatoire), aucun h1, les champs étiquetés, la page d'origine
 *     transmise, et l'effacement pour une personne venue de son espace (`data-appel-inscription`).
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const m = vi.hoisted(() => ({
  service: null as null | { from: (table: string) => { insert: (ligne: Record<string, unknown>) => Promise<{ error: null | { message: string } }> } },
  insertions: [] as { table: string; ligne: Record<string, unknown> }[],
  erreur: null as null | { message: string },
}));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => m.service }));

import {
  CRENEAUX_RAPPEL,
  creneauRappel,
  estDemandeRappel,
  lienAppel,
  messageRappel,
  origineRappel,
  PREFIXE_RAPPEL,
  telephoneRappel,
} from "../src/lib/demande-rappel";
import { demanderRappel } from "../src/app/actions/devis";
import { DemandeRappel } from "../src/components/demande-rappel";

beforeEach(() => {
  m.insertions = [];
  m.erreur = null;
  m.service = {
    from: (table) => ({
      insert: async (ligne) => {
        m.insertions.push({ table, ligne });
        return { error: m.erreur };
      },
    }),
  };
});

const formulaire = (valeurs: Record<string, string> = {}) => {
  const f = new FormData();
  const defauts = { nom: "Camille Test", telephone: "06 12 34 56 78", email: "camille@exemple.test", accord: "oui", origine: "/outils/calcul-irl" };
  for (const [k, v] of Object.entries({ ...defauts, ...valeurs })) f.set(k, v);
  return f;
};

describe("les règles d'une demande de rappel", () => {
  it.each([
    ["06 12 34 56 78", "06 12 34 56 78"],
    ["0612345678", "06 12 34 56 78"],
    ["06.12.34.56.78", "06 12 34 56 78"],
    ["01-23-45-67-89", "01 23 45 67 89"],
    ["+33 6 12 34 56 78", "+33 6 12 34 56 78"],
    ["+33612345678", "+33 6 12 34 56 78"],
    ["0033 6 12 34 56 78", "+33 6 12 34 56 78"],
    ["(06) 12 34 56 78", "06 12 34 56 78"],
  ])("« %s » est un numéro français, écrit « %s »", (saisie, attendu) => {
    expect(telephoneRappel(saisie)).toBe(attendu);
  });

  it.each(["", "  ", "061234567", "06123456789", "0012345678", "+44 7911 123456", "06 12 34 56 7a", "appelez-moi", "+33 0 12 34 56 78", null, 612345678])(
    "« %s » n'est pas un numéro admis",
    (saisie) => {
      expect(telephoneRappel(saisie)).toBeNull();
    },
  );

  it("le lien d'appel compose le numéro au format international", () => {
    expect(lienAppel("06 12 34 56 78")).toBe("tel:+33612345678");
    expect(lienAppel("+33 6 12 34 56 78")).toBe("tel:+33612345678");
  });

  it("un créneau inconnu ou absent vaut « indifférent »", () => {
    expect(creneauRappel("soir")).toBe("soir");
    expect(creneauRappel("nuit")).toBe("indifferent");
    expect(creneauRappel(null)).toBe("indifferent");
    expect(creneauRappel("toString")).toBe("indifferent");
  });

  it("la page d'origine est un chemin du site, sans requête, borné ; « / » sinon", () => {
    expect(origineRappel("/outils/calcul-irl")).toBe("/outils/calcul-irl");
    expect(origineRappel("/journal/revision-du-loyer?utm=1#haut")).toBe("/journal/revision-du-loyer");
    expect(origineRappel("https://exemple.invalid/piege")).toBe("/");
    expect(origineRappel("//exemple.invalid")).toBe("/");
    expect(origineRappel("/<script>")).toBe("/");
    expect(origineRappel(`/${"a".repeat(130)}`)).toBe("/");
    expect(origineRappel(undefined)).toBe("/");
  });

  it("le message composé se lit tel quel et se reconnaît à son préfixe", () => {
    const message = messageRappel("06 12 34 56 78", "soir", "/outils/calcul-irl");
    expect(message).toBe("Demande de rappel au 06 12 34 56 78. Créneau souhaité : en fin de journée (18 h – 20 h). Page d'origine : /outils/calcul-irl.");
    expect(estDemandeRappel(message)).toBe(true);
    expect(estDemandeRappel("Bonjour, une question sur mon compte")).toBe(false);
    expect(estDemandeRappel(null)).toBe(false);
    expect(message.length).toBeLessThan(4000);
  });
});

describe("l'action serveur demanderRappel", () => {
  it("une demande complète est enregistrée, une seule fois, dans les demandes de contact", async () => {
    const r = await demanderRappel({}, formulaire({ creneau: "matin" }));
    expect(r).toEqual({ succes: "Merci ! Nous vous rappelons au 06 12 34 56 78 sous un jour ouvré, le matin (9 h – 12 h)." });
    expect(m.insertions).toEqual([{
      table: "demandes_devis",
      ligne: {
        nom: "Camille Test",
        email: "camille@exemple.test",
        telephone: "06 12 34 56 78",
        message: "Demande de rappel au 06 12 34 56 78. Créneau souhaité : le matin (9 h – 12 h). Page d'origine : /outils/calcul-irl.",
      },
    }]);
  });

  it("sans créneau, la confirmation ne promet pas d'horaire", async () => {
    expect(await demanderRappel({}, formulaire())).toEqual({ succes: "Merci ! Nous vous rappelons au 06 12 34 56 78 sous un jour ouvré." });
  });

  it("le pot de miel répond « merci » sans rien écrire", async () => {
    expect((await demanderRappel({}, formulaire({ site: "http://spam.example" }))).succes).toMatch(/^Merci/);
    expect(m.insertions).toEqual([]);
  });

  it.each([
    [{ nom: "" }, /Indiquez votre nom/],
    [{ telephone: "" }, /numéro de téléphone français/],
    [{ telephone: "+44 7911 123456" }, /numéro de téléphone français/],
    [{ email: "pas-une-adresse" }, /adresse e-mail valide/],
    [{ accord: "" }, /Cochez la case/],
    [{ accord: "on" }, /Cochez la case/],
  ])("refuse %o avant toute écriture, en français", async (valeurs, erreur) => {
    const r = await demanderRappel({}, formulaire(valeurs as Record<string, string>));
    expect(r.erreur).toMatch(erreur);
    expect(r.succes).toBeUndefined();
    expect(m.insertions).toEqual([]);
  });

  it("une page d'origine piégée est ramenée à « / »", async () => {
    await demanderRappel({}, formulaire({ origine: "https://exemple.invalid" }));
    expect(String(m.insertions[0].ligne.message)).toMatch(/Page d'origine : \/\.$/);
  });

  it("sans clé de service, le formulaire le dit en français", async () => {
    m.service = null;
    expect(await demanderRappel({}, formulaire())).toEqual({ erreur: "Le formulaire est momentanément indisponible. Réessayez dans quelques minutes." });
  });

  it("le refus de la base (limite de débit) est rendu tel quel au visiteur", async () => {
    m.erreur = { message: "Nous avons déjà bien reçu vos demandes : nous revenons vers vous sous 48 h ouvrées." };
    const r = await demanderRappel({}, formulaire());
    expect(r.erreur).toBe("Nous avons déjà bien reçu vos demandes : nous revenons vers vous sous 48 h ouvrées.");
  });
});

describe("la carte « Être rappelé »", () => {
  const html = renderToStaticMarkup(createElement(DemandeRappel, { origine: "/outils/calcul-irl" }));
  /** La balise d'un champ, quel que soit l'ordre de ses attributs. */
  const balise = (nom: string) => new RegExp(`<(?:input|select)\\b[^>]*\\bname="${nom}"[^>]*>`).exec(html)?.[0] ?? "";

  it("demande l'accord explicite du visiteur : case obligatoire, non cochée", () => {
    const accord = balise("accord");
    expect(accord).toContain('type="checkbox"');
    expect(accord).toContain('value="oui"');
    expect(accord).toContain("required");
    expect(accord).not.toContain("checked");
    expect(html).toContain("J&#x27;accepte que Gerimmo m&#x27;appelle à ce numéro au sujet de ma demande.");
  });

  it("étiquette chaque champ, transmet la page d'origine et cache le pot de miel", () => {
    for (const nom of ["nom", "telephone", "email", "creneau", "accord"]) {
      const id = /\bid="([^"]+)"/.exec(balise(nom))?.[1];
      expect(id, nom).toBeTruthy();
      expect(html, nom).toContain(`for="${id}"`);
    }
    for (const nom of ["nom", "telephone", "email"]) expect(balise(nom), nom).toContain("required");
    expect(balise("telephone")).toContain('type="tel"');
    expect(balise("origine")).toContain('value="/outils/calcul-irl"');
    expect(balise("site")).toContain('tabindex="-1"');
    expect(balise("site")).toContain('aria-hidden="true"');
  });

  it("propose les créneaux, « indifférent » d'abord", () => {
    const options = [...html.matchAll(/<option value="([^"]+)"/g)].map((r) => r[1]);
    expect(options).toEqual(Object.keys(CRENEAUX_RAPPEL));
    expect(options[0]).toBe("indifferent");
  });

  it("un seul titre, de niveau 2 : la carte ne prend jamais le titre de la page", () => {
    expect(html).not.toContain("<h1");
    expect(html.match(/<h2/g)).toHaveLength(1);
  });

  it("s'efface pour une personne venue de son espace, comme l'invitation à l'essai, et à l'impression", () => {
    expect(html).toMatch(/<section[^>]*data-appel-inscription/);
    expect(html).toContain("print:hidden");
  });

  it("l'envoi est un bouton natif, sans attente de l'hydratation (action serveur passée telle quelle)", () => {
    expect(html).toMatch(/<button type="submit"[^>]*>Être rappelé<\/button>/);
    expect(html).not.toMatch(/<button type="submit"[^>]*disabled/);
  });
});

describe("où la carte est posée", () => {
  const lire = (chemin: string) => readFileSync(chemin, "utf8");

  it("sur l'accueil, sous chaque outil gratuit et sous chaque article du journal, avec sa page d'origine", () => {
    expect(lire("src/app/page.tsx")).toContain('<DemandeRappel origine="/"');
    expect(lire("src/components/outils/coquille-outil.tsx")).toContain("<DemandeRappel origine={chemin} />");
    expect(lire("src/app/journal/[slug]/page.tsx")).toContain("<DemandeRappel origine={`/journal/${slug}`} />");
  });

  it("pas sur la page des tarifs : elle reste identique (aucune modification des tarifs ni de leur page)", () => {
    expect(lire("src/app/tarifs/page.tsx")).not.toContain("DemandeRappel");
  });

  it("la console reconnaît la demande et propose l'appel", () => {
    const console = lire("src/app/admin/devis/page.tsx");
    expect(console).toContain("estDemandeRappel(d.message)");
    expect(console).toContain("lienAppel(d.telephone)");
    expect(PREFIXE_RAPPEL).toBe("Demande de rappel");
  });
});
