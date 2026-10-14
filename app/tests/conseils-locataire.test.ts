/**
 * « Conseils pour choisir votre locataire » (demande du dirigeant, 14/10/2026) :
 * des repères, destinés au PROPRIÉTAIRE BAILLEUR en gestion directe, pour relire
 * le dossier d'un candidat avec les conditions d'une assurance loyers impayés.
 *
 * Quatre blocs :
 *  1. le contenu est celui du fichier de contenu fourni (tests/fixtures/
 *     gli-conseils-contenu.json), sans chiffre ni règle ajoutés ;
 *  2. le composant : replié par défaut, tous les conseils, groupés par niveau
 *     de certitude, mention générale, aucun verdict ni score ;
 *  3. l'étape « Personnes » du bail en préparation (là où le locataire est
 *     choisi) : le bloc y est pour le propriétaire en gestion directe, jamais
 *     pour l'agence ni pour l'agent — le contrôle d'accès est le vrai
 *     `verifierAccesEspace`, seule la base est simulée ;
 *  4. des gardes de source : qui importe le composant (ni l'espace locataire,
 *     ni l'espace artisan), pas de lecture de montant dans le nouveau code.
 *
 * Le rappel posé sur la fiche d'un bail en cours est dans
 * `conseils-locataire-fiche-bail.test.ts` (la page entière est rendue).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({
  adhesion: null as unknown,
  superAdmin: false,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  redirect: (cible: string) => {
    throw new Error(`redirect:${cible}`);
  },
  notFound: () => {
    throw new Error("notFound");
  },
  unstable_rethrow: (erreur: unknown) => {
    throw erreur;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// Les actions serveur du bail ne sont pas jouées ici : on ne rend que l'écran.
vi.mock("@/app/actions/personnes-bail", () => ({
  choisirPersonneBail: async () => ({}),
  creerPersonneBail: async () => ({}),
  modifierPersonneBail: async () => ({}),
  retirerPersonneBail: async () => ({}),
}));
// Une base simulée : l'adhésion de la personne connectée, des listes vides, et
// le lot du bail. Tout le reste (contrôle d'accès, calcul de `estProprietaire`)
// est le vrai code.
vi.mock("@/lib/supabase/server", () => {
  const requete = (table: string) => {
    const reponse =
      table === "lots"
        ? { data: { bien_id: "bien-1" }, error: null }
        : table === "memberships"
          ? { data: banc.adhesion, error: null }
          : { data: [], error: null };
    const q: unknown = new Proxy(() => {}, {
      get(_cible, propriete) {
        if (propriete === "then") return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(reponse).then(ok, ko);
        if (propriete === "maybeSingle" || propriete === "single") return async () => reponse;
        return () => q;
      },
    });
    return q;
  };
  return {
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: { id: "compte-1" } } }) },
      from: requete,
      rpc: async (nom: string) => ({ data: nom === "is_super_admin" ? banc.superAdmin : null, error: null }),
    }),
  };
});

import { ConseilsChoixLocataire } from "@/components/conseils-choix-locataire";
import {
  CONSEILS_CHOIX_LOCATAIRE,
  MENTION_GENERALE_CONSEILS,
  NIVEAUX_CERTITUDE,
  ponctuationFrancaise,
  type NiveauCertitude,
} from "@/lib/conseils-locataire";
import { EtapePersonnesBail } from "@/app/agence/[orgId]/baux/[bailId]/etape-personnes-bail";

// ── Outils ────────────────────────────────────────────────────────────────

type Contenu = {
  mention_generale: string;
  conseils: { titre: string; conseil: string; niveau_certitude: string }[];
};
const contenu: Contenu = JSON.parse(
  readFileSync(path.resolve(__dirname, "fixtures", "gli-conseils-contenu.json"), "utf8")
);

/** Seules corrections de français faites au fichier de contenu (voir le module). */
const CORRECTIONS_DE_FRANCAIS: [avant: string, apres: string][] = [
  ["Demande avant la signature.", "La demande se fait avant la signature du bail."],
];
const NIVEAU_DU_FICHIER: Record<string, NiveauCertitude> = {
  "règle légale": "regle-legale",
  "pratique courante des assureurs": "pratique-courante",
  "variable selon le contrat": "variable-contrat",
};

