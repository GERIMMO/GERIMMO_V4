/**
 * Un faux fournisseur d'e-mail, pour les tests d'envoi (décision D47).
 *
 * Il remplace `fetch` : aucun appel réel ne part. Il reproduit ce dont les
 * tests ont besoin chez le vrai service :
 *  - une clé d'idempotence (en-tête `Idempotency-Key`) déjà vue avec le même
 *    contenu rend la réponse du premier envoi, sans envoyer de second message ;
 *  - la même clé avec un contenu différent est refusée (409) ;
 *  - une clé n'est retenue que pendant `conservationMs` (24 h par défaut), sur
 *    l'horloge du faux, que les tests font avancer avec `avancer()`. Passé ce
 *    délai, la clé est oubliée : le même message repartirait une seconde fois ;
 *  - le fournisseur peut devenir muet : il garde ou non le message, puis ne
 *    répond plus. Comme le vrai `fetch`, l'appel ne se termine alors que si
 *    l'appelant a posé un délai maximal (`signal`) ; il échoue avec la raison
 *    de ce signal (`TimeoutError`).
 *
 * LES 24 H SONT UNE HYPOTHÈSE, pas une mesure : elles viennent d'un simple
 * commentaire de `lib/rapports-mensuels.ts`, la documentation du prestataire
 * n'a pas été consultée et le comportement réel du service n'a pas été rejoué
 * (ni la durée de conservation, ni le refus 409 d'une clé réutilisée avec un
 * autre contenu). Le faux sert à montrer la CONSÉQUENCE de la limite — les
 * tâches tournent une fois par jour, la reprise d'un envoi non marqué arrive à
 * environ 24 h, pile au bord de la fenêtre — pas à la garantir.
 */
export type MessageAccepte = { id: string; cle: string | null; to: string[]; subject: string };
export type ModeFournisseur = "normal" | "muet" | "accepte-puis-muet";
export type AppelFournisseur = { cle: string | null; avecDelai: boolean };

/** La conservation d'une clé supposée chez le service : 24 heures. */
export const CONSERVATION_CLE_MS = 24 * 3_600_000;

export function fauxFournisseurEmail(options: { conservationMs?: number } = {}) {
  const conservationMs = options.conservationMs ?? CONSERVATION_CLE_MS;
  const acceptes: MessageAccepte[] = [];
  const appels: AppelFournisseur[] = [];
  const parCle = new Map<string, { corps: string; id: string; vuLe: number }>();
  const etat = { mode: "normal" as ModeFournisseur, numero: 0, horloge: 0 };

  /** Ne répond jamais : seul le délai maximal de l'appelant y met fin. */
  function silence(signal: AbortSignal | null | undefined): Promise<Response> {
    return new Promise<Response>((_, rejeter) => {
      if (!signal) {
        // Un appelant sans délai maximal resterait suspendu jusqu'à la coupure
        // de la fonction : le test le dit tout de suite plutôt que d'attendre.
        setTimeout(() => rejeter(new Error("APPEL SANS DÉLAI MAXIMAL : le fournisseur muet n'a jamais répondu")), 300);
        return;
      }
      if (signal.aborted) return rejeter(signal.reason);
      signal.addEventListener("abort", () => rejeter(signal.reason), { once: true });
    });
  }

  async function appeler(_url: unknown, init: RequestInit = {}): Promise<Response> {
    const cle = new Headers(init.headers).get("Idempotency-Key");
    appels.push({ cle, avecDelai: Boolean(init.signal) });
    const corps = String(init.body ?? "");

    if (cle && parCle.has(cle) && etat.horloge - parCle.get(cle)!.vuLe > conservationMs) {
      // La clé est oubliée : ce qui suit est un tout premier envoi pour le service.
      parCle.delete(cle);
    }
    if (cle && parCle.has(cle)) {
      const vu = parCle.get(cle)!;
      if (vu.corps !== corps) return new Response(JSON.stringify({ name: "invalid_idempotent_request" }), { status: 409 });
      return new Response(JSON.stringify({ id: vu.id }), { status: 200 });
    }
    if (etat.mode === "muet") return silence(init.signal);

    const envoye = JSON.parse(corps) as { to?: string[]; subject?: string };
    const id = `message-${++etat.numero}`;
    acceptes.push({ id, cle, to: envoye.to ?? [], subject: envoye.subject ?? "" });
    if (cle) parCle.set(cle, { corps, id, vuLe: etat.horloge });
    if (etat.mode === "accepte-puis-muet") return silence(init.signal);
    return new Response(JSON.stringify({ id }), { status: 200 });
  }

  return {
    fetch: appeler,
    acceptes,
    appels,
    definirMode(mode: ModeFournisseur) {
      etat.mode = mode;
    },
    /** Fait passer du temps chez le service (en millisecondes) : les clés trop anciennes sont oubliées. */
    avancer(ms: number) {
      etat.horloge += ms;
    },
    /** Les clés reçues, dans l'ordre des appels (sans les appels sans clé). */
    cles: () => appels.map((a) => a.cle).filter((c): c is string => c !== null),
  };
}
