// 23 — Révision annuelle du loyer (IRL) : nouveau montant, indices retenus,
// note de calcul. Cible : la révision enregistrée.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Fusion,
  assemblerPage,
  cartouches,
  enTete,
  eur,
  faitA,
  blocSignatureEmetteur,
  formaterDateFr,
  moisEnToutesLettres,
  section,
  tableau,
  titre,
} from "../gabarit";
import { deElide } from "@/lib/elision";
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
} from "./communs";
import type { Assemblage } from "./index";

export type DonneesRevisionIrl = {
  reference: string;
  dateEffet: string;
  /** Date anniversaire de rattachement (null : révision antérieure au 29/09). */
  dateEcheance?: string | null;
  /** Date de la demande du bailleur (null : révision antérieure au 29/09). */
  dateDemande?: string | null;
  /** Trimestre de l'indice nouveau (« T2 2026 »). */
  trimestreNouveau?: string | null;
  /** Fin du bail enregistrée (congé), pour dire qu'aucun terme ne suit. */
  dateFinBail?: string | null;
  ancienLoyer: number;
  nouveauLoyer: number;
  irlReference: number | null;
  irlNouveau: number | null;
  trimestre: string | null;
  charges: number | null;
  /** 'provision' | 'forfait' — le libellé des charges suit le bail. */
  chargesMode?: string | null;
  bailleurNom: string;
  locatairesNoms: string;
  logementAdresse: string;
  referenceBail: string;
  exp: ReturnType<typeof expediteur>;
  /** Ce que les appels du bail font de la révision (C54) ; null : ils ne permettent pas de le dire ; absent : non lu. */
  application?: ApplicationRevision | null;
  // Signature préenregistrée de l'émetteur (data-URI) — null : zone vierge
  signatureImg?: string | null;
  f: Fusion;
};

// Phase 3 (C54) : la notification disait « loyer révisé à compter du 15/10/2026 » alors que le terme d'octobre, émis le 1er
// au loyer d'avant, n'était ni modifié ni complété : `reviser_loyer` ne change que le loyer du bail, et seuls les termes émis
// ENSUITE le portent, chacun pour le mois entier (generer_appels_loyer_interne ne coupe pas un mois). Le document dit donc ce
// que font les appels : à partir de quel terme le loyer révisé est appelé, et le sort de la période entre la date d'effet et ce
// terme. Ce n'est pas un choix de calcul tranché ici (rendu au dirigeant) : la notification décrit l'existant.
export type AppelRevision = { periode: string; loyer_hc: number | string | null; base_loyer_hc?: number | string | null };
export type ApplicationRevision = {
  /** Premier terme (« AAAA-MM-01 ») appelé au loyer révisé ; null : aucun, le bail prenant fin avant. */
  premierTerme: string | null;
  /** Termes émis au loyer d'avant depuis le mois de la date d'effet : la période non complétée et leur loyer. */
  nonComplete: { du: string; au: string; loyer: number; termes: string[] } | null;
  /** Le premier terme révisé commence avant la date d'effet : jours facturés au loyer révisé avant l'effet. */
  avantEffet: { du: string; au: string } | null;
  /** Loyer révisé égal à l'ancien, au centime (indice inchangé, ou variation effacée à l'arrondi) : aucun terme ne change. */
  inchange?: true;
};