const ENTITES: Record<string, string> = { "&#x27;": "'", "&apos;": "'", "&quot;": '"', "&amp;": "&", "&lt;": "<", "&gt;": ">", "&nbsp;": " " };
const normaliser = (s: string) => s.replace(/[  \s]+/g, " ").trim();
const texteVisible = (html: string) =>
  normaliser(html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;|&quot;|&amp;|&lt;|&gt;|&nbsp;/g, (e) => ENTITES[e]));
const chiffres = (s: string) => (s.match(/\d+/g) ?? []).sort();
const corrige = (s: string) => CORRECTIONS_DE_FRANCAIS.reduce((t, [avant, apres]) => t.replace(avant, apres), s);

const rendre = (emplacement: "creation-bail" | "garanties-bail" = "creation-bail") =>
  renderToStaticMarkup(createElement(ConseilsChoixLocataire, { emplacement }));

// ── 1. Le contenu ─────────────────────────────────────────────────────────

describe("contenu des conseils", () => {
  it("reprend les 12 conseils du fichier de contenu, dans l'ordre, au mot près", () => {
    expect(CONSEILS_CHOIX_LOCATAIRE).toHaveLength(contenu.conseils.length);
    CONSEILS_CHOIX_LOCATAIRE.forEach((c, i) => {
      const source = contenu.conseils[i];
      expect(normaliser(c.titre)).toBe(normaliser(source.titre));
      expect(normaliser(c.conseil)).toBe(normaliser(corrige(source.conseil)));
      expect(c.niveau).toBe(NIVEAU_DU_FICHIER[source.niveau_certitude]);
    });
  });

  it("la mention générale est celle du fichier de contenu", () => {
    expect(normaliser(MENTION_GENERALE_CONSEILS)).toBe(normaliser(contenu.mention_generale));
  });

  it("les corrections de français sont les seules différences, et chacune sert", () => {
    for (const [avant, apres] of CORRECTIONS_DE_FRANCAIS) {
      const sources = contenu.conseils.filter((c) => c.conseil.includes(avant));
      expect(sources).toHaveLength(1);
      expect(chiffres(avant)).toEqual(chiffres(apres));
    }
  });

  it("identifiants uniques ; trois niveaux, tous utilisés ; libellés du fichier de contenu", () => {
    const ids = CONSEILS_CHOIX_LOCATAIRE.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(NIVEAUX_CERTITUDE.map((n) => n.id)).toEqual(["regle-legale", "pratique-courante", "variable-contrat"]);
    for (const n of NIVEAUX_CERTITUDE) {
      expect(CONSEILS_CHOIX_LOCATAIRE.some((c) => c.niveau === n.id)).toBe(true);
    }
    expect(NIVEAUX_CERTITUDE.map((n) => n.libelle.toLowerCase())).toEqual(Object.keys(NIVEAU_DU_FICHIER));
  });

  it("la typographie n'espace pas avant % € : ou ; et ne coupe pas les milliers, sans changer les mots", () => {
    expect(ponctuationFrancaise("entre 33 et 37 % ; jusqu'à 3 000 € : oui")).toBe(
      "entre 33 et 37 % ; jusqu'à 3 000 € : oui"
    );
    expect(normaliser(ponctuationFrancaise("a 37 % b"))).toBe("a 37 % b");
    expect(ponctuationFrancaise("5 novembre 2015, 8 à 12 mois")).toBe("5 novembre 2015, 8 à 12 mois");
  });
});

// ── 2. Le composant ───────────────────────────────────────────────────────

