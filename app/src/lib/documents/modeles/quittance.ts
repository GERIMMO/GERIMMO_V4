// 18 — Quittance de loyer · 19 — Reçu de paiement partiel (même épreuve à
// deux visages : `quittances.est_quittance` décide du titre et des mentions).

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Fusion,
  assemblerPage,
  cartouches,
  echapper,
  enTete,
  eur,
  faitA,
  blocSignatureEmetteur,
  formaterDateFr,
  section,
  tableau,
  titre,
  ligneTotal,
} from "../gabarit";
import {
  chargerContexteBail,
  expediteur,
  nomsBailleurs,
  nomsLocataires,
  adresseLogement,
  referenceCourte,
  signatureOrganisation,
  liensLocataires,
  libelleCharges,
  bornesTerme,
} from "./communs";
import type { Assemblage } from "./index";
import { estBailleurSociete } from "@/lib/qualite-bailleur";

export type DonneesQuittance = {
  estQuittance: boolean;
  reference: string;
  dateEmission: string;
  periode: string; // premier jour du mois (ISO)
  loyerHc: number | null;
  charges: number | null;
  montant: number;
  montantDu: number;
  /**
   * Ignorée depuis l'audit du 27/09 : la régularisation n'est plus imprimée
   * sur la quittance (elle ne faisait pas partie du total du terme). Gardée
   * pour la compatibilité des appelants.
   */
  regularisation?: number | null;
  /** Terme au prorata : la période imprimée est bornée à l'entrée / la sortie. */
  prorata?: boolean;
  dateFinBail?: string | null;
  chargesMode?: string | null;
  /** Les versements qui ont couvert CE terme (imputation du plus ancien au plus récent). */
  encaissements: { date: string; mode: string | null; montant: number }[];
  bailleurNom: string;
  /**
   * Qui déclare et qui signe, quand une société bailleresse a un représentant actif au bail (SCI-3,
   * `signataireQuittance`) : la déclaration « Je soussigné(e) … » (HTML déjà échappé) et le nom sous la signature.
   * Absents : le bailleur déclare (`bailleurNom`) et l'émetteur signe (`exp.nom`), comme avant.
   */
  soussigne?: string | null;
  signataire?: string | null;
  locatairesNoms: string;
  logementAdresse: string;
  referenceBail: string;
  dateBail: string | null;
  exp: ReturnType<typeof expediteur>;
  // Signature préenregistrée de l'émetteur (data-URI) — null : zone vierge
  signatureImg?: string | null;
  f: Fusion;
};

/** Un bailleur tel que la quittance le nomme, et la personne physique qui signe pour lui s'il est une société. */
export type BailleurQuittance = {
  nom: string;
  prenom: string | null;
  representant?: { nom: string; prenom: string | null } | null;
};

const prenomNom = (p: { nom: string; prenom: string | null }) => [p.prenom, p.nom].filter((v) => v?.trim()).join(" ").trim();
const nomPrenom = (p: { nom: string; prenom: string | null }) => [p.nom, p.prenom].filter((v) => v?.trim()).join(" ").trim();
const valeur = (texte: string) => `<span class="v">${echapper(texte)}</span>`;

/**
 * SCI-3 (audit du 19/11/2026) : une quittance de société disait « Je soussigné(e) SCI du Tilleul, bailleur du
 * logement… » et se signait « SCI du Tilleul », sans nommer la personne qui signe. Quand la société a un représentant
 * actif au bail (`representations_bail`, lu par `representants_actifs_bail`), il est nommé :
 *   « Je soussigné(e) Camille Martin, agissant pour le compte de SCI du Tilleul, bailleur du logement… »
 *   signature : « SCI du Tilleul, représentée par Camille Martin ».
 * Sans représentant : `null`, le texte d'avant reste (« Je soussigné(e) SCI du Tilleul… »).
 *
 * FORMULATION À VALIDER JURIDIQUEMENT (« agissant pour le compte de », « représentée par », accord au féminin de
 * « la société ») avant d'être tenue pour définitive.
 *
 * Les noms sont échappés ici et ne passent pas par la fusion : le représentant est facultatif, son absence ne fait
 * jamais un champ obligatoire manquant ; l'identité du bailleur reste contrôlée par `bailleurNom`.
 */
