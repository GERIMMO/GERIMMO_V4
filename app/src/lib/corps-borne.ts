// LA LECTURE BORNÉE D'UN CORPS DE REQUÊTE (audit final du 27/10, COD-14).
//
// Les trois réceptions de webhooks (Resend, Zoho Sign, Stripe) lisent un corps envoyé par un tiers avant d'en vérifier la
// signature : sans plafond, n'importe qui peut faire charger quelques mégaoctets en mémoire par appel. La borne était
// écrite deux fois (transfert du contact, Zoho) et absente de la route Stripe ; elle vit ici, une fois. Elle ne fait pas
// confiance à Content-Length : le flux est compté au fil de la lecture et coupé dès le dépassement.

/** Le plafond des webhooks : un mégaoctet, bien au-delà des événements de quelques kilooctets que Stripe ou Zoho envoient. */
export const LIMITE_CORPS_WEBHOOK = 1_048_576;

/** Lit un flux borné, même si Content-Length est absent ou mensonger. `corps_absent` sans corps, `corps_trop_grand` au-delà. */
export async function lireCorpsBorne(body: ReadableStream<Uint8Array> | null, limite: number): Promise<Buffer> {
  if (!body) throw new Error("corps_absent");
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let taille = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks);
      taille += value.byteLength;
      if (taille > limite) { await reader.cancel(); throw new Error("corps_trop_grand"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
}

/** Content-Length annoncé au-delà de la limite : refus avant toute lecture (le flux n'est même pas ouvert). */
export function corpsAnnonceTropGrand(request: Request, limite: number): boolean {
  return Number(request.headers.get("content-length")) > limite;
}
