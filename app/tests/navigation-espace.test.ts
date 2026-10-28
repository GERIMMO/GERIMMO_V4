import { describe, expect, it } from "vitest";
import {
  entreeActive,
  entreesBarreBasse,
  navigationEspace,
  type RoleEspace,
} from "@/lib/navigation-espace";

// La refonte v4 change l'ordre et les noms, JAMAIS les accès. Ces tests
// tiennent les décisions d'avant : ce qu'un rôle pouvait atteindre, il le
// peut encore ; ce qu'il ne devait pas voir, il ne le voit toujours pas.
const ORG = "0000-org";
const nav = (role: RoleEspace, badges = {}) => navigationEspace({ orgId: ORG, role, badges });
// Décision D27 : le propriétaire direct navigue sous /espace/<id>, l'agence et ses agents sous /agence/<id>.
const racineDe = (role: RoleEspace) => (role === "proprietaire_direct" ? "/espace" : "/agence");
const chemins = (role: RoleEspace) => {
  const n = nav(role);
  return [...n.principales, ...n.secondaires].map((e) => e.href.replace(`${racineDe(role)}/${ORG}`, "") || "/");
};

describe("La navigation v4 préserve les accès de chaque rôle", () => {
  it("donne onze entrées principales à l'admin d'agence, agenda et statistiques comprises (24/09)", () => {
    const n = nav("admin_agence");
    expect(n.principales).toHaveLength(11);
    expect(n.principales.map((e) => e.libelle)).toEqual([
      "Tableau de bord",
      "Parc de l'agence",
      "Personnes",
      "Loyers & charges",
      "Incidents",
      "Écritures & rapports",
      "Alertes",
      "Agenda",
      "Statistiques",
      "Messages",
      "Profil de l'agence",
    ]);
  });

  it("garde l’agenda pour tous et les statistiques pour les agences", () => {
    for (const role of ["admin_agence", "agent", "proprietaire_direct"] as RoleEspace[]) {
      const n = nav(role);
      const libelles = [...n.principales, ...n.secondaires].map((e) => e.libelle);
      expect(libelles, role).toContain("Agenda");
      if (role !== "proprietaire_direct") expect(libelles, role).toContain("Statistiques");
      else expect(libelles).not.toContain("Statistiques");
    }
  });

  it("ne retire rien à l'admin : mandats, documents, statistiques, abonnement, administration restent atteignables", () => {
    const c = chemins("admin_agence");
    for (const p of ["/loyers", "/comptabilite", "/mandats", "/documents", "/statistiques", "/abonnement", "/administration", "/agenda", "/artisans", "/profil"]) {
      expect(c, p).toContain(p);
    }
  });

  it("allège l'agent comme le 12/09 l'a décidé : ni documents, ni abonnement, ni administration ; la comptabilité seulement sous « Plus »", () => {
    const c = chemins("agent");
    for (const p of ["/comptabilite/fiscal", "/documents", "/abonnement", "/administration", "/mandats"]) {
      expect(c, p).not.toContain(p);
    }
    // Décision du porteur (24/09) : la comptabilité reste hors du menu PRINCIPAL
    // de l'agent, mais « Écritures & rapports » entre dans son groupe « Plus » —
    // son tableau de bord et son fil d'activité l'envoient sur /comptabilite
    // pour valider un rapport de gestion, et la validation n'existe que là.
    const n = nav("agent");
    expect(n.principales.map((e) => e.href)).not.toContain(`/agence/${ORG}/comptabilite`);
    expect(n.secondaires.map((e) => e.href)).toContain(`/agence/${ORG}/comptabilite`);
    expect(entreeActive([...n.principales, ...n.secondaires], `/agence/${ORG}/comptabilite`)?.libelle).toBe(
      "Écritures & rapports"
    );
    expect(n.principales.map((e) => e.libelle)).toContain("Mon portefeuille");
    // Loyers & charges : au menu de l'agent depuis le 24/09 (décision du porteur).
    expect(nav("agent").principales.map((e) => e.libelle)).toContain("Loyers & charges");
    expect(c).toContain("/statistiques");
    // Rien de retiré : le profil de l'agence reste lisible, le carnet
    // d'artisans devient atteignable, et « Paramètres » ouvre son compte.
    expect(c).toContain("/profil");
    expect(c).toContain("/artisans");
    expect(c).toContain("/agenda");
    expect(nav("agent").principales.find((e) => e.libelle === "Mon compte")?.href).toBe("/compte");
    // Audit 27/09 : un même mot ne désigne plus deux écrans selon le rôle.
    expect(nav("agent").principales.map((e) => e.libelle)).not.toContain("Paramètres");
    expect(nav("admin_agence").secondaires.map((e) => e.libelle)).toContain("Mandats & versements");
  });

  it("garde au propriétaire son vocabulaire et sa FAQ", () => {
    const n = nav("proprietaire_direct");
    const libelles = [...n.principales, ...n.secondaires].map((e) => e.libelle);
    expect(libelles).toContain("Biens & locations");
    expect(libelles).toContain("Personnes");
    expect(libelles).toContain("Aide");
    expect(chemins("proprietaire_direct")).not.toContain("/administration");
    // Le carnet d'artisans a son entrée dans « Plus » (24/09) : il n'était
    // atteignable que par le lien de l'en-tête d'Incidents.
    expect(chemins("proprietaire_direct")).toContain("/artisans");
    expect(libelles).toContain("Finances");
    expect(libelles).not.toContain("Fiscalité");
    expect(libelles).not.toContain("Livre recettes-dépenses");
  });

  it("ne pose une pastille que sur ce qui attend, et rouge seulement si c'est critique", () => {
    const calme = nav("admin_agence");
    expect(calme.principales.every((e) => !(e.badge && e.badge > 0))).toBe(true);

    const agitee = nav("admin_agence", { alertes: 3, alertesCritiques: 0, incidents: 2, messages: 1 });
    const alertes = agitee.principales.find((e) => e.libelle === "Alertes")!;
    expect(alertes.badge).toBe(3);
    expect(alertes.critique).toBe(false);

    const critique = nav("admin_agence", { alertes: 3, alertesCritiques: 1 });
    expect(critique.principales.find((e) => e.libelle === "Alertes")!.critique).toBe(true);
  });

  it("retire À faire du propriétaire sur ordinateur et téléphone, sans retirer les alertes des agences", () => {
    const n = nav("proprietaire_direct", { alertes: 3, alertesCritiques: 1 });
    for (const entree of [...n.principales, ...n.secondaires, ...n.barreBasse]) {
      expect(entree.libelle).not.toBe("À faire");
      expect(entree.href).not.toBe(`/espace/${ORG}/alertes`);
    }
    for (const role of ["admin_agence", "agent"] as const) expect(chemins(role)).toContain("/alertes");
  });

  it("allume l'entrée la plus précise, et l'accueil seulement sur son chemin exact", () => {
    const n = nav("admin_agence");
    const toutes = [...n.principales, ...n.secondaires];
    expect(entreeActive(toutes, `/agence/${ORG}`)?.libelle).toBe("Tableau de bord");
    expect(entreeActive(toutes, `/agence/${ORG}/parc/abc/lots/def`)?.libelle).toBe("Parc de l'agence");
    expect(entreeActive(toutes, `/agence/${ORG}/loyers`)?.libelle).toBe("Loyers & charges");
    expect(entreeActive(toutes, `/agence/${ORG}/comptabilite`)?.libelle).toBe("Écritures & rapports");
    expect(entreeActive(toutes, `/agence/${ORG}/profil`)?.libelle).toBe("Profil de l'agence");
    expect(entreeActive(toutes, `/agence/${ORG}/inconnu`)).toBeNull();
  });

  it("met dans la barre basse du téléphone les quatre entrées les plus fréquentes, alertes comprises", () => {
    const libelles = (role: RoleEspace) => entreesBarreBasse(nav(role)).map((e) => e.libelle);
    expect(libelles("admin_agence")).toEqual(["Tableau de bord", "Parc de l'agence", "Loyers & charges", "Alertes"]);
    expect(libelles("agent")).toEqual(["Tableau de bord", "Mon portefeuille", "Incidents", "Alertes"]);
    expect(libelles("proprietaire_direct")).toEqual(["Tableau de bord", "Biens & locations", "Finances", "Incidents"]);
    // La barre basse ne montre que des entrées du menu : aucun chemin qu'elle seule ouvrirait.
    for (const role of ["admin_agence", "agent", "proprietaire_direct"] as RoleEspace[]) {
      const n = nav(role);
      const toutes = [...n.principales, ...n.secondaires];
      for (const e of entreesBarreBasse(n)) expect(toutes).toContain(e);
    }
  });
});

