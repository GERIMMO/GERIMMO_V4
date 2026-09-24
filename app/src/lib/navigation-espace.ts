// LA NAVIGATION DES ESPACES — les règles, sans écran.
//
// PRINCIPE (refonte v4, 19/09) : même accès qu'avant, nouvel ordre, nouveaux
// noms. Rien de ce qu'un rôle pouvait atteindre ne disparaît ; ce qui change,
// c'est ce qui est mis en avant. Les entrées principales sont celles que le
// porteur du projet a nommées (agenda et statistiques ajoutés le 24/09 : un
// clic de trop dans « Plus »), et un groupe « Plus » replié pour le reste.
//
// CE QUE CE MODULE PRÉSERVE, décision par décision :
//  · l'agent ne voit ni Comptabilité ni Documents dans son menu (12/09) : il
//    ne pose qu'une question, « qu'est-ce que j'ai sur CE lot ? », et la
//    fenêtre du lot y répond ;
//  · « Mon abonnement » et « Administration » n'apparaissent qu'au responsable ;
//  · le propriétaire direct garde son vocabulaire (« Mes lots », « Locataires &
//    garants ») et sa FAQ.
//
// Les BADGES ne disent que ce qui attend un geste, et ne sont rouges que si
// quelque chose est critique : une pastille rouge permanente n'alerte plus.

export type RoleEspace = "admin_agence" | "agent" | "proprietaire_direct";

export type EntreeNav = {
  href: string;
  libelle: string;
  icone: string;
  /** L'entrée ne s'allume que sur son chemin exact (l'accueil). */
  exact?: boolean;
  /** Le mot qui tient sous une icône de barre basse ; le nom accessible reste `libelle`. */
  court?: string;
  /** Nombre d'éléments qui attendent un geste ; 0 = pas de pastille. */
  badge?: number;
  /** La pastille passe au rouge : au moins un élément est critique. */
  critique?: boolean;
};

export type NavigationEspace = {
  /** Neuf au plus, toujours visibles. */
  principales: EntreeNav[];
  /** Le reste, sous « Plus » : accessible, pas mis en avant. */
  secondaires: EntreeNav[];
  /** Les quatre de la barre basse du téléphone, choisies par rôle. */
  barreBasse: EntreeNav[];
};

export type BadgesEspace = {
  incidents?: number;
  alertes?: number;
  alertesCritiques?: number;
  messages?: number;
};

