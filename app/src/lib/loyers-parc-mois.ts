export type MontantsLoyer = {
  attendu: number;
  recu: number;
  compense: number;
  resteDu: number;
};

type MontantsTerme = {
  montant_du: number | string;
  montant_couvert: number | string;
  montant_compense?: number | string;
};

function centimes(montant: number | string): number {
  if (typeof montant === "string" && !montant.trim()) return NaN;
  const valeur = Number(montant);
  return valeur >= 0 ? Math.round(valeur * 100) : NaN;
}

/** Le SQL impute les encaissements par terme. Une compensation ne peut venir que d'une imputation distincte déjà enregistrée. */
export function ventilerLoyers(lignes: ReadonlyArray<MontantsTerme>): MontantsLoyer | null {
  let attendu = 0;
  let recu = 0;
  let compense = 0;
  for (const ligne of lignes) {
    const du = centimes(ligne.montant_du);
    const verse = centimes(ligne.montant_couvert);
    const credit = centimes(ligne.montant_compense ?? 0);
    if (![du, verse, credit].every(Number.isSafeInteger)) return null;
    const partRecue = Math.min(du, verse);
    // Une échéance ne peut être couverte au-delà de son dû ni absorber le découvert d'une autre.
    attendu += du;
    recu += partRecue;
    compense += Math.min(du - partRecue, credit);
    if (!Number.isSafeInteger(attendu)) return null;
  }
  return { attendu: attendu / 100, recu: recu / 100, compense: compense / 100, resteDu: (attendu - recu - compense) / 100 };
}

/** Projection gardée pour les tuiles historiques de l'agence et du parc. */
export function resumerLoyersParcMois(lignes: ReadonlyArray<MontantsTerme>) {
  const ventilation = ventilerLoyers(lignes);
  return ventilation && { attendu: ventilation.attendu, encaisse: ventilation.recu };
}
