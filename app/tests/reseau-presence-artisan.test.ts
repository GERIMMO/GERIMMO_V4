/**
 * Décision du dirigeant du 23/10/2026 (migration 20261023180000) : le réseau d'artisans suit la zone et les métiers
 * choisis par l'artisan. Sans base :
 *  - `presenceReseau` dit à l'artisan ce qui lui manque pour être proposé (mêmes conditions que `reseau_artisan_eligible`) ;
 *  - `zonesCouvrant` (pré-filtre de l'écran de couverture) donne exactement les zones que `zoneCouvre` accepte ;
 *  - plus aucun état « fermée » côté écran, et la supervision n'a plus d'action d'ouverture ni de rattachement.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { messageDisponibilite, presenceReseau, rappelPresenceReseau, statutCandidat, voieDeSortieAffichee, type FichePresenceReseau } from "@/lib/reseau";
import { zoneCouvre, zonesCouvrant } from "@/lib/zone-artisan";

const fiche = (partiel: Partial<FichePresenceReseau> = {}): FichePresenceReseau => ({
  statut_plateforme: "valide",
  siret_etat: "verifie",
  visibilite: "publique",
  metiers: ["plomberie"],
  codes_postaux: ["91"],
  ...partiel,
});

describe("Suis-je proposé dans le réseau ?", () => {
  it("validé, SIRET vérifié, public, un métier et une zone : proposé", () => {
    const p = presenceReseau(fiche());
    expect(p.propose).toBe(true);
    expect(p.conditions.map((c) => c.cle)).toEqual(["validation", "siret", "public", "metier", "zone"]);
    expect(p.conditions.every((c) => c.remplie)).toBe(true);
  });

  it.each([
    ["validation", { statut_plateforme: "en_attente" }],
    ["validation", { statut_plateforme: "refuse" }],
    ["siret", { siret_etat: "non_verifie" }],
    ["public", { visibilite: "privee" }],
    ["metier", { metiers: [] }],
    ["metier", { metiers: null }],
    ["zone", { codes_postaux: [] }],
    ["zone", { codes_postaux: null }],
  ] as const)("il manque « %s » : pas proposé, et seule cette condition est à faire", (cle, partiel) => {
    const p = presenceReseau(fiche(partiel as Partial<FichePresenceReseau>));
    expect(p.propose).toBe(false);
    expect(p.conditions.filter((c) => !c.remplie).map((c) => c.cle)).toEqual([cle]);
  });

  it("validé mais privé : l'aide dit que la validation ne rend pas le profil public", () => {
    const publique = presenceReseau(fiche({ visibilite: "privee" })).conditions.find((c) => c.cle === "public")!;
    expect(publique.aide).toContain("La validation ne rend pas votre profil public");
  });

  it("un refus renvoie au motif, une attente à la relecture de Gerimmo", () => {
    expect(presenceReseau(fiche({ statut_plateforme: "refuse" })).conditions[0].aide).toContain("refusée");
    expect(presenceReseau(fiche({ statut_plateforme: "en_attente" })).conditions[0].aide).toContain("relit");
  });

  it("exclu du réseau par Gerimmo (liste noire globale) : pas proposé, même validé et public (relecture du 23/10, M-2)", () => {
    const p = presenceReseau(fiche(), true);
    expect(p.propose).toBe(false);
    expect(p.conditions.filter((c) => !c.remplie).map((c) => c.cle)).toEqual(["exclusion"]);
    expect(presenceReseau(fiche(), false).conditions.map((c) => c.cle)).not.toContain("exclusion");
  });
});

describe("Le rappel de « Aujourd'hui » (relecture du 23/10, M-1)", () => {
  it("proposé : aucun rappel", () => {
    expect(rappelPresenceReseau(presenceReseau(fiche()))).toBeNull();
  });
  it("seulement privé : un repère informatif, sans reproche (rester privé est un choix)", () => {
    const r = rappelPresenceReseau(presenceReseau(fiche({ visibilite: "privee" })))!;
    expect(r.ton).toBe("information");
    expect(r.texte).toMatch(/^Votre profil est privé : seuls les clients qui vous ont ajouté à leur carnet/);
  });
  it("autre manque : « Il vous manque : … », une formule par condition, Gerimmo et SIRET écrits comme il se doit", () => {
    const r = rappelPresenceReseau(presenceReseau(fiche({ statut_plateforme: "en_attente", siret_etat: "non_verifie", visibilite: "privee" })))!;
    expect(r.ton).toBe("avertissement");
    expect(r.texte).toBe("Vous n’êtes pas encore proposé dans le réseau Gerimmo. Il vous manque : la validation de votre inscription par Gerimmo ; la vérification de votre SIRET par Gerimmo ; un profil public.");
    expect(rappelPresenceReseau(presenceReseau(fiche(), true))!.texte).toContain("la levée de votre exclusion du réseau par Gerimmo");
  });
});

describe("zonesCouvrant : le pré-filtre de la couverture suit exactement zoneCouvre", () => {
  // Un échantillon de chaque forme de code postal : métropole, Paris, Corse du Sud et Haute-Corse, outre-mer, « 20 ».
  const codes = ["91300", "75011", "01000", "20000", "20090", "20200", "20600", "97400", "97100", "97600", "98000", "06000"];
  const zones = [...Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0")), "2A", "2B", "971", "972", "973", "974", "975", "976"];
  it.each(codes)("%s", (cp) => {
    const candidates = zonesCouvrant(cp);
    for (const z of [...zones, cp]) expect(candidates.includes(z), `${z} pour ${cp}`).toBe(zoneCouvre(z, cp));
  });
});

describe("écrans : plus d'état « fermée », plus de décision d'ouverture", () => {
  const lire = (chemin: string) => readFileSync(resolve(__dirname, "..", chemin), "utf8");

  it("sans artisan proposé : message d'absence, voie de sortie pour un propriétaire sans carnet", () => {
    const d = { metier: "plomberie", nature: "entretien_courant", etat: "sans_artisan" as const, commune_code: "75056", commune_nom: "Paris", nb_artisans: 0, nb_contacts: 0, interet_enregistre: false };
    expect(messageDisponibilite(d)).toMatch(/^Aucun artisan du réseau/);
    expect(voieDeSortieAffichee(d, true)).toBe(true);
    expect(messageDisponibilite({ ...d, etat: "ouverte", nb_artisans: 2 })).toBe("2 artisans du réseau disponibles pour ce métier et ces travaux à Paris.");
  });

  it("un artisan qui remplit tout est « proposé dans sa zone »", () => {
    expect(statutCandidat({ id: "a", raison_sociale: "A", statut_plateforme: "valide", siret_etat: "verifie", visibilite: "publique", account_id: "c", blacklist_globale_le: null })).toBe("Proposé dans sa zone");
  });

  it("ni l'écran de couverture ni les actions n'ouvrent ou ne rattachent plus rien", () => {
    const actions = lire("src/app/actions/reseau.ts");
    expect(actions).not.toMatch(/reseau_regler_ouverture|reseau_rattacher_artisan/);
    const page = lire("src/app/admin/couverture/page.tsx") + lire("src/app/admin/couverture/tableau-couverture.tsx");
    expect(page).not.toMatch(/reseau_artisan_communes|<form[^>]*action=\{/);
    expect(page).toContain("Aucune ouverture n’est à décider");
  });

  it("aucun texte d'écran ne parle encore de commune « ouverte au réseau » ou « fermée »", () => {
    for (const chemin of [
      "src/components/disponibilite-reseau.tsx",
      "src/app/agence/[orgId]/artisans/carnet-proprietaire.tsx",
      "src/app/agence/[orgId]/artisans/page.tsx",
      "src/app/admin/artisans/page.tsx",
      "src/app/artisan/entreprise/page.tsx",
      "src/app/page.tsx",
    ]) {
      const source = lire(chemin);
      expect(source, chemin).not.toMatch(/ouverte au réseau|pas encore disponible pour ce métier|commune fermée|s’ouvre progressivement|décidez des zones à ouvrir|Gerimmo confirme vos communes/);
    }
  });

  it("l'artisan voit dans « Mon entreprise » s'il est proposé, et l'agence ne peut plus modifier la zone d'un artisan qui a son compte", () => {
    expect(lire("src/app/artisan/entreprise/page.tsx")).toContain("<PresenceReseau fiche={fiche} exclu={exclu}/>");
    const pane = lire("src/app/agence/[orgId]/artisans/pane-artisan.tsx");
    expect(pane).toMatch(/profil\.account_id \|\| desactive \|\| enBlacklist \? \(/);
    expect(pane).toContain("lui appartiennent : il les met à jour depuis son espace Gerimmo");
  });
});
