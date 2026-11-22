// Rapprocher les crédits d'un relevé de banque des loyers à recevoir (audit palier 1, P2-05).
//
// Ce module PROPOSE, il n'enregistre rien : chaque rapprochement est confirmé par le propriétaire, puis enregistré par
// la fonction de base qui porte déjà les garanties de l'encaissement (le plus ancien loyer d'abord, le reste exact, une
// demande ne compte qu'une fois). Il ne dépend d'aucune API serveur : l'écran le fait tourner sur l'appareil.
//
// Trois principes :
//   1. « sûr » (coché d'avance) seulement si le montant est le reste dû ET que le nom du locataire figure au libellé ;
//   2. tout le reste est montré, expliqué, et laissé décoché ;
//   3. une ligne déjà enregistrée ne se propose pas deux fois (clé de la ligne, puis même bail, même jour, même montant).
import { normaliserTexte, type LigneReleve } from "./releve-bancaire";

/** Un loyer qui reste à recevoir (une ligne de `rappels_loyers_proprietaire`). */
export type AppelOuvert = {
  appelId: string;
  bailId: string;
  lotNom: string;
  locataire: string | null;
  /** Premier jour du mois appelé, AAAA-MM-JJ. */
  periode: string;
  /** Jour d'échéance, AAAA-MM-JJ. */
  echeance: string;
  resteCentimes: number;
};

/** Un règlement déjà enregistré dans Gerimmo. */
export type EncaissementConnu = { bailId: string; centimes: number; date: string; cle: string | null };

export type LigneAvecCle = LigneReleve & { cle: string };

export type StatutPointage =
  /** Montant et nom concordent : coché d'avance. */
  | "sur"
  /** Montant identique, nom non retrouvé (ou date surprenante) : proposé, décoché. */
  | "probable"
  /** Nom retrouvé, montant inférieur au reste : règlement partiel proposé, décoché. */
  | "partiel"
  /** Plusieurs loyers possibles : au propriétaire de dire lequel. */
  | "choix"
  /** Déjà enregistré : rien à faire. */
  | "deja"
  /** Nom retrouvé, montant supérieur au reste : à saisir sur le bail. */
  | "superieur"
  /** Correspond à un loyer dont l'échéance n'est pas arrivée. */
  | "a_venir"
  | "aucun";

export type Candidat = AppelOuvert & {
  /** Le reste attendu AU MOMENT où cette ligne sera enregistrée, si les lignes précédentes du même bail le sont. */
  resteAttenduCentimes: number;
};

export type Proposition = {
  ligne: LigneAvecCle;
  statut: StatutPointage;
  candidats: Candidat[];
  /** Ce que l'écran dit de cette ligne. */
  motif: string;
  /** Position de la ligne du même bail qui doit être enregistrée avant celle-ci (les loyers se soldent du plus ancien au plus récent). */
  apres: number | null;
};

/** Un virement reçu plus de quinze jours avant l'échéance n'est pas « sûr » : il règle peut-être un autre mois. */
const JOURS_AVANT_ECHEANCE = 15;

