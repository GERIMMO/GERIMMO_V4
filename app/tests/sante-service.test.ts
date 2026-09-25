/**
 * La santé du service (préparation du lancement, 20/09).
 *
 * La tâche des abonnements n'avait jamais tourné en production, et rien ne
 * le disait : elle répond 503 avant tout journal quand Stripe manque. Ces
 * tests gardent la lecture des variables (présence, jamais valeur) et la
 * lecture des passes (à l'heure, en retard, jamais, en échec).
 */
import { describe, expect, it } from "vitest";
import {
  adoptionAutomatique,
  domaineDeLAdresse,
  etatConfiguration,
  etatTaches,
  pointsBloquants,
  resumerBilan,
  TACHES,
} from "../src/lib/sante-service";
import { dernieresTaches } from "../src/lib/tache";

const COMPLET = {
  STRIPE_SECRET_KEY: "sk_live_xxx",
  STRIPE_WEBHOOK_SECRET: "whsec_xxx",
  STRIPE_PRIX_BIEN: "price_1",
  STRIPE_PRIX_LOT_AGENCE: "price_2",
  RESEND_API_KEY: "re_xxx",
  RESEND_EXPEDITEUR: "Gerimmo <no-reply@gerimmo.app>",
  YOUTRUST_API_KEY: "yt_xxx",
  YOUTRUST_ENV: "production",
  YOUTRUST_WEBHOOK_SECRET: "ytwh_xxx",
  CRON_SECRET: "un-secret",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  NEXT_PUBLIC_SITE_URL: "https://gerimmo.app",
};

describe("les variables de production", () => {
  it("un environnement complet ne manque de rien", () => {
    const v = etatConfiguration(COMPLET);
    expect(v.every((x) => x.etat === "ok")).toBe(true);
    // Le domaine se dit ; la valeur, jamais.
    expect(v.find((x) => x.cle === "RESEND_EXPEDITEUR")!.detail).toContain("gerimmo.app");
    expect(JSON.stringify(v)).not.toContain("sk_live_xxx");
    expect(JSON.stringify(v)).not.toContain("un-secret");
  });

  it("nomme chaque variable absente, et rien d'autre", () => {
    const v = etatConfiguration({});
    const manque = v.filter((x) => x.etat === "manque").map((x) => x.cle);
    expect(manque).toEqual([
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_PRIX_BIEN",
      "STRIPE_PRIX_LOT_AGENCE",
      "RESEND_API_KEY",
      "YOUTRUST_API_KEY",
      "YOUTRUST_WEBHOOK_SECRET",
      "CRON_SECRET",
      "SUPABASE_SERVICE_ROLE_KEY",
      "NEXT_PUBLIC_SITE_URL",
    ]);
    // L'expéditeur absent n'est pas un manque : le repli est l'adresse cible.
    expect(v.find((x) => x.cle === "RESEND_EXPEDITEUR")!.etat).toBe("attention");
  });

  it("distingue une clé Stripe de test d'une clé réelle", () => {
    const test = etatConfiguration({ ...COMPLET, STRIPE_SECRET_KEY: "sk_test_abc" });
    expect(test.find((x) => x.cle === "STRIPE_SECRET_KEY")).toMatchObject({
      etat: "attention",
      detail: expect.stringContaining("test"),
    });
  });

  it("refuse l'expéditeur de test de Resend, qui ne livre qu'au titulaire", () => {
    const v = etatConfiguration({ ...COMPLET, RESEND_EXPEDITEUR: "Gerimmo <onboarding@resend.dev>" });
    expect(v.find((x) => x.cle === "RESEND_EXPEDITEUR")!.etat).toBe("manque");
  });

  it.each([
    ["adresse locale", "http://localhost:3000", "manque"],
    ["sans https", "http://gerimmo.app", "attention"],
    ["définitive", "https://gerimmo.app/", "ok"],
  ])("l'adresse du site — %s", (_, url, etat) => {
    const v = etatConfiguration({ ...COMPLET, NEXT_PUBLIC_SITE_URL: url });
    expect(v.find((x) => x.cle === "NEXT_PUBLIC_SITE_URL")!.etat).toBe(etat);
  });

  it("sans adresse posée, le repli Vercel se signale sans bloquer", () => {
    const v = etatConfiguration({
      ...COMPLET,
      NEXT_PUBLIC_SITE_URL: "",
      VERCEL_PROJECT_PRODUCTION_URL: "gerimmo.vercel.app",
    });
    expect(v.find((x) => x.cle === "NEXT_PUBLIC_SITE_URL")).toMatchObject({
      etat: "attention",
      detail: expect.stringContaining("gerimmo.vercel.app"),
    });
  });
});

describe("le domaine d'une adresse", () => {
  it("lit les deux formes", () => {
    expect(domaineDeLAdresse("Gerimmo <no-reply@Gerimmo.app>")).toBe("gerimmo.app");
    expect(domaineDeLAdresse("x@resend.dev")).toBe("resend.dev");
    expect(domaineDeLAdresse("pas une adresse")).toBeNull();
  });
});

