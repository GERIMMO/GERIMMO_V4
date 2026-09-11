/**
 * L'adaptateur Stripe, sans toucher à Stripe.
 *
 * Ce qui est testé ici est ce qui décide TOUT SEUL : faut-il tenter un appel,
 * que dire quand il échoue, où lire la fin de période. Le reste — créer une
 * session, ouvrir le portail — n'est qu'un passe-plat vers une API tierce, et
 * un test qui simule cette API ne vérifierait que la simulation.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  configurationStripe,
  finDePeriode,
  lireErreurStripe,
  quantiteFacturee,
} from "@/lib/stripe";

const VARIABLES = ["STRIPE_SECRET_KEY", "STRIPE_PRIX_BIEN", "STRIPE_WEBHOOK_SECRET"] as const;
const initial = Object.fromEntries(VARIABLES.map((v) => [v, process.env[v]]));

afterEach(() => {
  for (const v of VARIABLES) {
    if (initial[v] === undefined) delete process.env[v];
    else process.env[v] = initial[v];
  }
});

function poser(valeurs: Partial<Record<(typeof VARIABLES)[number], string | undefined>>) {
  for (const v of VARIABLES) {
    const x = valeurs[v];
    if (x === undefined) delete process.env[v];
    else process.env[v] = x;
  }
}

describe("Réglages : rien ne marche à moitié", () => {
  it("sans aucune variable, l'adaptateur dit lesquelles manquent", () => {
    poser({});
    const r = configurationStripe();
    expect(r.pret).toBe(false);
    if (r.pret) return;
    // Le motif est écrit pour être LU par un humain qui doit les poser :
    // « la facturation n'est pas configurée » n'aide personne à la configurer.
    for (const v of VARIABLES) expect(r.motif).toContain(v);
  });

  it("une seule variable manquante suffit à refuser, et elle est nommée", () => {
    poser({
      STRIPE_SECRET_KEY: "sk_test_x",
      STRIPE_PRIX_BIEN: "price_x",
      STRIPE_WEBHOOK_SECRET: undefined,
    });
    const r = configurationStripe();
    expect(r.pret).toBe(false);
    if (r.pret) return;
    expect(r.motif).toContain("STRIPE_WEBHOOK_SECRET");
    expect(r.motif).toContain("est absente");
    expect(r.motif).not.toContain("STRIPE_SECRET_KEY");
  });

  it("une variable vide ou blanche vaut absente", () => {
    // Une variable posée à «   » dans un tableau de bord est une variable
    // qu'on a cru poser. La traiter comme présente ferait échouer l'appel
    // chez Stripe, avec un message d'API au lieu d'une consigne.
    poser({
      STRIPE_SECRET_KEY: "   ",
      STRIPE_PRIX_BIEN: "price_x",
      STRIPE_WEBHOOK_SECRET: "whsec_x",
    });
    const r = configurationStripe();
    expect(r.pret).toBe(false);
  });

  it("les trois posées, la configuration est prête et débarrassée des espaces", () => {
    poser({
      STRIPE_SECRET_KEY: " sk_test_x ",
      STRIPE_PRIX_BIEN: "price_x\n",
      STRIPE_WEBHOOK_SECRET: "whsec_x",
    });
    const r = configurationStripe();
    expect(r.pret).toBe(true);
    if (!r.pret) return;
    expect(r.config.cle).toBe("sk_test_x");
    expect(r.config.prixBien).toBe("price_x");
  });
});

describe("Les refus de Stripe, dits à un gérant", () => {
  function erreurStripe(type: string, message: string): Error {
    const e = new Error(message);
    (e as Error & { type: string }).type = type;
    return e;
  }

  it("une panne réseau dit que rien n'a été prélevé", () => {
    const m = lireErreurStripe(erreurStripe("StripeConnectionError", "socket hang up"));
    expect(m).toContain("Rien n'a été prélevé");
    expect(m).not.toContain("socket");
  });

  it("une clé refusée oriente vers la bonne variable, et vers le bon mode", () => {
    const m = lireErreurStripe(erreurStripe("StripeAuthenticationError", "Invalid API Key"));
    expect(m).toContain("STRIPE_SECRET_KEY");
    expect(m).toContain("test");
  });

  it("un tarif inconnu ne parle pas de « price » mais de la variable à corriger", () => {
    const m = lireErreurStripe(new Error("No such price: 'price_zzz'"));
    expect(m).toContain("STRIPE_PRIX_BIEN");
  });

  it("le mélange test / réel est nommé : c'est la faute la plus fréquente", () => {
    const m = lireErreurStripe(
      new Error("a similar object exists in live mode, but a test mode key was used")
    );
    expect(m).toContain("test / réel");
  });

  it("un refus qu'on ne connaît pas garde son message d'origine", () => {
    // Inventer une phrase rassurante sur une erreur qu'on ne comprend pas,
    // c'est empêcher de la comprendre.
    const m = lireErreurStripe(new Error("Quelque chose d'inédit"));
    expect(m).toBe("Quelque chose d'inédit");
  });

  it("ce qui n'est pas une erreur ne fait pas tomber l'écran", () => {
    expect(lireErreurStripe("chaîne nue")).toContain("n'a pas répondu");
    expect(lireErreurStripe(undefined)).toContain("n'a pas répondu");
  });
});

describe("Lire une souscription, quelle que soit la version d'API", () => {
  const auSecond = 1_793_000_000;

  it("la fin de période se lit sur la ligne de facturation", () => {
    const s = { items: { data: [{ current_period_end: auSecond, quantity: 3 }] } };
    expect(finDePeriode(s as never)).toBe(new Date(auSecond * 1000).toISOString());
    expect(quantiteFacturee(s as never)).toBe(3);
  });

  it("à défaut, sur la souscription elle-même (versions antérieures)", () => {
    const s = { items: { data: [{ quantity: 1 }] }, current_period_end: auSecond };
    expect(finDePeriode(s as never)).toBe(new Date(auSecond * 1000).toISOString());
  });

  it("une souscription sans ligne ne rend ni date ni quantité inventée", () => {
    const s = { items: { data: [] } };
    expect(finDePeriode(s as never)).toBeNull();
    // Zéro, pas « une par défaut » : facturer une unité qu'on n'a pas lue
    // serait prélever au hasard.
    expect(quantiteFacturee(s as never)).toBe(0);
  });
});
