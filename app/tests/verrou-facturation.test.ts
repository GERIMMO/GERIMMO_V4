/**
 * Le verrou des gestes de facturation (lib/verrou-facturation.ts) — seconde relecture adverse du 23/10/2026.
 *
 * Constat : le bail (120 s) pouvait expirer avant la fin du geste qu'il protège. Un appel à Stripe pouvait durer
 * environ 240 s (délai par défaut du SDK, 80 s, et deux nouvelles tentatives), une hausse en enchaîne 6 à 10, et rien ne
 * bornait la durée des actions serveur de « Mon abonnement ». Un second onglet reprenait alors le bail expiré pendant
 * que la première hausse tournait encore. Attendu :
 *  - un délai borné pour chaque appel à Stripe (client partagé) ;
 *  - une durée maximale (`maxDuration`) sur la page qui porte les actions, et sur la route de la tâche de nuit ;
 *  - un bail plus long que ces deux bornes ;
 *  - et, quel que soit l'hébergeur, plus AUCUNE écriture chez Stripe lancée sous un verrou dont le délai d'écriture est
 *    passé : la dernière écriture lancée finit avant l'expiration du bail.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DELAI_ECRITURES_SOUS_VERROU_SECONDES,
  DUREE_VERROU_FACTURATION_SECONDES,
  MODIFICATION_EN_COURS,
  VERROU_INDISPONIBLE,
  prendreVerrouFacturation,
} from "@/lib/verrou-facturation";
import {
  DELAI_APPEL_STRIPE_MS,
  EcritureStripeHorsDelai,
  NOUVELLES_TENTATIVES_STRIPE,
  clientStripe,
  lireErreurStripe,
  messageStripePourClient,
} from "@/lib/stripe";

/** La valeur littérale de `export const maxDuration = …` d'un fichier de route (Next la lit sans l'exécuter). */
function maxDurationDe(fichier: string): number {
  const source = readFileSync(fichier, "utf8");
  const trouve = source.match(/export\s+const\s+maxDuration\s*=\s*(\d+)\s*;/);
  expect(trouve, `${fichier} : export const maxDuration absent`).not.toBeNull();
  return Number(trouve![1]);
}

/** Le pire temps d'un seul appel à Stripe : chaque essai jusqu'au délai, plus les pauses du SDK (5 s au plus chacune). */
const PIRE_APPEL_S = (NOUVELLES_TENTATIVES_STRIPE + 1) * (DELAI_APPEL_STRIPE_MS / 1000) + NOUVELLES_TENTATIVES_STRIPE * 5;
/** Marge pour une requête déjà reçue par Stripe quand la fonction est coupée, et pour l'écart d'horloge avec la base. */
const MARGE_S = 60;

describe("les bornes de durée du verrou de facturation", () => {
  it("le client Stripe a un délai borné par appel et deux nouvelles tentatives au plus", () => {
    const stripe = clientStripe({ cle: "sk_test_bornes", secretWebhook: "whsec_x", prix: {} });
    expect(stripe.getApiField("timeout")).toBe(DELAI_APPEL_STRIPE_MS);
    expect(stripe.getMaxNetworkRetries()).toBe(NOUVELLES_TENTATIVES_STRIPE);
    expect(DELAI_APPEL_STRIPE_MS).toBeLessThanOrEqual(30_000);
    expect(NOUVELLES_TENTATIVES_STRIPE).toBeLessThanOrEqual(2);
  });

  it("le bail dépasse la durée maximale de la page « Mon abonnement » (ses actions serveur) et de la route de la tâche de nuit", () => {
    const page = maxDurationDe("src/app/agence/[orgId]/abonnement/page.tsx");
    const nuit = maxDurationDe("src/app/api/cron/equipes/route.ts");
    expect(DUREE_VERROU_FACTURATION_SECONDES).toBeGreaterThanOrEqual(page + MARGE_S);
    expect(DUREE_VERROU_FACTURATION_SECONDES).toBeGreaterThanOrEqual(nuit + MARGE_S);
    // La fonction SQL refuse un bail de plus de 15 min.
    expect(DUREE_VERROU_FACTURATION_SECONDES).toBeLessThanOrEqual(900);
  });

  it("la dernière écriture lancée sous le verrou se termine avant l'expiration du bail, même au pire délai de Stripe", () => {
    expect(DELAI_ECRITURES_SOUS_VERROU_SECONDES + PIRE_APPEL_S + MARGE_S).toBeLessThanOrEqual(DUREE_VERROU_FACTURATION_SECONDES);
    // Un geste ordinaire (quelques appels de moins d'une seconde) n'atteint jamais le délai d'écriture.
    expect(DELAI_ECRITURES_SOUS_VERROU_SECONDES).toBeGreaterThanOrEqual(120);
  });
});

