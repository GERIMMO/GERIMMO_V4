/** Garde serveur : ni un formulaire ni un en-tête HTTP ne peuvent la lever. */
export function paiementsInterdits(env:Record<string,string|undefined>=process.env):boolean {
 return env.GERIMMO_PILOTE_LIMITE!=='false'||env.GERIMMO_PAIEMENTS_DESACTIVES==='1'||env.GERIMMO_PREPRODUCTION_VALIDEE==='1';
}
export const MESSAGE_PAIEMENT_PILOTE='Opération payante suspendue dans cet environnement pilote. Aucun paiement ni service externe déclenché.';
export function exigerOperationsPayantesAutorisees():void {
 if(paiementsInterdits())throw new Error(MESSAGE_PAIEMENT_PILOTE);
}