function joursEntre(debut: string, fin: string): number {
  return Math.round((Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${debut}T00:00:00Z`)) / 86_400_000);
}

/**
 * Le nom du locataire figure-t-il au libellé ? On cherche son nom de famille (le dernier mot de « Prénom Nom ») en mot
 * entier : « MARTIN » ne se retrouve pas dans « MARTINEZ ». Un nom de moins de trois lettres ne prouve rien.
 */
export function nomRetrouve(libelle: string, locataire: string | null): boolean {
  const mots = normaliserTexte(locataire ?? "").split(" ").filter((m) => m.length >= 3);
  if (!mots.length) return false;
  return ` ${normaliserTexte(libelle)} `.includes(` ${mots[mots.length - 1]} `);
}

/** Le mode de règlement que dit le libellé ; « autre » quand il ne dit rien. */
export function modeDepuisLibelle(libelle: string): "virement" | "cheque" | "especes" | "prelevement" | "autre" {
  const texte = ` ${normaliserTexte(libelle)} `;
  if (/ (VIR|VIREMENT|VIRT|SEPA|INST) /.test(texte) && !/ (PRLV|PRELEVEMENT) /.test(texte)) return "virement";
  if (/ (CHEQUE|CHEQUES|CHQ) /.test(texte)) return "cheque";
  if (/ (PRLV|PRELEVEMENT) /.test(texte)) return "prelevement";
  if (/ (ESPECES|ESPECE) /.test(texte)) return "especes";
  return "autre";
}

export const LIBELLES_MODE: Record<ReturnType<typeof modeDepuisLibelle>, string> = {
  virement: "Virement",
  cheque: "Chèque",
  especes: "Espèces",
  prelevement: "Prélèvement",
  autre: "Autre mode",
};

/**
 * La clé d'une ligne de relevé : la même ligne (même jour, même montant, même libellé, même rang parmi ses jumelles)
 * donne toujours la même clé pour un espace. C'est elle qui empêche d'enregistrer deux fois le même virement, même si
 * le relevé est relu un autre jour. Calculée sur l'appareil pour l'affichage, RECALCULÉE par le serveur avant d'écrire.
 */
export async function clePointage(
  orgId: string,
  ligne: Pick<LigneReleve, "date" | "centimes" | "libelle" | "rang">,
): Promise<string> {
  const texte = `pointage-releve/${orgId}/${ligne.date}/${ligne.centimes}/${ligne.rang}/${normaliserTexte(ligne.libelle)}`;
  const octets = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(texte)));
  let h = "";
  for (const o of octets) h += o.toString(16).padStart(2, "0");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export async function avecCles(orgId: string, lignes: LigneReleve[]): Promise<LigneAvecCle[]> {
  return Promise.all(lignes.map(async (l) => ({ ...l, cle: await clePointage(orgId, l) })));
}

const euros = (centimes: number) =>
  `${(centimes / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

const jourFr = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;

export function rapprocher(entree: {
  lignes: LigneAvecCle[];
  appels: AppelOuvert[];
  encaissements: EncaissementConnu[];
  aujourdHui: string;
}): Proposition[] {
  const { lignes, appels, encaissements, aujourdHui } = entree;
  const resultat = new Map<number, Proposition>();
  const poser = (ligne: LigneAvecCle, statut: StatutPointage, motif: string, candidats: Candidat[] = [], apres: number | null = null) =>
    resultat.set(ligne.position, { ligne, statut, candidats, motif, apres });

  // 1. Les lignes dont la clé est déjà celle d'un règlement : enregistrées à partir de ce relevé.
  const clesConnues = new Set(encaissements.map((e) => e.cle).filter((c): c is string => Boolean(c)));
  for (const l of lignes)
    if (clesConnues.has(l.cle)) poser(l, "deja", "Déjà enregistré à partir de ce relevé.");

  // 2. Les règlements saisis autrement (tableau de bord, bail) : même jour, même montant. Chacun n'explique qu'UNE
  //    ligne ; s'il y a des jumelles, celle qui porte le nom du locataire d'abord.
  const clesDuFichier = new Set(lignes.map((l) => l.cle));
  const baux = new Map<string, { locataire: string | null; lotNom: string }>();
  for (const a of appels) if (!baux.has(a.bailId)) baux.set(a.bailId, { locataire: a.locataire, lotNom: a.lotNom });
  for (const e of encaissements) {
    if (e.cle && clesDuFichier.has(e.cle)) continue;
    const libres = lignes.filter((l) => !resultat.has(l.position) && l.date === e.date && l.centimes === e.centimes);
    if (!libres.length) continue;
    const bail = baux.get(e.bailId);
    const ligne = libres.find((l) => bail && nomRetrouve(l.libelle, bail.locataire)) ?? libres[0];
    poser(
      ligne,
      "deja",
      bail
        ? `Un règlement du même montant est déjà enregistré à cette date pour ${bail.locataire ?? "ce locataire"} (${bail.lotNom}).`
        : "Un règlement du même montant est déjà enregistré à cette date dans Gerimmo.",
    );
  }

  // 3. Les loyers de chaque bail, du plus ancien au plus récent : échus d'abord, puis ceux dont l'échéance n'est pas arrivée.
  type File = { dus: Candidat[]; aVenir: AppelOuvert[]; rang: number; derniere: number | null };
  const files = new Map<string, File>();
  const tries = [...appels].filter((a) => a.resteCentimes > 0).sort(
    (x, y) => x.periode.localeCompare(y.periode) || x.appelId.localeCompare(y.appelId),
  );
  for (const a of tries) {
    const f = files.get(a.bailId) ?? { dus: [], aVenir: [], rang: 0, derniere: null };
    if (a.echeance <= aujourdHui) f.dus.push({ ...a, resteAttenduCentimes: a.resteCentimes });
    else f.aVenir.push(a);
    files.set(a.bailId, f);
  }

  const enOrdre = lignes
    .filter((l) => !resultat.has(l.position))
    .sort((x, y) => x.date.localeCompare(y.date) || x.position - y.position);

  for (const l of enOrdre) {
    if (l.date > aujourdHui) {
      poser(l, "aucun", "Cette opération est datée dans le futur : elle ne peut pas être enregistrée.");
      continue;
    }
    const prochains = [...files.values()].filter((f) => f.rang < f.dus.length).map((f) => ({ f, a: f.dus[f.rang] }));
    const exacts = prochains.filter((p) => p.a.resteAttenduCentimes === l.centimes);
    const nommes = prochains.filter((p) => nomRetrouve(l.libelle, p.a.locataire));
    const exactsNommes = exacts.filter((p) => nommes.includes(p));

    const retenir = (p: { f: File; a: Candidat }, statut: StatutPointage, motif: string) => {
      poser(l, statut, motif, [p.a], p.f.derniere);
      p.f.derniere = l.position;
      if (l.centimes >= p.a.resteAttenduCentimes) p.f.rang++;
      else p.f.dus[p.f.rang] = { ...p.a, resteAttenduCentimes: p.a.resteAttenduCentimes - l.centimes };
    };

    if (exactsNommes.length === 1) {
      const p = exactsNommes[0];
      const tot = joursEntre(l.date, p.a.echeance) > JOURS_AVANT_ECHEANCE;
      if (tot)
        retenir(p, "probable", `Montant et nom concordent, mais ce règlement précède de plus de ${JOURS_AVANT_ECHEANCE} jours l’échéance du ${jourFr(p.a.echeance)} : vérifiez qu’il règle bien ce loyer.`);
      else retenir(p, "sur", "Le montant est le reste dû et le nom du locataire figure au libellé.");
    } else if (exactsNommes.length > 1) {
      poser(l, "choix", "Plusieurs loyers de ce locataire ont ce montant : choisissez celui que ce règlement solde.", exactsNommes.map((p) => p.a));
    } else if (exacts.length === 1) {
      retenir(exacts[0], "probable", "Même montant que le reste dû, mais le nom du locataire ne figure pas au libellé : vérifiez avant de cocher.");
    } else if (exacts.length > 1) {
      poser(l, "choix", "Plusieurs loyers attendus ont ce montant et le libellé ne dit pas lequel : choisissez.", exacts.map((p) => p.a));
    } else if (nommes.length === 1) {
      const p = nommes[0];
      if (l.centimes < p.a.resteAttenduCentimes)
        retenir(p, "partiel", `Le nom du locataire figure au libellé ; le montant est inférieur au reste dû (${euros(p.a.resteAttenduCentimes)}) : ce serait un règlement partiel.`);
      else
        poser(l, "superieur", `Le nom du locataire figure au libellé, mais le montant dépasse le reste dû de ce loyer (${euros(p.a.resteAttenduCentimes)}). Il couvre peut-être plusieurs mois : saisissez-le sur le bail.`, [p.a]);
    } else {
      // Un loyer payé d'avance : tous les loyers échus du bail sont soldés, le suivant a ce montant.
      const avance = [...files.values()]
        .filter((f) => f.rang >= f.dus.length && f.aVenir.length > 0 && f.aVenir[0].resteCentimes === l.centimes)
        .map((f) => f.aVenir[0]);
      const nommee = avance.filter((a) => nomRetrouve(l.libelle, a.locataire));
      const a = nommee.length === 1 ? nommee[0] : avance.length === 1 ? avance[0] : null;
      if (a)
        poser(l, "a_venir", `Même montant que le loyer de ${a.locataire ?? "ce locataire"} (${a.lotNom}), dont l’échéance du ${jourFr(a.echeance)} n’est pas arrivée. Relisez ce relevé à partir de cette date, ou saisissez une avance sur le bail.`, [{ ...a, resteAttenduCentimes: a.resteCentimes }]);
      else poser(l, "aucun", "Aucun loyer à recevoir ne correspond à ce montant ni à ce libellé.");
    }
  }

  return lignes.map((l) => resultat.get(l.position)!);
}

/** Ce que l'écran envoie au serveur pour UNE ligne confirmée. */
export type LigneAPointer = {
  position: number;
  date: string;
  centimes: number;
  libelle: string;
  rang: number;
  appelId: string;
  resteCentimes: number;
};

/**
 * Les raisons qui empêchent d'envoyer la sélection telle quelle : un loyer associé à deux lignes, ou une ligne cochée
 * alors que la précédente du même bail ne l'est pas. Rend une phrase par position fautive.
 */
export function verifierSelection(
  propositions: Proposition[],
  selection: Map<number, string>,
  /** Positions déjà enregistrées pendant cette visite : elles valent « cochées » pour la ligne suivante du bail. */
  faites: ReadonlySet<number> = new Set(),
): Map<number, string> {
  const fautes = new Map<number, string>();
  const parAppel = new Map<string, number[]>();
  for (const [position, appelId] of selection) parAppel.set(appelId, [...(parAppel.get(appelId) ?? []), position]);
  const parPosition = new Map(propositions.map((p) => [p.ligne.position, p]));
  for (const [position, appelId] of selection) {
    const p = parPosition.get(position);
    if (!p) continue;
    // Deux règlements partiels peuvent viser le même loyer ; deux soldes, non.
    const memeLoyer = (parAppel.get(appelId) ?? []).filter((autre) => {
      const q = parPosition.get(autre);
      return autre !== position && q && (q.statut === "choix" || p.statut === "choix");
    });
    if (memeLoyer.length) fautes.set(position, "Ce loyer est déjà associé à une autre ligne cochée.");
    else if (p.apres !== null && !selection.has(p.apres) && !faites.has(p.apres)) {
      const avant = parPosition.get(p.apres);
      fautes.set(position, `Cochez d’abord le règlement du ${avant ? jourFr(avant.ligne.date) : "même bail"} : les loyers d’un bail se pointent du plus ancien au plus récent.`);
    }
  }
  return fautes;
}
