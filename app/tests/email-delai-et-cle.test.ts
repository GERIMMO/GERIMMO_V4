/**
 * Délai maximal d'appel au service d'e-mail et clé anti-doublon, LIVRÉS
 * ENSEMBLE (décision D47, fiches IA-04 et IA-05).
 *
 * Pourquoi ensemble : un délai qui coupe l'attente d'un envoi pourtant accepté
 * par le service laisse l'objet « non marqué » ; la passe suivante le renvoie.
 * Sans clé, c'est un second e-mail au destinataire. Avec la même clé, le service
 * rend la réponse du premier envoi et n'envoie rien de plus.
 *
 * Aucun appel réel : `fetch` est remplacé par un faux fournisseur
 * (tests/fixtures/faux-fournisseur-email.ts).
 *
 * LA LIMITE : le service ne retient une clé que pendant une durée bornée (24 h,
 * d'après un commentaire de `lib/rapports-mensuels.ts`, non vérifié auprès du
 * prestataire). Les tâches tournent une fois par jour : la reprise d'un envoi
 * non marqué arrive à environ 24 h, au bord de cette fenêtre. Le dernier groupe
 * de tests montre les deux côtés ; le doublon au-delà est un RISQUE RÉSIDUEL
 * connu de la décision D47, que seul un marqueur posé en base avant l'envoi
 * (option différée) supprimerait.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArretSupervision } from "../src/lib/controle-effets";
import { DELAI_MAX_FOURNISSEUR_MS, envoyerEmail } from "../src/lib/email";
import { CONSERVATION_CLE_MS, fauxFournisseurEmail } from "./fixtures/faux-fournisseur-email";

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "cle-de-test");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const courrier = { to: "locataire@exemple.fr", subject: "Votre quittance", html: "<p>Bonjour</p>" };

describe("le délai maximal d'appel (IA-05)", () => {
  it("vaut 15 secondes par défaut et se pose sur l'appel au service", async () => {
    expect(DELAI_MAX_FOURNISSEUR_MS).toBe(15_000);
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
    const minuteur = vi.spyOn(AbortSignal, "timeout");
    const r = await envoyerEmail(courrier);
    expect(r).toEqual({ id: "message-1" });
    expect(minuteur).toHaveBeenCalledWith(15_000);
    expect(fournisseur.appels).toEqual([{ cle: null, avecDelai: true }]);
  });

  it("un service muet rend une erreur claire au lieu de retenir l'appelant", async () => {
    const fournisseur = fauxFournisseurEmail();
    fournisseur.definirMode("muet");
    vi.stubGlobal("fetch", fournisseur.fetch);
    const debut = Date.now();
    const r = await envoyerEmail({ ...courrier, delaiMaxMs: 25 });
    expect(Date.now() - debut).toBeLessThan(2_000);
    expect(r.id).toBeUndefined();
    expect(r.erreur).toBe(
      "Le service d’e-mail n’a pas répondu à temps. L’envoi n’est pas confirmé et a peut-être eu lieu : vérifiez avant de le renvoyer."
    );
    expect(fournisseur.acceptes).toHaveLength(0);
  });

  it("le délai n'avale pas un arrêt de supervision", async () => {
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
    await expect(
      envoyerEmail({
        ...courrier,
        avantEnvoi: async () => {
          throw new ArretSupervision();
        },
      })
    ).rejects.toBeInstanceOf(ArretSupervision);
    expect(fournisseur.appels).toHaveLength(0);
  });

  it("le délai ne court qu'une fois le contrôle d'arrêt passé, pas pendant", async () => {
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
    const ordre: string[] = [];
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
      ordre.push(`délai ${ms}`);
      return new AbortController().signal;
    });
    await envoyerEmail({ ...courrier, avantEnvoi: async () => void ordre.push("contrôle d'arrêt") });
    expect(ordre).toEqual(["contrôle d'arrêt", "délai 15000"]);
  });

  it("un envoi accepté dont le corps de réponse n'arrive pas à temps reste un succès", async () => {
    // Le service a répondu 200 : l'e-mail est accepté. Si le délai tombe en
    // lisant le corps, on ne le transforme pas en échec (il serait renvoyé).
    vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => {
      const corps = new ReadableStream({
        start(controle) {
          init.signal?.addEventListener("abort", () => controle.error(init.signal?.reason), { once: true });
        },
      });
      return new Response(corps, { status: 200 });
    });
    const r = await envoyerEmail({ ...courrier, delaiMaxMs: 25 });
    expect(r.erreur).toBeUndefined();
  });
});

describe("la clé et le délai, ensemble (IA-04 + IA-05)", () => {
  it("avec la même clé, un envoi accepté puis coupé par le délai ne part pas deux fois", async () => {
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);

    // 1re passe : le service accepte le message puis ne répond plus.
    fournisseur.definirMode("accepte-puis-muet");
    const premiere = await envoyerEmail({ ...courrier, cleIdempotence: "quittance/q-1", delaiMaxMs: 25 });
    expect(premiere.erreur).toMatch(/n’a pas répondu à temps/);
    expect(fournisseur.acceptes).toHaveLength(1);

    // 2e passe (l'objet n'a pas été marqué) : même clé, le service répond.
    fournisseur.definirMode("normal");
    const seconde = await envoyerEmail({ ...courrier, cleIdempotence: "quittance/q-1", delaiMaxMs: 25 });
    expect(seconde).toEqual({ id: "message-1" });
    expect(fournisseur.acceptes).toHaveLength(1);
    expect(fournisseur.cles()).toEqual(["quittance/q-1", "quittance/q-1"]);
  });

  it("sans clé, le même scénario enverrait deux e-mails : c'est ce que la clé empêche", async () => {
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
    fournisseur.definirMode("accepte-puis-muet");
    await envoyerEmail({ ...courrier, delaiMaxMs: 25 });
    fournisseur.definirMode("normal");
    await envoyerEmail({ ...courrier, delaiMaxMs: 25 });
    expect(fournisseur.acceptes).toHaveLength(2);
  });

  it("la même clé avec un contenu changé est refusée par le service : erreur rendue, aucun second message", async () => {
    // Le sens sûr : si un message change entre deux essais rapprochés, le service
    // refuse plutôt que d'envoyer deux versions ; la tâche retentera à sa passe suivante.
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
    await envoyerEmail({ ...courrier, cleIdempotence: "relance/b-1" });
    const r = await envoyerEmail({ ...courrier, html: "<p>Montant corrigé</p>", cleIdempotence: "relance/b-1" });
    expect(r.id).toBeUndefined();
    expect(r.erreur).toMatch(/refusé l’envoi/);
    expect(fournisseur.acceptes).toHaveLength(1);
  });

  it("deux objets différents ont deux clés : le second n'est pas pris pour un doublon", async () => {
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
    await envoyerEmail({ ...courrier, cleIdempotence: "quittance/q-1" });
    await envoyerEmail({ ...courrier, subject: "Autre", cleIdempotence: "quittance/q-2" });
    expect(fournisseur.acceptes.map((m) => m.cle)).toEqual(["quittance/q-1", "quittance/q-2"]);
  });
});

describe("la durée de conservation de la clé : les deux côtés de la limite de 24 h", () => {
  it("la limite supposée est de 24 heures", () => {
    expect(CONSERVATION_CLE_MS).toBe(24 * 3_600_000);
  });

  it("reprise avant 24 h (23 h 59 min 58 s) : le service rend la réponse du premier envoi, un seul message", async () => {
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
    fournisseur.definirMode("accepte-puis-muet");
    await envoyerEmail({ ...courrier, cleIdempotence: "quittance/q-1", delaiMaxMs: 25 });
    fournisseur.definirMode("normal");
    fournisseur.avancer(CONSERVATION_CLE_MS - 2_000);
    const reprise = await envoyerEmail({ ...courrier, cleIdempotence: "quittance/q-1" });
    expect(reprise).toEqual({ id: "message-1" });
    expect(fournisseur.acceptes).toHaveLength(1);
  });

  it("RISQUE RÉSIDUEL : reprise après 24 h (24 h et 2 s), la clé est oubliée et le même message repart", async () => {
    const fournisseur = fauxFournisseurEmail();
    vi.stubGlobal("fetch", fournisseur.fetch);
    fournisseur.definirMode("accepte-puis-muet");
    await envoyerEmail({ ...courrier, cleIdempotence: "quittance/q-1", delaiMaxMs: 25 });
    fournisseur.definirMode("normal");
    fournisseur.avancer(CONSERVATION_CLE_MS + 2_000);
    const reprise = await envoyerEmail({ ...courrier, cleIdempotence: "quittance/q-1" });
    expect(reprise).toEqual({ id: "message-2" });
    expect(fournisseur.acceptes).toHaveLength(2);
  });

  it("la durée de conservation est réglable sur le faux (pour tester une autre hypothèse)", async () => {
    const fournisseur = fauxFournisseurEmail({ conservationMs: 60_000 });
    vi.stubGlobal("fetch", fournisseur.fetch);
    await envoyerEmail({ ...courrier, cleIdempotence: "k" });
    fournisseur.avancer(59_000);
    await envoyerEmail({ ...courrier, cleIdempotence: "k" });
    expect(fournisseur.acceptes).toHaveLength(1);
    fournisseur.avancer(2_000);
    await envoyerEmail({ ...courrier, cleIdempotence: "k" });
    expect(fournisseur.acceptes).toHaveLength(2);
  });
});
