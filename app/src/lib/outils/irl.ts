// OUTIL GRATUIT — RÉVISION DU LOYER SELON L'IRL (29/09).
//
// nouveau loyer = loyer × IRL nouveau ÷ IRL de référence, arrondi au centime
// (article 17-1 I de la loi n° 89-462 du 6 juillet 1989).
//
// AUCUNE TABLE D'INDICES ICI. Les valeurs de l'IRL sont publiées par l'Insee
// chaque trimestre ; nous ne pouvons pas les vérifier depuis le code, et un
// indice faux donnerait un loyer faux imprimé sur une lettre. L'utilisateur
// saisit les deux indices et leurs trimestres ; la page renvoie vers la série
// officielle de l'Insee.
//
// Les mentions reprennent celles du modèle de lettre de l'application
// (src/lib/documents/modeles/revision-irl.ts).

import { arrondiCentime, formaterNombre } from "./nombres";

/** La série officielle de l'IRL sur le site de l'Insee. */
export const URL_SERIE_INSEE_IRL = "https://www.insee.fr/fr/statistiques/serie/001515333";

export type NumeroTrimestre = 1 | 2 | 3 | 4;
export type Trimestre = { trimestre: NumeroTrimestre; annee: number };

/**
 * Ce que l'utilisateur a saisi (ou ce que l'Insee publie pour SA date). Tout peut manquer : un trimestre est `null`
 * tant que son trimestre ET son année ne sont pas choisis (décision du dirigeant du 25/11/2026 : aucun champ n'est
 * prérempli, le calcul ne part jamais d'une valeur que l'utilisateur n'a pas saisie).
 */
export type EntreeIrl = {
  loyer: number | null;
  indiceReference: number | null;
  trimestreReference: Trimestre | null;
  indiceNouveau: number | null;
  trimestreNouveau: Trimestre | null;
  /** Les deux indices ont été tapés par l'utilisateur (saisie manuelle) : le garde-fou de saisie s'applique. */
  indicesSaisis?: boolean;
};

/**
 * Garde-fou de saisie de l'application, repris tel quel (Q72) : `reviser_loyer` refuse une révision quand le rapport
 * entre le nouvel indice et l'indice de référence sort de la plage de 0,8 à 1,25, bornes comprises (migration
 * 20261124150000, « vérifiez les indices saisis » ; plage en attente de la réponse du dirigeant, Q71 : la changer ici
 * avec la base). CE N'EST PAS UNE RÈGLE DE DROIT : la plage, large, n'arrête que les fautes de frappe (un indice dix fois
 * trop petit, une virgule oubliée). Il ne vaut que pour des indices tapés : ceux que l'outil lit lui-même chez l'Insee
 * n'en sont pas.
 */
export const RAPPORT_INDICES_MIN = 0.8;
export const RAPPORT_INDICES_MAX = 1.25;

export type AlerteIrl = {
  code: "trimestres-differents" | "plus-d-un-an" | "indice-en-baisse" | "ordre-des-indices" | "indices-invraisemblables";
  gravite: "erreur" | "attention";
  message: string;
};

export type ResultatIrl =
  | { ok: false; manque: string[]; alertes: AlerteIrl[] }
  | {
      ok: true;
      nouveauLoyer: number;
      /** Nouveau loyer − ancien loyer, au centime. */
      ecart: number;
      /** Variation de l'indice, en fraction (0,0115 = 1,15 %). */
      variation: number;
      alertes: AlerteIrl[];
    };

/** « T2 2026 ». */
export function libelleTrimestre(t: Trimestre): string {
  return `T${t.trimestre} ${t.annee}`;
}

/** Nombre de trimestres qui séparent deux trimestres (positif si `b` est après `a`). */
export function ecartEnTrimestres(a: Trimestre, b: Trimestre): number {
  return b.annee * 4 + b.trimestre - (a.annee * 4 + a.trimestre);
}