it("la veille apparaît une seule fois et vise le public du profil",()=>{
 for(const role of ['admin_agence','agent','proprietaire_direct'] as RoleEspace[]){
  const entrees=chemins(role).filter(p=>p.startsWith('/veille'));
  if (role === "proprietaire_direct") { expect(entrees).toHaveLength(0); continue; }
  expect(entrees).toHaveLength(1);
  const cible=new URL(entrees[0], 'https://gerimmo.app');
  expect(cible.searchParams.get('public')).toBe('agence');
  expect(cible.searchParams.get('retour')).toBe(`/agence/${ORG}`);
 }
});

it('retrouve une destination filtrée sans confondre sa requête avec le chemin', () => {
  const lien = {href:'/veille?public=bailleur',libelle:'Les règles à connaître',icone:'livre'};
  expect(entreeActive([lien], '/veille')).toBe(lien);
});


it("garde Finances actif dans le livre et la déclaration du propriétaire", () => {
  const n = nav("proprietaire_direct");
  for (const chemin of ["/loyers", "/comptabilite", "/comptabilite/fiscal"]) {
    expect(entreeActive(n.principales, `/agence/${ORG}${chemin}`)?.libelle).toBe("Finances");
  }
});


describe("Décision D27 : le propriétaire direct navigue sous /espace, les agences restent sous /agence", () => {
  const toutesLesEntrees = (role: RoleEspace) => {
    const n = nav(role);
    return [...n.principales, ...n.secondaires, ...n.barreBasse];
  };

  it("chaque entrée du menu du propriétaire direct (principal, « Plus », barre basse) pointe vers /espace/<id>", () => {
    for (const e of toutesLesEntrees("proprietaire_direct")) {
      expect(e.href, e.libelle).toMatch(new RegExp(`^/espace/${ORG}(/|$|\\?|#)`));
      for (const a of e.alias ?? []) expect(a, e.libelle).toMatch(new RegExp(`^/espace/${ORG}`));
    }
  });

  it("aucune entrée de l'agence ou de l'agent ne change d'adresse (hors liens vers les espaces voisins)", () => {
    for (const role of ["admin_agence", "agent"] as RoleEspace[]) {
      for (const e of toutesLesEntrees(role)) {
        if (e.href.startsWith("/compte") || e.href.startsWith("/veille")) continue;
        expect(e.href, `${role} — ${e.libelle}`).toMatch(new RegExp(`^/agence/${ORG}(/|$|\\?|#)`));
      }
      expect(toutesLesEntrees(role).some((e) => e.href.startsWith("/espace")), role).toBe(false);
    }
  });

  it("le tableau de bord du propriétaire est /espace/<id>, et ne s'allume que sur son chemin exact", () => {
    const n = nav("proprietaire_direct");
    const toutes = [...n.principales, ...n.secondaires];
    expect(n.principales[0].href).toBe(`/espace/${ORG}`);
    expect(entreeActive(toutes, `/espace/${ORG}`)?.libelle).toBe("Tableau de bord");
    expect(entreeActive(toutes, `/espace/${ORG}/parc/abc/lots/def`)?.libelle).toBe("Biens & locations");
    expect(entreeActive(toutes, `/espace/${ORG}/inconnu`)).toBeNull();
  });

  it("l'entrée s'allume quelle que soit la racine que le navigateur rapporte (alias ou route réécrite)", () => {
    const n = nav("proprietaire_direct");
    const toutes = [...n.principales, ...n.secondaires];
    for (const racine of ["/espace", "/agence"]) {
      expect(entreeActive(toutes, `${racine}/${ORG}/loyers`)?.libelle, racine).toBe("Finances");
      expect(entreeActive(toutes, `${racine}/${ORG}/comptabilite/fiscal`)?.libelle, racine).toBe("Finances");
      expect(entreeActive(toutes, `${racine}/${ORG}/messages`)?.libelle, racine).toBe("Messages");
    }
    const agence = nav("admin_agence");
    for (const racine of ["/espace", "/agence"]) {
      expect(entreeActive([...agence.principales, ...agence.secondaires], `${racine}/${ORG}/parc`)?.libelle, racine).toBe("Parc de l'agence");
    }
  });
});
