/**
 * Un faux fournisseur d'e-mail, pour les tests d'envoi (décision D47).
 *
 * Il remplace `fetch` : aucun appel réel ne part. Il reproduit ce dont les
 * tests ont besoin chez le vrai service :
 *  - une clé d'idempotence (en-tête `Idempotency-Key`) déjà vue avec le même
 *    contenu rend la réponse du premier envoi, sans envoyer de second message ;
 *  - la même clé avec un contenu différent est refusée (409) ;
 *  - le fournisseur peut devenir muet : il garde ou non le message, puis ne
 *    répond plus. Comme le vrai `fetch`, l'appel ne se termine alors que si
 *    l'appelant a posé un délai maximal (`signal`) ; il échoue avec la raison
 *    de ce signal (`TimeoutError`).
 *
 * La durée de conservation des clés (24 h chez le vrai service) n'est pas
 * simulée : elle se lit dans les risques résiduels du lot, pas dans ce faux.
 */
export type MessageAccepte = { id: string; cle: string | null; to: string[]; subject: string };
export type ModeFournisseur = "normal" | "muet" | "accepte-puis-muet";
export type AppelFournisseur = { cle: string | null; avecDelai: boolean };

export function fauxFournisseurEmail() {
  const acceptes: MessageAccepte[] = [];
  const appels: AppelFournisseur[] = [];
  const parCle = new Map<string, { corps: string; id: string }>();
  const etat = { mode: "normal" as ModeFournisseur, numero: 0 };

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

    if (cle && parCle.has(cle)) {
      const vu = parCle.get(cle)!;
      if (vu.corps !== corps) return new Response(JSON.stringify({ name: "invalid_idempotent_request" }), { status: 409 });
      return new Response(JSON.stringify({ id: vu.id }), { status: 200 });
    }
    if (etat.mode === "muet") return silence(init.signal);

    const envoye = JSON.parse(corps) as { to?: string[]; subject?: string };
    const id = `message-${++etat.numero}`;
    acceptes.push({ id, cle, to: envoye.to ?? [], subject: envoye.subject ?? "" });
    if (cle) parCle.set(cle, { corps, id });
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
    /** Les clés reçues, dans l'ordre des appels (sans les appels sans clé). */
    cles: () => appels.map((a) => a.cle).filter((c): c is string => c !== null),
  };
}