export function signataireQuittance(bailleurs: BailleurQuittance[] | null | undefined): { soussigne: string; signature: string } | null {
  const nommes = (bailleurs ?? []).filter((b) => nomPrenom(b));
  const represente = (b: BailleurQuittance) => (b.representant && prenomNom(b.representant) ? b.representant : null);
  if (!nommes.some(represente)) return null;
  const soussigne = nommes.map((b) => {
    const r = represente(b);
    return r ? `${valeur(prenomNom(r))}, agissant pour le compte de ${valeur(nomPrenom(b))}` : valeur(nomPrenom(b));
  });
  const signature = nommes.map((b) => {
    const r = represente(b);
    return r ? `${nomPrenom(b)}, représentée par ${prenomNom(r)}` : nomPrenom(b);
  });
  return { soussigne: soussigne.join(", et "), signature: signature.join(" ; ") };
}

/**
 * Reprise du lot 48 (U07) : l'ordre des bailleurs d'une quittance, le même pour le PDF (détenteurs lus sans ordre) et pour la
 * quittance délivrée au locataire (`quittance_document`, rangée par la base selon sa collation) : nom, puis prénom, à la
 * française. Avec deux bailleurs, leurs noms, leurs adresses et « Fait à » (commune du premier) pouvaient différer d'un
 * document à l'autre pour la même quittance.
 */
export function ordreBailleursQuittance<T extends { nom: string; prenom: string | null }>(bailleurs: readonly T[]): T[] {
  return [...bailleurs].sort((a, b) => a.nom.localeCompare(b.nom, "fr") || (a.prenom ?? "").localeCompare(b.prenom ?? "", "fr"));
}

// Les codes enregistrés par « Payé par » (fiche du bail), en toutes lettres
// sur le document : « par virement », pas « par virement » brut ni « par caf ».
// Une seule table pour les deux quittances : celle du catalogue (ce modèle) et
// celle délivrée au locataire (quittance-conforme.ts) — phase 3, lot 36, C48.
const MODES: Record<string, string> = {
  virement: "virement",
  cheque: "chèque",
  prelevement: "prélèvement",
  especes: "espèces",
  caf: "versement CAF / APL",
  autre: "autre moyen",
};

export function libelleMode(mode: string | null | undefined): string | null {
  if (!mode) return null;
  return MODES[mode] ?? mode;
}

type AppelImpute = { id: string; periode: string; montant_du: number };
type Versement = { date_paiement: string; mode: string | null; montant: number; created_at?: string | null };

// Les versements qui ont couvert un terme donné (audit du 27/09). La quittance
// imprimait la date et le mode du DERNIER encaissement du bail, quel que soit
// le terme : une quittance de janvier rééditée en mars citait un versement de
// mars. On rejoue ici l'imputation de la base (etat_loyers_bail_brut : du plus
// ancien terme au plus récent, versements dans l'ordre de paiement) et on garde
// la part de chaque versement tombée sur ce terme.
export function versementsDuTerme(
  appels: AppelImpute[],
  versements: Versement[],
  appelId: string
): { date: string; mode: string | null; montant: number }[] {
  const tries = [...appels].sort((a, b) => a.periode.localeCompare(b.periode));
  let debut = 0;
  let fin = -1;
  for (const a of tries) {
    const du = Math.round(Number(a.montant_du) * 100);
    if (a.id === appelId) {
      fin = debut + du;
      break;
    }
    debut += du;
  }
  if (fin < 0) return [];
  const ordonnes = [...versements].sort(
    (a, b) =>
      a.date_paiement.localeCompare(b.date_paiement) ||
      String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""))
  );
  const resultat: { date: string; mode: string | null; montant: number }[] = [];
  let cumul = 0;
  for (const v of ordonnes) {
    const m = Math.round(Number(v.montant) * 100);
    const part = Math.min(fin, cumul + m) - Math.max(debut, cumul);
    if (part > 0) resultat.push({ date: v.date_paiement, mode: v.mode, montant: part / 100 });
    cumul += m;
    if (cumul >= fin) break;
  }
  return resultat;
}

