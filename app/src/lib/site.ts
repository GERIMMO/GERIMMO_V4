// L'ADRESSE PUBLIQUE DU PRODUIT — une seule source, partout.
//
// POURQUOI CE FICHIER EXISTE (12/09). `gerimmo.app` était écrit EN DUR à trois
// endroits : l'expéditeur des e-mails, le pied de page de tous les PDF générés,
// et le lien de secours de la relance de paiement. Tant que le domaine n'était
// pas branché, le produit IMPRIMAIT donc une adresse morte sur des baux, des
// quittances et des rapports de gestion — des documents contractuels qui
// partent chez des locataires et des propriétaires.
//
// Le domaine est acquis depuis le 12/09 ; la constante reste néanmoins une
// mauvaise idée. Une adresse de déploiement change (sous-domaine, préproduction,
// changement de marque), et trois constantes changent alors à trois rythmes
// différents. Elles lisent désormais toutes la même variable.
//
// L'ORDRE DE PRÉFÉRENCE. `NEXT_PUBLIC_SITE_URL` d'abord : c'est la seule valeur
// que quelqu'un a choisie. À défaut, l'adresse que Vercel se donne à lui-même,
// qui est juste mais laide. À défaut encore, `null` — et l'appelant décide s'il
// vaut mieux un lien mort ou pas de lien du tout. (Il vaut mieux pas de lien.)

/** L'adresse complète, sans barre oblique finale. `null` si rien n'est posé. */
export function adresseDuSite(): string | null {
  const explicite = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicite) return explicite.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercel ? `https://${vercel}` : null;
}

/**
 * Le domaine seul, tel qu'on l'IMPRIME — sans protocole ni chemin.
 *
 * Le pied de page d'un bail n'est pas cliquable : « https:// » y est du bruit,
 * et « gerimmo.app » se recopie dans un navigateur. À défaut de configuration,
 * on rend la marque plutôt que rien : un document sans adresse du tout ne dit
 * plus d'où il vient.
 */
export function domaineDuSite(): string {
  const adresse = adresseDuSite();
  if (!adresse) return "gerimmo.app";
  try {
    return new URL(adresse).host;
  } catch {
    // Une valeur mal formée ne doit pas faire tomber la génération d'un bail.
    return adresse.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
}

/**
 * L'origine à laquelle RENVOYER quelqu'un après un détour externe (Stripe).
 *
 * ICI, L'EN-TÊTE DE LA REQUÊTE PRIME — et c'est l'inverse de `adresseDuSite()`.
 * La différence n'est pas un détail de style : elle décide où retombe un client
 * qui vient de payer.
 *
 * Un e-mail envoyé par une tâche planifiée n'a aucune requête : il ne peut que
 * lire la configuration. Un paiement, lui, part d'un écran — et l'écran sait
 * d'où il vient. Renvoyer vers la configuration ramènerait en PRODUCTION
 * quelqu'un qui payait depuis une préproduction, ce que le commentaire de
 * `origineDeLaRequete` promettait d'éviter depuis le début pendant que le code
 * faisait le contraire (relevé du 12/09, en branchant le domaine). La
 * configuration reste le filet, pour le cas où aucun en-tête d'hôte n'arrive.
 */
export function origineDeRetour(hote: string | null, protocole: string | null): string | null {
  if (!hote) return adresseDuSite();
  const schema = protocole ?? (hote.startsWith("localhost") ? "http" : "https");
  return `${schema}://${hote}`;
}