describe("les tâches planifiées", () => {
  const maintenant = new Date("2026-09-20T10:00:00.000Z");
  const passe = (nom: string, il_y_a_heures: number, bilan: unknown = { envoyees: 0, echecs: 0 }) => ({
    evenement: `tache_${nom}`,
    details: bilan,
    created_at: new Date(maintenant.getTime() - il_y_a_heures * 3_600_000).toISOString(),
  });

  it("couvre les tâches suivies, y compris la veille", () => {
    expect(TACHES.map((t) => t.nom)).toEqual([
      "orchestrateur",
      "signatures",
      "abonnements",
      "rappels",
      "quittances",
      "appels",
      "relances",
      "veille",
      "marketing",
      "territoire",
    ]);
  });

  it("à l'heure, en retard, jamais, en échec — chacune selon sa dernière passe", () => {
    const lignes = [
      passe("quittances", 3),
      passe("appels", 30),
      passe("rappels", 4, { erreur: "lecture impossible" }),
      passe("territoire", 20 * 24),
    ];
    const etats = Object.fromEntries(
      etatTaches(dernieresTaches(lignes), maintenant).map((t) => [t.nom, t.etat])
    );
    expect(etats).toEqual({
      orchestrateur: "jamais",
      signatures: "jamais",
      quittances: "ok",
      appels: "retard",
      rappels: "echec",
      territoire: "retard", // quotidienne : vingt jours sans collecte est un retard
      abonnements: "jamais",
      relances: "jamais",
      marketing: "jamais",
      veille: "jamais",
    });
  });

  it("signale aussi un bilan qui contient des échecs partiels", () => {
    const lignes = [passe("quittances", 3, { envoyees: 0, echecs: 2 })];
    const quittances = etatTaches(dernieresTaches(lignes), maintenant)
      .find((t) => t.nom === "quittances");
    expect(quittances?.etat).toBe("echec");
  });

  it("résume un bilan en français, sans jargon de clé", () => {
    expect(resumerBilan({ envoyees: 3, echecs: 0, sans_adresse: ["a", "b"] })).toBe(
      "envois réussis : 3, actions à reprendre : 0, adresses manquantes : 2"
    );
    expect(resumerBilan(null)).toBe("—");
    expect(resumerBilan({})).toBe("—");
  });

  it("ne publie aucun texte libre, même sous le nom d'un compteur connu", () => {
    const bilan = resumerBilan({ envoyees: "Bearer secret-prive", facebook: "identifiant-prive",
      constructor: 1, echecs: ["destinataire@prive.fr", "réponse prestataire privée"],
      erreur: "secret de diagnostic", code_inconnu: "secret interne" });
    expect(bilan).toContain("actions à reprendre : 2");
    expect(bilan).toContain("Action à reprendre");
    expect(bilan).not.toMatch(/secret|prive|destinataire|constructor/);
  });

  it("affiche les nouveaux résultats sans déduire une réussite d'un bilan inconnu", () => {
    expect(resumerBilan({ etudiees: 2, sources: 2, traites: 1, rapports_prepares: 3 }))
      .toBe("actualités étudiées : 2, sources consultées : 2, actions réalisées : 1, comptes rendus préparés : 3");
    expect(resumerBilan({ envoyees: "3", echecs: 0, facebook: true })).toBe("envois réussis : 3, actions à reprendre : 0, publication sur Facebook : oui");
    expect(resumerBilan({ inconnu: "termine" })).toBe("Résultat détaillé indisponible");
    expect(resumerBilan({ envoyees: -1, echecs: Infinity, preparees: 1.5 })).toBe("Résultat détaillé indisponible");
    expect(resumerBilan([1, 2])).toBe("—");
  });

  it("garde une difficulté visible même lorsqu'une partie du travail a réussi", () => {
    expect(resumerBilan({ publiees: 1, erreur: "réponse technique à masquer" })).toBe(
      "publications diffusées : 1 · Action à reprendre : ouvrir le dossier concerné pour connaître la difficulté."
    );
  });
});

describe("l'adoption des envois automatiques", () => {
  it("ne compte que les organisations vivantes", () => {
    const a = adoptionAutomatique([
      { status: "active", quittances_envoi_auto: true, appels_envoi_auto: false, relances_envoi_auto: false },
      { status: "essai", quittances_envoi_auto: false, appels_envoi_auto: false, relances_envoi_auto: false },
      { status: "suspendue", quittances_envoi_auto: true, appels_envoi_auto: true, relances_envoi_auto: true },
      { status: "archivee", quittances_envoi_auto: null, appels_envoi_auto: null, relances_envoi_auto: null },
    ]);
    expect(a).toEqual({ vivantes: 2, quittances: 1, appels: 0, relances: 0, toutManuel: 1 });
  });
});

describe("ce qui bloque, en un chiffre", () => {
  it("additionne les manques, les tâches jamais passées ou en échec, et l'éditeur incomplet", () => {
    const config = etatConfiguration({ ...COMPLET, CRON_SECRET: "" });
    const taches = etatTaches({}, new Date());
    expect(pointsBloquants(config, taches, 3)).toBe(1 + TACHES.length + 1);
    expect(pointsBloquants(etatConfiguration(COMPLET), [], 0)).toBe(0);
  });
});
