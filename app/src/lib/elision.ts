// L'élision du « de » devant une voyelle ou un « h » muet : « d’octobre », « d’Éloïse », mais « de septembre ».
//
// Audit du 13/10/2026 (LOC-02, PRO2-11, PROP-05) : « Dernier document — quittance de octobre 2026 »,
// « Loyer de octobre à régler », « Parc de Éloïse … ». Le « h » est traité comme muet : c'est le cas courant
// (« d’hiver », « d’Hélène ») ; les rares « h » aspirés (« de Hugo ») demandent une saisie propre.

const VOYELLE_INITIALE = /^[aeiouyàâäæéèêëîïôöœùûüÿh]/i;

/** « de » + mot, avec élision : deElide("octobre 2026") → « d’octobre 2026 ». */
export function deElide(mot: string): string {
  const m = mot.trim();
  return VOYELLE_INITIALE.test(m) ? `d’${m}` : `de ${m}`;
}