describe("prendreVerrouFacturation", () => {
  afterEach(() => {
    if (vi.isMockFunction(Date.now)) vi.mocked(Date.now).mockRestore();
  });

  const service = (pris: unknown, erreur: string | null = null) => {
    const rpc = vi.fn(async (nom: string, _args?: Record<string, unknown>) => {
      if (nom === "verrou_facturation_prendre") return { data: erreur ? null : pris, error: erreur ? { message: erreur } : null };
      return { data: true, error: null };
    });
    return { rpc };
  };

  it("demande le bail de DUREE_VERROU_FACTURATION_SECONDES, pour l'opération donnée, et le rend par son jeton", async () => {
    const s = service(true);
    const v = await prendreVerrouFacturation(s, "org-1", "echeance");
    expect(v.ok).toBe(true);
    const [, args] = s.rpc.mock.calls[0];
    expect(args).toMatchObject({ p_org: "org-1", p_operation: "echeance", p_duree_secondes: DUREE_VERROU_FACTURATION_SECONDES });
    if (v.ok) await v.rendre();
    expect(s.rpc).toHaveBeenLastCalledWith("verrou_facturation_rendre", { p_org: "org-1", p_jeton: args!.p_jeton });
  });

  it("verrou tenu ou indisponible : le motif est dit, avec la phrase du client", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await prendreVerrouFacturation(service(false), "org-1", "hausse")).toEqual({ ok: false, motif: "tenu", erreur: MODIFICATION_EN_COURS });
    expect(await prendreVerrouFacturation(service(null, "upstream request timeout"), "org-1", "hausse")).toEqual({ ok: false, motif: "indisponible", erreur: VERROU_INDISPONIBLE });
    expect(await prendreVerrouFacturation(null, "org-1", "hausse")).toEqual({ ok: false, motif: "indisponible", erreur: VERROU_INDISPONIBLE });
  });

  it("le client protégé laisse passer lectures et écritures avant le délai, puis refuse toute écriture SANS l'envoyer ; les lectures restent permises", async () => {
    const reel = Date.now.bind(Date);
    let decalage = 0;
    vi.spyOn(Date, "now").mockImplementation(() => reel() + decalage);
    const v = await prendreVerrouFacturation(service(true), "org-1", "hausse");
    if (!v.ok) throw new Error("verrou attendu");
    const appels: string[] = [];
    const brut = {
      subscriptions: {
        retrieve: vi.fn(async () => { appels.push("retrieve"); return { id: "sub_1" }; }),
        update: vi.fn(async () => { appels.push("update"); return { id: "sub_1" }; }),
      },
      subscriptionSchedules: {
        release: vi.fn(async () => { appels.push("release"); return {}; }),
        create: vi.fn(async () => { appels.push("create"); return {}; }),
      },
    };
    const stripe = v.proteger(brut);
    await stripe.subscriptions.retrieve();
    await stripe.subscriptionSchedules.release();
    decalage = (DELAI_ECRITURES_SOUS_VERROU_SECONDES + 1) * 1000;
    await expect(stripe.subscriptions.update()).rejects.toBeInstanceOf(EcritureStripeHorsDelai);
    await expect(stripe.subscriptionSchedules.create()).rejects.toBeInstanceOf(EcritureStripeHorsDelai);
    await stripe.subscriptions.retrieve();
    // Aucune écriture n'est partie après le délai.
    expect(appels).toEqual(["retrieve", "release", "retrieve"]);
  });

  it("le refus d'écriture se lit en français, au client comme au journal", () => {
    const e = new EcritureStripeHorsDelai();
    const phrase = "Notre prestataire de paiement a répondu trop lentement et l'opération a été interrompue avant d'être transmise.";
    expect(messageStripePourClient(e)).toBe(phrase);
    expect(lireErreurStripe(e)).toBe(phrase);
  });
});
