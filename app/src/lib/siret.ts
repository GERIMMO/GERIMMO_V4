// Plausibilité d'un SIRET avant enregistrement (audit final, DOC-09). Quatorze chiffres ne suffisent pas : la clé de Luhn
// détecte la faute de frappe d'un chiffre et l'inversion de deux chiffres voisins. Les établissements de La Poste
// (SIREN 356 000 000) ne suivent pas tous cette clé : on les accepte aussi quand la somme de leurs chiffres est un multiple
// de 5 (règle de numérotation de leurs établissements), plutôt que de refuser un SIRET réel.
// Ce contrôle ne dit pas que l'entreprise existe : la vérification du SIRET par Gerimmo reste à faire.
export function siretPlausible(siret: string): boolean {
  if (!/^\d{14}$/.test(siret) || /^0+$/.test(siret)) return false;
  const chiffres = [...siret].map(Number);
  if (siret.startsWith("356000000") && chiffres.reduce((s, c) => s + c, 0) % 5 === 0) return true;
  const somme = chiffres.reduce((s, c, i) => {
    const v = i % 2 === 0 ? c * 2 : c;
    return s + (v > 9 ? v - 9 : v);
  }, 0);
  return somme % 10 === 0;
}

export const MESSAGE_SIRET_INVALIDE = "Ce SIRET n’est pas valide : vérifiez les quatorze chiffres sur l’avis de situation ou le Kbis.";
