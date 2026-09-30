/** Une consigne interne ou multi-profils ne devient pas une obligation du locataire. */
export function texteVeillePourPublic(texte:string, publics:string[], publicChoisi:string|null, action:boolean):string {
  if(publicChoisi !== "locataire") return texte;
  if(publics.length > 1 || /\b(?:RPC|SQL|API|migration|implémentation|déploiement|schéma|webhook)\b|calculs? Gerimmo/i.test(texte)) {
    return action
      ? "Consultez les conditions dans la source officielle. Pour savoir si votre logement est concerné, écrivez à votre gestionnaire depuis votre espace."
      : "Cette information peut concerner votre location selon votre situation. La source officielle ci-dessous précise les conditions applicables.";
  }
  return texte;
}
