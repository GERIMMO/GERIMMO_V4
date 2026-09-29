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

import { arrondiCentime } from "./nombres";

/** La série officielle de l'IRL sur le site de l'Insee. */
export const URL_SERIE_INSEE_IRL = "https://www.insee.fr/fr/statistiques/serie/001515333";

export type NumeroTrimestre = 1 | 2 | 3 | 4;
export type Trimestre = { trimestre: NumeroTrimestre; annee: number };

export type EntreeIrl = {
  loyer: number | null;
  indiceReference: number | null;
  trimestreReference: Trimestre;
  indiceNouveau: number | null;
  trimestreNouveau: Trimestre;
};

export type AlerteIrl = {
  code: "trimestres-differents" | "plus-d-un-an" | "indice-en-baisse" | "ordre-des-indices";
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

/** Les alertes qui ne dépendent que des trimestres et des indices. */
export function alertesIrl(e: EntreeIrl): AlerteIrl[] {
  const alertes: AlerteIrl[] = [];
  const ecart = ecartEnTrimestres(e.trimestreReference, e.trimestreNouveau);
  if (ecart <= 0) {
    alertes.push({
      code: "ordre-des-indices",
      gravite: "erreur",
      message: `Le nouvel indice (${libelleTrimestre(e.trimestreNouveau)}) doit être postérieur à l'indice de référence (${libelleTrimestre(e.trimestreReference)}).`,
    });
  }
  if (e.trimestreReference.trimestre !== e.trimestreNouveau.trimestre) {
    alertes.push({
      code: "trimestres-differents",
      gravite: "attention",
      message:
        "Les deux indices ne portent pas sur le même trimestre. La révision se calcule sur le trimestre fixé au bail : le nouvel indice est celui du même trimestre, un an plus tard.",
    });
  }
  if (ecart > 4) {
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
  if (e.indiceReference == null || e.indiceReference <= 0) manque.push("l'indice de référence");
  if (e.indiceNouveau == null || e.indiceNouveau <= 0) manque.push("le nouvel indice");
  if (manque.length > 0 || e.loyer == null || e.indiceReference == null || e.indiceNouveau == null) {
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

/** L'exemple pré-rempli de la page (à vérifier sur le site de l'Insee avant tout usage réel). */
export const EXEMPLE_IRL: EntreeIrl = {
  loyer: 850,
  indiceReference: 146.68,
  trimestreReference: { trimestre: 2, annee: 2025 },
  indiceNouveau: 148.37,
  trimestreNouveau: { trimestre: 2, annee: 2026 },
};