export function navigationEspace({
  orgId,
  role,
  badges = {},
}: {
  orgId: string;
  role: RoleEspace;
  badges?: BadgesEspace;
}): NavigationEspace {
  const base = `/agence/${orgId}`;
  const b = {
    incidents: badges.incidents ?? 0,
    alertes: badges.alertes ?? 0,
    critiques: badges.alertesCritiques ?? 0,
    messages: badges.messages ?? 0,
  };

  const tableauDeBord: EntreeNav = { href: base, libelle: "Tableau de bord", icone: "maison", exact: true, court: "Accueil" };
  const incidents: EntreeNav = { href: `${base}/incidents`, libelle: "Incidents", icone: "outil", badge: b.incidents };
  // « Alertes » mène à ce qui attend un geste — c'est ce que compte la
  // pastille. L'agenda a sa propre entrée, dans « Plus » : l'annoncer ici
  // promettait un écran que ce lien n'ouvre pas.
  const alertes: EntreeNav = {
    href: `${base}/alertes`,
    libelle: "Alertes",
    icone: "cloche",
    badge: b.alertes,
    critique: b.critiques > 0,
  };
  const agenda: EntreeNav = { href: `${base}/agenda`, libelle: "Agenda", icone: "agenda" };
  const messages: EntreeNav = { href: `${base}/messages`, libelle: "Messages", icone: "bulle", badge: b.messages };
  const parametres: EntreeNav = { href: `${base}/profil`, libelle: "Paramètres", icone: "roue" };
  const statistiques: EntreeNav = { href: `${base}/statistiques`, libelle: "Statistiques", icone: "stats" };
  const documents: EntreeNav = { href: `${base}/documents`, libelle: "Documents", icone: "doc" };
  const abonnement: EntreeNav = { href: `${base}/abonnement`, libelle: "Abonnement", icone: "carte" };
  // Le carnet d'artisans : la page s'ouvre à tout rôle de l'espace (l'agent la
  // lit, seul le responsable désactive) — elle n'était atteignable que par URL.
  const artisans: EntreeNav = { href: `${base}/artisans`, libelle: "Carnet d'artisans", icone: "outil" };
  const loyers: EntreeNav = { href: `${base}/loyers`, libelle: "Loyers & charges", icone: "euro", court: "Loyers" };

  if (role === "proprietaire_direct") {
    const lots: EntreeNav = { href: `${base}/parc`, libelle: "Mes lots", icone: "cle", court: "Lots" };
    return {
      principales: [
        tableauDeBord,
        lots,
        { href: `${base}/personnes`, libelle: "Locataires & garants", icone: "gens", court: "Locataires" },
        loyers,
        incidents,
        alertes,
        agenda,
        messages,
        parametres,
      ],
      secondaires: [
        { href: `${base}/comptabilite`, libelle: "Livre recettes-dépenses", icone: "livre" },
        { href: `${base}/comptabilite/fiscal`, libelle: "Fiscalité", icone: "livre" },
        documents,
        abonnement,
        { href: `${base}/faq`, libelle: "Aide", icone: "quest" },
      ],
      barreBasse: [tableauDeBord, lots, loyers, alertes],
    };
  }

  if (role === "agent") {
    const portefeuille: EntreeNav = { href: `${base}/parc`, libelle: "Mon portefeuille", icone: "parc", court: "Portefeuille" };
    return {
      principales: [
        tableauDeBord,
        portefeuille,
        { href: `${base}/personnes`, libelle: "Personnes", icone: "gens" },
        incidents,
        alertes,
        agenda,
        statistiques,
        messages,
        // Les paramètres d'un agent, ce sont ceux de SON compte (mot de passe,
        // second facteur) : le profil de l'agence, il ne le modifie pas. Il
        // reste lisible dans « Plus ».
        { href: "/compte", libelle: "Paramètres", icone: "roue" },
      ],
      secondaires: [
        artisans,
        { href: `${base}/profil`, libelle: "Profil de l'agence", icone: "cles" },
      ],
      barreBasse: [tableauDeBord, portefeuille, incidents, alertes],
    };
  }

  const parc: EntreeNav = { href: `${base}/parc`, libelle: "Parc de l'agence", icone: "parc", court: "Parc" };

  return {
    principales: [
      tableauDeBord,
      parc,
      { href: `${base}/personnes`, libelle: "Personnes", icone: "gens" },
      loyers,
      incidents,
      // « Comptabilité & fiscalité » du brief : la fiscalité (récapitulatif 2044)
      // n'existe que pour le propriétaire direct — l'entrée pointait sur une 404
      // pour l'agence (audit du 20/09).
      { href: `${base}/comptabilite`, libelle: "Comptabilité", icone: "livre" },
      alertes,
      // Agenda et statistiques sortent de « Plus » (retour du porteur, 24/09) :
      // un clic de trop pour deux écrans consultés tous les jours.
      agenda,
      statistiques,
      messages,
      parametres,
    ],
    secondaires: [
      { href: `${base}/mandats`, libelle: "Mandats & rapports", icone: "mallette" },
      artisans,
      documents,
      abonnement,
      { href: `${base}/administration`, libelle: "Administration", icone: "cles" },
    ],
    barreBasse: [tableauDeBord, parc, loyers, alertes],
  };
}

/** L'entrée qui répond à un chemin : la plus précise l'emporte. */
export function entreeActive(entrees: EntreeNav[], chemin: string): EntreeNav | null {
  let meilleure: EntreeNav | null = null;
  for (const e of entrees) {
    const touche = e.exact ? chemin === e.href : chemin === e.href || chemin.startsWith(`${e.href}/`);
    if (touche && (!meilleure || e.href.length > meilleure.href.length)) meilleure = e;
  }
  return meilleure;
}

/**
 * Les quatre entrées de la barre basse d'un téléphone : les plus fréquentes,
 * pas les premières — choisies par rôle, alertes comprises (sa pastille est la
 * seule à dire qu'un geste attend). Le reste passe par le tiroir « Menu ».
 */
export function entreesBarreBasse(nav: NavigationEspace): EntreeNav[] {
  return nav.barreBasse;
}