export function construireQuittance(d: DonneesQuittance) {
  const f = d.f;
  const bornes = bornesTerme(d.periode, Boolean(d.prorata), d.dateBail, d.dateFinBail);
  const du = formaterDateFr(bornes.du);
  const au = formaterDateFr(bornes.au);
  const titreDoc = d.estQuittance ? "Quittance de loyer" : "Reçu de paiement partiel";
  const solde = d.montantDu - d.montant;

  const lignes: string[][] = [
    ["Loyer hors charges", f.montant(d.loyerHc)],
    [libelleCharges(d.chargesMode), f.montant(d.charges)],
  ];
  // Audit du 27/09 : plus de ligne « Régularisation de charges » ici. Elle
  // n'entrait pas dans le total du terme et son signe était ambigu (un écart
  // positif est un trop-perçu) : la régularisation n'est pas un élément du
  // terme quittancé tant qu'elle ne passe pas par un appel.

  // Un seul versement : « Règlement reçu le … par … ». Plusieurs : chacun
  // avec sa date, son mode et la part imputée sur ce terme.
  const reglements =
    d.encaissements.length > 1
      ? `Règlements reçus sur ce terme : ${d.encaissements
          .map((e) => `${eur(e.montant)} le ${f.date(e.date)} par ${f.champ(e.mode, "virement, chèque, espèces…")}`)
          .join(" ; ")}`
      : `Règlement reçu le ${f.date(d.encaissements[0]?.date)} par ${f.champ(d.encaissements[0]?.mode, "virement, chèque, espèces…")}`;
  // SCI-3 : la déclaration et la signature nomment le représentant d'une société bailleresse quand il y en a un
  // (`signataireQuittance`) — formulation à valider juridiquement.
  const corps = `
    ${enTete(f, d.exp, { libelle: "Contrat", reference: d.referenceBail, etabliLe: d.dateEmission })}
    ${titre(titreDoc, `Période du ${du} au ${au}`, ["Article 21 de la loi n° 89-462 du 6 juillet 1989"])}
    ${cartouches([
      ["Bailleur", `<div>${d.bailleurNom}</div>`],
      ["Locataire", `<div>${d.locatairesNoms}</div>`],
      ["Logement loué", `<div>${f.champ(d.logementAdresse, "adresse complète, étage, porte")}</div>`],
      ["Bail", `Réf. ${f.champ(d.referenceBail, "référence du bail")} prenant effet le ${f.date(d.dateBail)}`],
    ])}
    <p>Je soussigné(e) ${d.soussigne ?? d.bailleurNom}, bailleur du logement désigné ci-dessus, déclare avoir reçu de
    ${d.locatairesNoms} la somme de <b>${eur(d.montant)}</b>, au titre du loyer et des charges pour la
    période du ${du} au ${au}${
      d.estQuittance
        ? ", et lui en donne <b>quittance</b>, sous réserve de tous mes droits."
        : ", à valoir sur le terme désigné ci-dessous."
    }</p>
    ${section(d.estQuittance ? "Détail des sommes" : "Situation du terme")}
    ${tableau(
      [{ libelle: "Nature" }, { libelle: "Montant", droite: true }],
      d.estQuittance
        ? lignes
        : [
            ["Total du terme", f.montant(d.montantDu)],
            ["Montant encaissé", f.montant(d.montant)],
            [`<b>Solde restant dû</b>`, `<b>${eur(Math.max(0, solde))}</b>`],
          ]
    )}
    ${
      d.estQuittance
        ? ligneTotal("Total du terme", f.montant(d.montantDu, "total du terme"))
        : ""
    }
    <p>${reglements}.</p>
    <div class="mentions">
      ${
        d.estQuittance
          ? `<p>La présente quittance porte sur le seul terme désigné. Elle ne préjuge pas des sommes qui
             resteraient dues au titre de termes antérieurs.</p>
             <p>Elle annule tout reçu pour solde partiel établi au titre de la même période.</p>
             <p>La quittance est délivrée gratuitement au locataire qui en fait la demande, conformément à
             l'article 21 de la loi du 6 juillet 1989.</p>
             <p>Ce document constitue un justificatif de domicile et de paiement : le locataire est invité à le conserver.</p>`
          : `<p>Le présent reçu constate un paiement partiel : il ne vaut pas quittance. Le solde du terme
             reste exigible ; une quittance sera délivrée à l'encaissement intégral (article 21 de la loi du
             6 juillet 1989).</p>`
      }
    </div>
    ${faitA(f, d.exp.ville, d.dateEmission)}
    ${blocSignatureEmetteur(d.signataire ?? d.exp.nom, d.signatureImg ?? null)}
  `;

  return assemblerPage({
    f,
    titreDocument: titreDoc,
    nomPied: titreDoc,
    reference: d.reference,
    corps,
  });
}