/** Les alertes qui ne dépendent que des trimestres et des indices (celles des trimestres, une fois les deux saisis). */
export function alertesIrl(e: EntreeIrl): AlerteIrl[] {
  const alertes: AlerteIrl[] = [];
  const tRef = e.trimestreReference;
  const tNouv = e.trimestreNouveau;
  const ecart = tRef && tNouv ? ecartEnTrimestres(tRef, tNouv) : null;
  if (tRef && tNouv && ecart != null && ecart <= 0) {
    alertes.push({
      code: "ordre-des-indices",
      gravite: "erreur",
      message: `Le nouvel indice (${libelleTrimestre(tNouv)}) doit être postérieur à l'indice de référence (${libelleTrimestre(tRef)}).`,
    });
  }
  if (tRef && tNouv && tRef.trimestre !== tNouv.trimestre) {
    alertes.push({
      code: "trimestres-differents",
      gravite: "attention",
      message:
        "Les deux indices ne portent pas sur le même trimestre. La révision se calcule sur le trimestre fixé au bail : le nouvel indice est celui du même trimestre, un an plus tard.",
    });
  }
  if (ecart != null && ecart > 4) {
    alertes.push({
      code: "plus-d-un-an",
      gravite: "attention",
      message:
        "Plus d'un an sépare les deux indices. Une révision oubliée ne se rattrape pas : le bailleur dispose d'un an à compter de la date anniversaire pour la demander, passé ce délai il est réputé y avoir renoncé pour l'année écoulée. Demandée en retard (dans l'année), elle prend effet à la date de la demande, sans rétroactivité (article 17-1 I de la loi du 6 juillet 1989, rédaction issue de la loi ALUR du 24 mars 2014). Le nouvel indice est celui de la dernière année seulement ; l'indice de référence, celui de la dernière révision appliquée.",
    });
  }
  if (e.indiceReference != null && e.indiceNouveau != null && e.indiceNouveau < e.indiceReference) {
    alertes.push({
      code: "indice-en-baisse",
      gravite: "attention",
      message:
        "Le nouvel indice est inférieur à l'indice de référence : appliquée, la révision fait baisser le loyer. Vérifiez les deux valeurs sur le site de l'Insee.",
    });
  }
  return alertes;
}

export function calculerRevisionIrl(e: EntreeIrl): ResultatIrl {
  const alertes = alertesIrl(e);
  const manque: string[] = [];
  if (e.loyer == null || e.loyer <= 0) manque.push("le loyer hors charges actuel");
  if (e.trimestreReference == null) manque.push("le trimestre et l'année de l'indice de référence");
  if (e.indiceReference == null || e.indiceReference <= 0) manque.push("l'indice de référence");
  if (e.trimestreNouveau == null) manque.push("le trimestre et l'année du nouvel indice");
  if (e.indiceNouveau == null || e.indiceNouveau <= 0) manque.push("le nouvel indice");
  if (manque.length > 0 || e.loyer == null || e.indiceReference == null || e.indiceNouveau == null) {
    return { ok: false, manque, alertes };
  }
  // Rien ne manque, mais des indices tapés hors de la plage du garde-fou ne donnent ni loyer ni lettre, comme dans
  // l'application.
  const rapport = e.indiceNouveau / e.indiceReference;
  if (e.indicesSaisis && !(rapport >= RAPPORT_INDICES_MIN && rapport <= RAPPORT_INDICES_MAX)) {
    alertes.push({
      code: "indices-invraisemblables",
      gravite: "erreur",
      message: `Révision refusée : vérifiez les indices saisis. Le nouvel indice (${formaterNombre(e.indiceNouveau)}) et l'indice de référence (${formaterNombre(e.indiceReference)}) doivent être deux nombres positifs proches l'un de l'autre.`,
    });
    return { ok: false, manque, alertes };
  }
  const nouveauLoyer = arrondiCentime((e.loyer * e.indiceNouveau) / e.indiceReference);
  return {
    ok: true,
    nouveauLoyer,
    ecart: arrondiCentime(nouveauLoyer - e.loyer),
    variation: (e.indiceNouveau - e.indiceReference) / e.indiceReference,
    alertes,
  };
}

// Plus d'exemple prérempli (décision du dirigeant du 25/11/2026). `EXEMPLE_IRL` portait un loyer (850 €) et deux
// trimestres (T2 2025 → T2 2026), après en avoir porté les deux indices (défauts E054 = E167) : l'écran les affichait
// comme une saisie. Un exemple ne se montre plus qu'en texte indicatif, dans un champ vide (calculateur-irl.tsx).