const centimes = (v: number | string | null | undefined) => Math.round(Number(v ?? NaN) * 100);
const jourIso = (d: Date) => d.toISOString().slice(0, 10);
function moisSuivant(periode: string): string {
  const [a, m] = periode.slice(0, 7).split("-").map(Number);
  return jourIso(new Date(Date.UTC(a, m, 1)));
}
function finDuMois(periode: string): string {
  const [a, m] = periode.slice(0, 7).split("-").map(Number);
  return jourIso(new Date(Date.UTC(a, m, 0)));
}
function veille(jour: string): string {
  const d = new Date(`${jour.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return jourIso(d);
}

/**
 * Lit sur les appels du bail ce qu'il advient de la révision. Le loyer d'un appel est sa base mensuelle (base_loyer_hc, à
 * défaut loyer_hc). Rien n'est déduit si le terme du mois de l'effet n'existe pas, ou si un terme porte un autre loyer que
 * l'ancien et le nouveau (avenant, correction) : `null`, et le document s'en tient à la règle générale.
 */
export function applicationRevision(
  dateEffet: string,
  ancienLoyer: number,
  nouveauLoyer: number,
  appels: AppelRevision[],
  dateFinBail?: string | null
): ApplicationRevision | null {
  // Lot 39 (reprise, C54) : un loyer révisé égal à l'ancien ne permet pas de distinguer un terme révisé d'un terme d'avant ; le
  // terme du mois de l'effet, émis à l'ancien loyer, était pris pour « révisé pour le mois entier, avant la date d'effet ».
  if (centimes(nouveauLoyer) === centimes(ancienLoyer)) return { premierTerme: null, nonComplete: null, avantEffet: null, inchange: true };
  const moisEffet = `${dateEffet.slice(0, 7)}-01`;
  const suivants = appels
    .filter((a) => a.periode.slice(0, 10) >= moisEffet)
    .sort((a, b) => a.periode.localeCompare(b.periode));
  if (suivants[0]?.periode.slice(0, 10) !== moisEffet) return null;
  const anciens: string[] = [];
  let premierTerme: string | null = null;
  for (const a of suivants) {
    const loyer = centimes(a.base_loyer_hc ?? a.loyer_hc);
    if (loyer === centimes(nouveauLoyer)) { premierTerme = a.periode.slice(0, 10); break; }
    if (loyer !== centimes(ancienLoyer)) return null;
    anciens.push(a.periode.slice(0, 10));
  }
  if (!premierTerme) {
    // Le terme suivant n'est pas encore émis : il le sera au loyer du bail, révisé — sauf si le bail finit avant.
    const prochain = moisSuivant(anciens[anciens.length - 1]);
    premierTerme = dateFinBail && dateFinBail.slice(0, 10) < prochain ? null : prochain;
  }
  const dernier = anciens[anciens.length - 1];
  return {
    premierTerme,
    nonComplete: anciens.length
      ? { du: dateEffet.slice(0, 10), au: dateFinBail && dateFinBail.slice(0, 10) < finDuMois(dernier) ? dateFinBail.slice(0, 10) : finDuMois(dernier), loyer: ancienLoyer, termes: anciens }
      : null,
    avantEffet: premierTerme === moisEffet && dateEffet.slice(0, 10) > moisEffet ? { du: moisEffet, au: veille(dateEffet) } : null,
  };
}

/** La phrase qui dit ce que font les appels du bail (C54) ; vide si l'application n'a pas été lue. */
function phraseApplication(application: ApplicationRevision | null | undefined, dateFinBail: string | null | undefined, nouveauLoyer: number): string {
  if (application === undefined) return "";
  if (application === null) {
    return `<p>Le loyer révisé s'applique aux termes appelés après l'enregistrement de la révision ; un terme déjà appelé
      n'est pas modifié.</p>`;
  }
  if (application.inchange) return `<p>Le loyer révisé est égal au loyer avant révision : la révision ne modifie le montant d'aucun terme.</p>`;
  const phrases: string[] = [];
  const { premierTerme, nonComplete, avantEffet } = application;
  if (premierTerme) {
    phrases.push(`Le loyer révisé est appelé à compter du terme ${deElide(moisEnToutesLettres(premierTerme))}${
      avantEffet ? `, pour le mois entier, y compris du ${formaterDateFr(avantEffet.du)} au ${formaterDateFr(avantEffet.au)}, avant la date d'effet` : ""
    }.`);
  } else {
    phrases.push(`Aucun terme n'est appelé au loyer révisé : le bail prend fin le ${dateFinBail ? formaterDateFr(dateFinBail) : "—"}.`);
  }
  if (nonComplete) {
    const premier = moisEnToutesLettres(nonComplete.termes[0]);
    const dernier = moisEnToutesLettres(nonComplete.termes[nonComplete.termes.length - 1]);
    const termes = nonComplete.termes.length === 1
      ? `Le terme ${deElide(premier)}, appelé avant l'enregistrement de cette révision, reste`
      : `Les termes ${deElide(premier)} à ${dernier}, appelés avant l'enregistrement de cette révision, restent`;
    // Lot 39 (reprise, C54) : en cas de baisse, « aucun complément n'est appelé » taisait que le terme resté à l'ancien loyer
    // est plus élevé que le loyer révisé ; le document le dit, et qu'aucune déduction n'est faite sur la période.
    phrases.push(centimes(nouveauLoyer) < centimes(nonComplete.loyer)
      ? `${termes} au loyer de ${eur(nonComplete.loyer)}, supérieur au loyer révisé : aucune déduction n'est appliquée pour la
        période du ${formaterDateFr(nonComplete.du)} au ${formaterDateFr(nonComplete.au)}.`
      : `${termes} au loyer de ${eur(nonComplete.loyer)} : aucun complément n'est appelé pour la période du
      ${formaterDateFr(nonComplete.du)} au ${formaterDateFr(nonComplete.au)}.`);
  }
  return `<p>${phrases.join(" ")}</p>`;
}

