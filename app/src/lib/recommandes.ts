import type { SuiviAr24 } from "./ar24";

export type RecommandePrepare = {
 id: string; organization_id: string; bail_id: string; personne_id: string;
 environnement: "sandbox" | "production"; expediteur_id: number; tarif_ttc_centimes: number;
 destinataire: { email: string; prenom: string; nom: string };
 contenu: string; empreinte: string; dette: { total_centimes: number; echeances: unknown[] }; delai: number;
 statut: "prepare" | "en_cours" | SuiviAr24["etat"]; ar24_id: number | null;
 preuves: SuiviAr24["preuves"]; cree_le: string; actualise_le: string;
 echec_definitif_confirme_le?: string | null; remplace_id?: string | null;
};
export const ETATS_RECOMMANDE: Record<RecommandePrepare["statut"],string> = {
 prepare: "À relire avant envoi", en_cours: "Envoi à vérifier", a_authentifier: "Brouillon AR24 à authentifier",
 en_attente: "Pris en charge par AR24", envoye: "Envoyé", recu: "Reçu par le destinataire",
 refuse: "Refusé par le destinataire", non_reclame: "Non réclamé", echec: "Échec signalé par AR24", a_verifier: "Envoi à vérifier",
};
/** Extrait le corps du modèle existant. Seul un petit sous-ensemble HTML sans attribut ni ressource
 * est transmis ; la même chaîne est relue à l'écran, signée par empreinte et envoyée à AR24. */
export function contenuLettreAr24(html: string) {
 const corps = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1] ?? html;
 return corps.replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (balise,nom: string) => {
   if(!["p","div","span","h1","h2","h3","h4","table","thead","tbody","tr","th","td","ul","ol","li","strong","em","b","i","br"].includes(nom.toLowerCase())) return "";
   return `<${balise.startsWith("</")?"/":""}${nom.toLowerCase()}>`;
  }).trim();
}
