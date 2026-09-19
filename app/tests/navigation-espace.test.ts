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
const chemins = (role: RoleEspace) => {
  const n = nav(role);
  return [...n.principales, ...n.secondaires].map((e) => e.href.replace(`/agence/${ORG}`, "") || "/");
};

describe("La navigation v4 préserve les accès de chaque rôle", () => {
  it("donne neuf entrées principales à l'admin d'agence, pas une de plus", () => {
    const n = nav("admin_agence");
    expect(n.principales).toHaveLength(9);
    expect(n.principales.map((e) => e.libelle)).toEqual([
      "Tableau de bord",
      "Parc de l'agence",
      "Personnes",
      "Loyers & charges",
      "Incidents",
      "Comptabilité",
      "Agenda & alertes",
      "Messages",
      "Paramètres",
    ]);
  });

  it("ne retire rien à l'admin : mandats, documents, statistiques, abonnement, administration restent atteignables", () => {
    const c = chemins("admin_agence");
    for (const p of ["/loyers", "/comptabilite", "/mandats", "/documents", "/statistiques", "/abonnement", "/administration", "/agenda"]) {
      expect(c, p).toContain(p);
    }
  });

  it("allège l'agent comme le 12/09 l'a décidé : ni comptabilité, ni documents, ni abonnement, ni administration", () => {
    const c = chemins("agent");
    for (const p of ["/loyers", "/comptabilite", "/comptabilite/fiscal", "/documents", "/abonnement", "/administration", "/mandats"]) {
      expect(c, p).not.toContain(p);
    }
    expect(nav("agent").principales.map((e) => e.libelle)).toContain("Mon portefeuille");
    expect(c).toContain("/statistiques");
  });

  it("garde au propriétaire son vocabulaire et sa FAQ", () => {
    const n = nav("proprietaire_direct");
    const libelles = [...n.principales, ...n.secondaires].map((e) => e.libelle);
    expect(libelles).toContain("Mes lots");
    expect(libelles).toContain("Locataires & garants");
    expect(libelles).toContain("Aide");
    expect(chemins("proprietaire_direct")).not.toContain("/administration");
  });

  it("ne pose une pastille que sur ce qui attend, et rouge seulement si c'est critique", () => {
    const calme = nav("admin_agence");
    expect(calme.principales.every((e) => !(e.badge && e.badge > 0))).toBe(true);

    const agitee = nav("admin_agence", { alertes: 3, alertesCritiques: 0, incidents: 2, messages: 1 });
    const alertes = agitee.principales.find((e) => e.libelle === "Agenda & alertes")!;
    expect(alertes.badge).toBe(3);
    expect(alertes.critique).toBe(false);

    const critique = nav("admin_agence", { alertes: 3, alertesCritiques: 1 });
    expect(critique.principales.find((e) => e.libelle === "Agenda & alertes")!.critique).toBe(true);
  });

  it("allume l'entrée la plus précise, et l'accueil seulement sur son chemin exact", () => {
    const n = nav("admin_agence");
    const toutes = [...n.principales, ...n.secondaires];
    expect(entreeActive(toutes, `/agence/${ORG}`)?.libelle).toBe("Tableau de bord");
    expect(entreeActive(toutes, `/agence/${ORG}/parc/abc/lots/def`)?.libelle).toBe("Parc de l'agence");
    expect(entreeActive(toutes, `/agence/${ORG}/loyers`)?.libelle).toBe("Loyers & charges");
    expect(entreeActive(toutes, `/agence/${ORG}/comptabilite`)?.libelle).toBe("Comptabilité");
    expect(entreeActive(toutes, `/agence/${ORG}/profil`)?.libelle).toBe("Paramètres");
    expect(entreeActive(toutes, `/agence/${ORG}/inconnu`)).toBeNull();
  });

  it("met quatre entrées dans la barre basse du téléphone", () => {
    expect(entreesBarreBasse(nav("admin_agence"))).toHaveLength(4);
    expect(entreesBarreBasse(nav("agent")).map((e) => e.libelle)).toEqual([
      "Tableau de bord",
      "Mon portefeuille",
      "Personnes",
      "Incidents",
    ]);
  });
});