// « (inchangé) » s'accorde avec le libellé des charges : une provision est inchangée, un forfait inchangé ; sans mode
// connu (« Provision ou forfait de charges »), le montant l'est (phase 3, C55).
export function chargesInchangees(mode: string | null | undefined): string {
  if (mode === "provision") return "inchangée";
  if (mode === "forfait") return "inchangé";
  return "montant inchangé";
}

export function construireRevisionIrl(d: DonneesRevisionIrl) {
  const f = d.f;
  const variation =
    d.irlReference && d.irlNouveau
      ? (((d.irlNouveau - d.irlReference) / d.irlReference) * 100).toLocaleString("fr-FR", {
          maximumFractionDigits: 2,
        }) + "\u00a0%"
      : null;
  const rapport =
    d.irlReference && d.irlNouveau
      ? `${eur(d.ancienLoyer)} × ${d.irlNouveau.toLocaleString("fr-FR")} / ${d.irlReference.toLocaleString("fr-FR")}`
      : null;

  // Audit 29/09 (art. 17-1 I, rédaction ALUR) : demandée après la date
  // anniversaire, la révision prend effet à la date de la demande — la lettre
  // ne l'annonce jamais « à compter » d'un anniversaire passé.
  const echeance = d.dateEcheance ?? d.dateEffet;
  const tardive = Boolean(d.dateDemande && d.dateEcheance && d.dateDemande > d.dateEcheance);
  const phraseEffet = tardive
    ? `<p>La révision se rattache à l'échéance annuelle du ${f.date(echeance)}. Demandée le
       ${f.date(d.dateDemande)}, après cette date anniversaire, elle prend effet à la date de la
       demande, soit le <b>${f.date(d.dateEffet)}</b>, sans effet rétroactif (article 17-1 I de la
       loi du 6 juillet 1989).</p>`
    : `<p>La révision prend effet à la date anniversaire du bail, le <b>${f.date(d.dateEffet)}</b>.</p>`;

  const corps = `
    ${enTete(f, d.exp, { libelle: "Contrat", reference: d.referenceBail, etabliLe: new Date().toISOString() })}
    ${titre("Révision du loyer", `Échéance annuelle du ${f.date(echeance)}`, [
      "Article 17-1 de la loi n° 89-462 du 6 juillet 1989 — indice de référence des loyers (IRL)",
    ])}
    ${cartouches([
      ["Bailleur", `<div>${d.bailleurNom}</div>`],
      ["Locataire", `<div>${d.locatairesNoms}</div>`],
      ["Logement loué", `<div>${f.champ(d.logementAdresse, "adresse complète, étage, porte")}</div>`],
      ["Bail", `Réf. ${f.champ(d.referenceBail, "référence du bail")}`],
    ])}
    <p>Conformément à la clause de révision du bail, le loyer est révisé chaque année selon la
    variation de l'indice de référence des loyers publié par l'INSEE.</p>
    ${phraseEffet}
    ${phraseApplication(d.application, d.dateFinBail, d.nouveauLoyer)}
    ${section("Nouveau montant")}
    ${tableau(
      [{ libelle: "Nature" }, { libelle: "Montant", droite: true }],
      [
        ["Loyer hors charges avant révision", f.montant(d.ancienLoyer)],
        [`<b>Loyer hors charges révisé${d.application?.premierTerme ? `, appelé à compter du terme ${deElide(moisEnToutesLettres(d.application.premierTerme))}` : ""}</b>`, `<b>${f.montant(d.nouveauLoyer)}</b>`],
        [`${libelleCharges(d.chargesMode)} (${chargesInchangees(d.chargesMode)})`, f.montant(d.charges, "montant inchangé")],
      ]
    )}
    ${section("Indices retenus")}
    ${tableau(
      [{ libelle: "Référence" }, { libelle: "Valeur", droite: true }],
      [
        ["Trimestre de référence du bail", f.champ(d.trimestre, "ex. 2e trimestre")],
        ["Trimestre du nouvel indice (même trimestre que la référence)", f.champ(d.trimestreNouveau, "ex. T2 2026")],
        ["Nouvel indice retenu", f.champ(d.irlNouveau?.toLocaleString("fr-FR"), "indice du trimestre de révision")],
        [
          "Indice de référence (dernière révision, à défaut indice figé au bail)",
          f.champ(d.irlReference?.toLocaleString("fr-FR"), "indice de référence"),
        ],
        ["Variation", f.champ(variation, "en pourcentage")],
      ]
    )}
    ${section("Note de calcul")}
    <p>${f.champ(rapport, "rapport des indices")} = ${f.montant(d.nouveauLoyer, "montant avant arrondi")}
    (arrondi au centime le plus proche).</p>
    ${section("Mentions")}
    <div class="mentions">
      <p>La révision ne peut excéder la variation de l'IRL, apprécié sur le même trimestre que
      l'indice de référence. Elle prend effet à la date convenue au bail si elle est demandée à
      cette date ; demandée après, elle prend effet à la date de la demande, sans rétroactivité.
      Le bailleur dispose d'un an à compter de la date anniversaire pour en faire la demande —
      passé ce délai, il est réputé y avoir renoncé pour l'année écoulée (article 17-1 I de la loi
      du 6 juillet 1989, rédaction issue de la loi n° 2014-366 du 24 mars 2014).</p>
    </div>
    ${faitA(f, d.exp.ville, new Date().toISOString())}
    ${blocSignatureEmetteur(d.exp.nom, d.signatureImg ?? null)}
  `;
  return assemblerPage({
    f,
    titreDocument: "Révision du loyer",
    nomPied: "Révision du loyer (IRL)",
    reference: d.reference,
    corps,
  });
}

