// L'élision du « de » devant une voyelle ou un « h » muet : « d’octobre », « d’Éloïse », mais « de septembre ».
//
// Audit du 13/10/2026 (LOC-02, PRO2-11) puis vérification du 14/10 (VER-TS-03) : « Dernier document — quittance
// de octobre 2026 », « Loyer de octobre à régler », et la même faute dans les courriers, la page Documents du
// locataire, les libellés d'agenda et les PDF. Tout texte qui insère un mois après « de » passe par ici ;
// `tests/elision-courriers.test.ts` balaie les sources pour le rappeler.
//
// Ce fichier ne couvre pas les libellés construits en SQL (PROP-05 : le nom d'espace « Parc de Éloïse » vient de
// la fonction de création du parc) : cette correction-là se fait dans la fonction SQL.
//
// Le « h » est traité comme muet : c'est le cas courant (« d’hiver », « d’Hélène ») ; les rares « h » aspirés
// (« de Hugo ») demandent une saisie propre.

const VOYELLE_INITIALE = /^[aeiouyàâäæéèêëîïôöœùûüÿh]/i;

/**
 * « de » ou « d’ » seul, selon le mot qui suit, pour envelopper ensuite le mot (gras, lien…) sans le toucher :
 * `${particuleDe(mois)}<strong>${mois}</strong>` → « d’<strong>octobre 2026</strong> ».
 */
export function particuleDe(mot: string): "de " | "d’" {
  return VOYELLE_INITIALE.test(mot.trim()) ? "d’" : "de ";
}

/** « de » + mot, avec élision : deElide("octobre 2026") → « d’octobre 2026 ». */
export function deElide(mot: string): string {
  const m = mot.trim();
  return `${particuleDe(m)}${m}`;
}