describe("composant « Conseils pour choisir votre locataire »", () => {
  const html = rendre();
  const texte = texteVisible(html);

  const resumeDe = (h: string) => /<summary[^>]*>([\s\S]*?)<\/summary>/.exec(h)?.[1] ?? "";

  it("est replié par défaut : un <details> sans attribut open, dont le premier enfant est le <summary>", () => {
    expect(html).toMatch(/^<details(?![^>]*\sopen\b)[^>]*>\s*<summary/);
    expect(html.match(/<details/g)).toHaveLength(1);
    const resume = resumeDe(html);
    expect(texteVisible(resume)).toContain("Conseils pour choisir votre locataire");
    expect(texteVisible(resume)).toContain("Selon les conditions des assurances loyers impayés");
  });

  it("l'icône et le chevron sont décoratifs (cachés des lecteurs d'écran)", () => {
    const resume = resumeDe(html);
    for (const svg of resume.match(/<svg[^>]*>/g) ?? []) expect(svg).toContain('aria-hidden="true"');
    expect(resume.match(/<svg/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("affiche tous les conseils du fichier de contenu : titre et texte", () => {
    for (const c of contenu.conseils) {
      expect(texte).toContain(normaliser(c.titre));
      expect(texte).toContain(normaliser(corrige(c.conseil)));
    }
    expect(html.match(/<li /g)).toHaveLength(contenu.conseils.length);
  });

  it("groupe les conseils par niveau, dans l'ordre : règle légale, pratique courante, variable selon le contrat", () => {
    const groupes = html.split('role="group"').slice(1);
    expect(groupes).toHaveLength(3);
    const niveaux = groupes.map((g) => /aria-labelledby="[^"]*-(regle-legale|pratique-courante|variable-contrat)"/.exec(g)?.[1]);
    expect(niveaux).toEqual(["regle-legale", "pratique-courante", "variable-contrat"]);

    groupes.forEach((groupe, i) => {
      const attendu = NIVEAUX_CERTITUDE[i];
      // Chaque groupe porte un libellé clair de son niveau, nommé pour les lecteurs d'écran.
      expect(texteVisible(groupe)).toContain(attendu.libelle);
      const idNiveau = /aria-labelledby="([^"]+)"/.exec(groupe)?.[1] ?? "";
      expect(html).toContain(`id="${idNiveau}"`);
      // Et seulement les conseils de ce niveau.
      for (const c of contenu.conseils) {
        const place = NIVEAU_DU_FICHIER[c.niveau_certitude] === attendu.id;
        expect(texteVisible(groupe).includes(normaliser(c.titre))).toBe(place);
      }
    });
  });

  it("répartition du fichier de contenu : 5 règles légales, 1 pratique courante, 6 variables selon le contrat", () => {
    const par = (n: NiveauCertitude) => CONSEILS_CHOIX_LOCATAIRE.filter((c) => c.niveau === n).length;
    expect([par("regle-legale"), par("pratique-courante"), par("variable-contrat")]).toEqual([5, 1, 6]);
  });

  it("termine par la mention générale, après le dernier conseil", () => {
    const apres = html.slice(html.lastIndexOf("</ul>"));
    expect(texteVisible(apres)).toContain(normaliser(contenu.mention_generale));
    expect(apres).toContain('role="note"');
    expect(texte.indexOf(normaliser(contenu.mention_generale))).toBeGreaterThan(texte.indexOf("Colocation : anticipez"));
  });

  it("n'ajoute aucune valeur chiffrée par rapport au fichier de contenu", () => {
    const attendu = chiffres([contenu.mention_generale, ...contenu.conseils.flatMap((c) => [c.titre, corrige(c.conseil)])].join(" "));
    expect(chiffres(texte)).toEqual(attendu);
    // Les mêmes seuils, rien de plus : 33 et 37 %, 3 000 €, 4 mois, 12 mois…
    expect(attendu.length).toBeGreaterThan(10);
  });

  it("ne note ni ne juge personne : ni champ, ni bouton, ni zone mise à jour en direct", () => {
    expect(html).not.toMatch(/<(input|button|form|select|textarea|progress|meter)\b/);
    expect(html).not.toContain("aria-live");
    expect(texte).not.toMatch(/\b(score|verdict|noté|notation)\b/i);
    expect(texte).toContain("Ils ne notent aucun candidat");
  });

  it("n'embarque aucune couleur en dur ni style en ligne", () => {
    expect(html).not.toMatch(/style="|#[0-9a-f]{3,8}\b/i);
  });

  it("garde des identifiants distincts selon l'emplacement, pour pouvoir figurer deux fois sur un écran", () => {
    const a = rendre("creation-bail");
    const b = rendre("garanties-bail");
    const ids = (h: string) => [...h.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids(a).filter((id) => ids(b).includes(id))).toEqual([]);
    expect(a).toContain('data-conseils-locataire="creation-bail"');
    expect(b).toContain('data-conseils-locataire="garanties-bail"');
    // Le texte, lui, est le même : un composant unique, générique.
    expect(texteVisible(a)).toBe(texteVisible(b));
  });
});

// ── 3. L'étape « Personnes » du bail en préparation ───────────────────────

const ADHESIONS = {
  proprietaire: { role: "proprietaire_direct", type: "proprietaire_direct" },
  adminAgence: { role: "admin_agence", type: "agence" },
  agent: { role: "agent", type: "agence" },
} as const;

function adhesion({ role, type }: { role: string; type: string }) {
  return {
    role,
    organisation: { id: "org-1", name: "Organisation de test", status: "actif", type, essai_fin: null, logo_url: null, couleur_primaire: null, couleur_secondaire: null, nom_portail: null },
  };
}

async function etapePersonnes() {
  const element = await EtapePersonnesBail({ orgId: "org-1", bailId: "bail-1", lotId: "lot-1", principalId: null, colocation: false });
  return renderToStaticMarkup(element);
}

describe("étape « Personnes » du bail en préparation (là où le locataire est choisi)", () => {
  beforeEach(() => {
    banc.adhesion = null;
    banc.superAdmin = false;
  });

  it("le propriétaire en gestion directe voit le bloc replié, une seule fois, dans la section du locataire", async () => {
    banc.adhesion = adhesion(ADHESIONS.proprietaire);
    const html = await etapePersonnes();
    expect(html.match(/data-conseils-locataire="creation-bail"/g)).toHaveLength(1);
    expect(html).not.toContain('data-conseils-locataire="garanties-bail"');
    expect(html).toMatch(/<details[^>]*data-conseils-locataire="creation-bail"(?![^>]*\sopen\b)[^>]*>/);

    // Entre l'en-tête de la section du locataire et la section des garants.
    const locataire = html.indexOf('aria-labelledby="titre-locataires-bail"');
    const garants = html.indexOf('aria-labelledby="titre-garants-bail"');
    const proprietaires = html.indexOf('aria-labelledby="titre-proprietaires-bail"');
    const bloc = html.indexOf('data-conseils-locataire="creation-bail"');
    expect(proprietaires).toBeGreaterThan(-1);
    expect(locataire).toBeGreaterThan(proprietaires);
    expect(bloc).toBeGreaterThan(locataire);
    expect(bloc).toBeLessThan(garants);
    // Le bouton « Choisir un locataire » est toujours là : rien n'est retiré.
    expect(texteVisible(html)).toContain("Choisir un locataire");
  });

  it("l'administrateur d'une agence ne voit rien", async () => {
    banc.adhesion = adhesion(ADHESIONS.adminAgence);
    const html = await etapePersonnes();
    expect(html).not.toContain("data-conseils-locataire");
    expect(html).not.toContain("Conseils pour choisir votre locataire");
    expect(texteVisible(html)).toContain("Choisir un locataire");
  });

  it("l'agent d'une agence ne voit rien", async () => {
    banc.adhesion = adhesion(ADHESIONS.agent);
    const html = await etapePersonnes();
    expect(html).not.toContain("data-conseils-locataire");
    expect(html).not.toContain("Conseils pour choisir votre locataire");
  });

  it("un locataire ou un artisan n'entre pas dans l'espace du bail : la garde l'écarte avant tout rendu", async () => {
    // Un locataire n'a pas de rôle de gérant : la garde le renvoie vers ses espaces.
    banc.adhesion = adhesion({ role: "locataire", type: "proprietaire_direct" });
    await expect(etapePersonnes()).rejects.toThrow("redirect:/espaces");
    banc.adhesion = adhesion({ role: "artisan", type: "agence" });
    await expect(etapePersonnes()).rejects.toThrow("redirect:/espaces");
  });
});

// ── 4. Gardes de source ───────────────────────────────────────────────────

const SRC = path.resolve(__dirname, "../src");
const sources = (dossier: string): string[] =>
  readdirSync(dossier).flatMap((nom) => {
    const chemin = path.join(dossier, nom);
    return statSync(chemin).isDirectory() ? sources(chemin) : /\.(ts|tsx)$/.test(nom) ? [chemin] : [];
  });
const lire = (chemin: string) => readFileSync(chemin, "utf8");

describe("gardes de source", () => {
  const importeurs = sources(SRC).filter((f) => /conseils-choix-locataire["']/.test(lire(f)));
  const relatif = (f: string) => path.relative(SRC, f).split(path.sep).join("/");

  it("seules l'étape « Personnes » et la fiche du bail importent le composant", () => {
    expect(importeurs.map(relatif).sort()).toEqual([
      "app/agence/[orgId]/baux/[bailId]/etape-personnes-bail.tsx",
      "app/agence/[orgId]/baux/[bailId]/page.tsx",
    ]);
  });

  it("ni l'espace locataire, ni l'espace artisan, ni le site public ne l'importent", () => {
    for (const dossier of ["app/locataire", "app/artisan", "app/(public)", "app/outils", "app/journal"]) {
      const chemin = path.join(SRC, dossier);
      try {
        statSync(chemin);
      } catch {
        continue;
      }
      for (const f of sources(chemin)) {
        expect(lire(f), relatif(f)).not.toMatch(/conseils-choix-locataire|conseils-locataire["']/);
      }
    }
    expect(lire(path.join(SRC, "components/nav-locataire.tsx"))).not.toMatch(/conseils/i);
  });

  it("le propriétaire est reconnu par le drapeau commun `estProprietaire`, jamais par un nom d'organisation", () => {
    const etape = lire(path.join(SRC, "app/agence/[orgId]/baux/[bailId]/etape-personnes-bail.tsx"));
    expect(etape).toMatch(/estProprietaire\s*\?\s*<ConseilsChoixLocataire emplacement="creation-bail"/);
    const page = lire(path.join(SRC, "app/agence/[orgId]/baux/[bailId]/page.tsx"));
    expect(page).toMatch(/estProprietaire\s*\?\s*<ConseilsChoixLocataire emplacement="garanties-bail"/);
  });

  it("le nouveau code ne lit aucun montant : ni Number() ni parseFloat()", () => {
    for (const f of ["lib/conseils-locataire.ts", "components/conseils-choix-locataire.tsx"]) {
      expect(lire(path.join(SRC, f)), f).not.toMatch(/\b(Number|parseFloat|parseInt)\s*\(/);
    }
  });

  it("la feuille de style n'utilise que les jetons de la charte : aucune couleur en dur", () => {
    const css = lire(path.join(SRC, "components/conseils-choix-locataire.module.css"));
    const sansCommentaires = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(sansCommentaires).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
  });

  it("le bloc plie en mobile sans largeur fixe : aucune largeur en pixels sur le conteneur", () => {
    const css = lire(path.join(SRC, "components/conseils-choix-locataire.module.css"));
    const bloc = /\.conseils\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(bloc).toMatch(/min-width:\s*0/);
    expect(bloc).not.toMatch(/(^|[^-])width:\s*\d+px/);
  });
});