export async function assemblerRevisionIrl(
  supabase: SupabaseClient,
  orgId: string,
  revisionId: string
): Promise<Assemblage> {
  const { data: r } = await supabase
    .from("revisions_loyer")
    .select("id, bail_id, date_effet, date_echeance, date_demande, irl_trimestre, ancien_loyer, nouveau_loyer, irl_reference, irl_nouveau")
    .eq("id", revisionId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!r) return { erreur: "Révision introuvable." };

  const ctx = await chargerContexteBail(supabase, orgId, r.bail_id);
  if ("erreur" in ctx) return ctx;

  // C54 : les termes émis depuis le mois de la date d'effet disent à partir de quand le loyer révisé est appelé.
  const { data: appels, error: erreurAppels } = await supabase
    .from("appels_loyer")
    .select("periode, loyer_hc, base_loyer_hc")
    .eq("bail_id", r.bail_id)
    .eq("organization_id", orgId)
    .gte("periode", `${String(r.date_effet).slice(0, 7)}-01`)
    .order("periode")
    .limit(36);
  if (erreurAppels) return { erreur: "Les appels de loyer du bail n’ont pas pu être lus. Réessayez avant de générer ce document." };

  const f = new Fusion();
  const document = construireRevisionIrl({
    reference: referenceCourte("IRL", r.id),
    dateEffet: r.date_effet,
    dateEcheance: r.date_echeance,
    dateDemande: r.date_demande,
    trimestreNouveau: r.irl_trimestre,
    dateFinBail: ctx.bail.date_fin,
    application: applicationRevision(r.date_effet, Number(r.ancien_loyer), Number(r.nouveau_loyer), (appels ?? []) as AppelRevision[], ctx.bail.date_fin),
    ancienLoyer: Number(r.ancien_loyer),
    nouveauLoyer: Number(r.nouveau_loyer),
    irlReference: r.irl_reference === null ? null : Number(r.irl_reference),
    irlNouveau: r.irl_nouveau === null ? null : Number(r.irl_nouveau),
    trimestre: ctx.bail.irl_trimestre,
    charges: ctx.bail.charges === null ? null : Number(ctx.bail.charges),
    chargesMode: ctx.bail.charges_mode,
    bailleurNom: nomsBailleurs(f, ctx.bailleurs),
    locatairesNoms: nomsLocataires(f, ctx.locataires),
    logementAdresse: adresseLogement(ctx.lot, ctx.bien),
    referenceBail: referenceCourte("BAIL", ctx.bail.id),
    exp: expediteur(ctx),
    signatureImg: await signatureOrganisation(supabase, orgId),
    f,
  });

  return {
    document,
    // Phase 3 (C64) : le titre de classement porte la date au format français, comme le document.
    titreGed: `Révision IRL — effet au ${formaterDateFr(r.date_effet)}`,
    nomFichier: `revision-irl-${r.date_effet}`,
    liens: [
      { entite: "bail", entiteId: r.bail_id },
      ...liensLocataires(ctx),
    ],
  };
}