export async function assemblerQuittance(
  supabase: SupabaseClient,
  orgId: string,
  quittanceId: string
): Promise<Assemblage> {
  const { data: q } = await supabase
    .from("quittances")
    .select("id, bail_id, appel_id, est_quittance, montant, date_emission")
    .eq("id", quittanceId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!q) return { erreur: "Quittance introuvable." };

  const lu = await chargerContexteBail(supabase, orgId, q.bail_id);
  if ("erreur" in lu) return lu;
  // Reprise du lot 48 (U07) : les bailleurs dans l'ordre de la quittance délivrée (nom, prénom), pour le nom, l'en-tête et
  // « Fait à ».
  const ctx = { ...lu, bailleurs: ordreBailleursQuittance(lu.bailleurs) };

  const [{ data: appels }, { data: encaissements }] = await Promise.all([
    supabase
      .from("appels_loyer")
      .select("id, periode, loyer_hc, charges, montant_du, prorata")
      .eq("bail_id", q.bail_id)
      .order("periode"),
    supabase
      .from("encaissements")
      .select("date_paiement, mode, montant, created_at")
      .eq("bail_id", q.bail_id)
      .order("date_paiement"),
  ]);
  const appel = (appels ?? []).find((a) => a.id === q.appel_id);
  if (!appel) return { erreur: "Appel de loyer introuvable pour cette quittance." };

  // SCI-3 : le même texte que la quittance délivrée au locataire (quittance-conforme.ts). Le propriétaire direct lit le
  // pouvoir de sa société comme pour l'envoi en signature ; une agence émet en mandataire et n'en a pas.
  let representants: { societe_id: string; nom: string; prenom: string | null }[] = [];
  if (ctx.organisation.type !== "agence" && ctx.bailleurs.some((b) => estBailleurSociete(b.qualite))) {
    const pouvoirs = await supabase.rpc("representants_actifs_bail", { p_bail: q.bail_id });
    if (pouvoirs.error) return { erreur: "Le représentant de la société bailleresse n’a pas pu être vérifié. Réessayez." };
    representants = pouvoirs.data ?? [];
  }
  const signataire = signataireQuittance(ctx.bailleurs.map((b) => ({
    nom: b.nom,
    prenom: b.prenom,
    representant: representants.find((r) => r.societe_id === b.id) ?? null,
  })));

  const f = new Fusion();
  const document = construireQuittance({
    estQuittance: q.est_quittance,
    reference: referenceCourte(q.est_quittance ? "QUIT" : "RECU", q.id),
    dateEmission: q.date_emission,
    periode: appel.periode,
    loyerHc: appel.loyer_hc === null ? null : Number(appel.loyer_hc),
    charges: appel.charges === null ? null : Number(appel.charges),
    montant: Number(q.montant),
    montantDu: Number(appel.montant_du),
    prorata: Boolean(appel.prorata),
    dateFinBail: ctx.bail.date_fin,
    chargesMode: ctx.bail.charges_mode,
    encaissements: versementsDuTerme(
      (appels ?? []).map((a) => ({ id: a.id, periode: a.periode, montant_du: Number(a.montant_du) })),
      (encaissements ?? []).map((e) => ({
        date_paiement: e.date_paiement,
        mode: e.mode,
        montant: Number(e.montant),
        created_at: e.created_at,
      })),
      q.appel_id
    ).map((e) => ({ ...e, mode: libelleMode(e.mode) })),
    bailleurNom: nomsBailleurs(f, ctx.bailleurs),
    soussigne: signataire?.soussigne,
    signataire: signataire?.signature,
    locatairesNoms: nomsLocataires(f, ctx.locataires),
    logementAdresse: adresseLogement(ctx.lot, ctx.bien),
    referenceBail: referenceCourte("BAIL", ctx.bail.id),
    dateBail: ctx.bail.date_debut,
    exp: expediteur(ctx),
    signatureImg: await signatureOrganisation(supabase, orgId),
    f,
  });

  const moisLong = new Date(`${appel.periode.slice(0, 10)}T12:00:00`).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });
  return {
    document,
    titreGed: `${q.est_quittance ? "Quittance" : "Reçu"} — ${moisLong}`,
    nomFichier: `${q.est_quittance ? "quittance" : "recu"}-${appel.periode.slice(0, 7)}`,
    liens: [
      { entite: "bail", entiteId: q.bail_id },
      ...liensLocataires(ctx),
    ],
  };
}
