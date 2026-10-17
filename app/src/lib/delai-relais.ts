/** Échéance absolue commune aux lectures, réservations et envois du relais. */
export class DelaiRelaisDepasse extends Error {
  constructor() {
    super("Le délai du passage du relais est écoulé.");
    this.name = "DelaiRelaisDepasse";
  }
}

/**
 * Interrompt l’attente et le transport PostgREST quand il le permet. Une mutation déjà reçue par la base
 * peut avoir abouti : les réservations sont reprises par leurs clés existantes, jamais rejouées ici.
 */
export async function attendreRelais<T>(
  operation: () => PromiseLike<T>,
  echeance: number | undefined,
  horloge: () => number = Date.now
): Promise<T> {
  if (echeance === undefined) return await operation();
  const restant = Math.floor(echeance - horloge());
  if (restant <= 0) throw new DelaiRelaisDepasse();
  const controle = new AbortController();
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  const delai = new Promise<never>((_, rejeter) => {
    minuterie = setTimeout(() => {
      controle.abort();
      rejeter(new DelaiRelaisDepasse());
    }, restant);
  });
  try {
    const requete = operation() as PromiseLike<T> & { abortSignal?: (signal: AbortSignal) => PromiseLike<T> };
    const resultat = await Promise.race([requete.abortSignal ? requete.abortSignal(controle.signal) : requete, delai]);
    if (horloge() > echeance) throw new DelaiRelaisDepasse();
    return resultat;
  } finally {
    if (minuterie) clearTimeout(minuterie);
  }
}
