// 17 — Avis d'échéance : le terme à venir, son détail et les modalités de
// règlement. Cible : l'appel de loyer.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Fusion,
  assemblerPage,
  cartouches,
  enTete,
  eur,
  facultatif,
  faitA,
  blocSignatureEmetteur,
  formaterDateFr,
  section,
  tableau,
  titre,
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

export type DonneesAvisEcheance = {
  reference: string;
  periode: string;
  dateEcheance: string | null;
  loyerHc: number | null;
  charges: number | null;
  montantDu: number;
  prorata: boolean;
  /** Fin du bail, pour borner un terme de sortie au prorata. */
  dateFinBail?: string | null;
  chargesMode?: string | null;
  /** Ce qui restait dû sur les termes antérieurs (0 si à jour). */
  arriere?: number;
  lieuPaiement?: string | null;
  iban?: string | null;
  bailleurNom: string;
  locatairesNoms: string;
  logementAdresse: string;
  referenceBail: string;
  dateBail: string | null;
  exp: ReturnType<typeof expediteur>;
  // Signature préenregistrée de l'émetteur (data-URI) — null : zone vierge
  signatureImg?: string | null;
  f: Fusion;
};

export function construireAvisEcheance(d: DonneesAvisEcheance) {
  const f = d.f;
  // Audit du 27/09 : période bornée à l'entrée / la sortie d'un terme au prorata.
  const bornes = bornesTerme(d.periode, d.prorata, d.dateBail, d.dateFinBail);
  const du = formaterDateFr(bornes.du);
  const au = formaterDateFr(bornes.au);
  const arriere = Math.max(0, Number(d.arriere ?? 0));

  const corps = `
    ${enTete(f, d.exp, { libelle: "Contrat", reference: d.referenceBail, etabliLe: new Date().toISOString() })}
    ${titre("Avis d'échéance", `Période du ${du} au ${au}`, [
      "Le présent avis ne constitue ni une quittance ni un reçu.",
    ])}
    ${cartouches([
      ["Bailleur", `<div>${d.bailleurNom}</div>`],
      ["Locataire", `<div>${d.locatairesNoms}</div>`],
      ["Logement loué", `<div>${f.champ(d.logementAdresse, "adresse complète, étage, porte")}</div>`],
      ["Bail", `Réf. ${f.champ(d.referenceBail, "référence du bail")} prenant effet le ${f.date(d.dateBail)}`],
    ])}
    <p>Nous vous informons que le terme désigné ci-dessous arrive à échéance
    le ${f.date(d.dateEcheance)}. Le règlement est attendu à cette date.</p>
    ${section("Détail du terme")}
    ${tableau(
      [{ libelle: "Nature" }, { libelle: "Montant", droite: true }],
      [
        [`Loyer hors charges${d.prorata ? " (au prorata de la période d'occupation)" : ""}`, f.montant(d.loyerHc)],
        [libelleCharges(d.chargesMode), f.montant(d.charges)],
      ]
    )}
    <table><tbody><tr class="total"><td><b>Total du terme</b></td><td class="d"><b>${f.montant(
      d.montantDu,
      "total à régler"
    )}</b></td></tr></tbody></table>
    ${
      // Même règle que l'avis par e-mail (wiki « Quittancement des loyers »,
      // 18/09) : taire une dette en cours laisserait croire au locataire qu'il
      // sera à jour une fois le terme réglé.
      arriere > 0
        ? `<p><b>Solde antérieur restant dû : ${eur(arriere)}.</b> Total à régler pour solder votre compte :
           <b>${eur(arriere + Number(d.montantDu))}</b>.</p>`
        : ""
    }
    ${section("Modalités de règlement")}
    <p>Lieu de paiement prévu au bail : ${f.champ(d.lieuPaiement ?? null, "domicile du bailleur, virement…")}.</p>
    <p>Coordonnées bancaires : ${facultatif(d.iban ?? null)}.</p>
    <div class="mentions">
      <p>En cas de difficulté de paiement, rapprochez-vous sans attendre de votre gestionnaire :
      des solutions amiables existent (délais, aides au logement).</p>
    </div>
    ${faitA(f, d.exp.ville, new Date().toISOString())}
    ${blocSignatureEmetteur(d.exp.nom, d.signatureImg ?? null)}
  `;
  return assemblerPage({
    f,
    titreDocument: "Avis d'échéance",
    nomPied: "Avis d'échéance",
    reference: d.reference,
    corps,
  });
}

export async function assemblerAvisEcheance(
  supabase: SupabaseClient,
  orgId: string,
  appelId: string
): Promise<Assemblage> {
  const { data: appel } = await supabase
    .from("appels_loyer")
    .select("id, bail_id, periode, loyer_hc, charges, montant_du, date_echeance, prorata")
    .eq("id", appelId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!appel) return { erreur: "Appel de loyer introuvable." };

  const ctx = await chargerContexteBail(supabase, orgId, appel.bail_id);
  if ("erreur" in ctx) return ctx;

  // L'arriéré : ce qui reste dû sur les termes antérieurs à celui-ci.
  const { data: etat } = await supabase.rpc("etat_loyers_bail", { p_bail: appel.bail_id });
  const arriere = ((etat ?? []) as { periode: string; montant_du: number; montant_couvert: number }[])
    .filter((t) => t.periode < appel.periode && Number(t.montant_couvert) < Number(t.montant_du))
    .reduce((s, t) => s + Number(t.montant_du) - Number(t.montant_couvert), 0);

  const f = new Fusion();
  const document = construireAvisEcheance({
    reference: referenceCourte("AVIS", appel.id),
    periode: appel.periode,
    dateEcheance: appel.date_echeance,
    loyerHc: appel.loyer_hc === null ? null : Number(appel.loyer_hc),
    charges: appel.charges === null ? null : Number(appel.charges),
    montantDu: Number(appel.montant_du),
    prorata: Boolean(appel.prorata),
    dateFinBail: ctx.bail.date_fin,
    chargesMode: ctx.bail.charges_mode,
    arriere: Math.round(arriere * 100) / 100,
    lieuPaiement: ctx.bail.lieu_paiement,
    iban: ctx.organisation.iban ?? null,
    bailleurNom: nomsBailleurs(f, ctx.bailleurs),
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
    titreGed: `Avis d'échéance — ${moisLong}`,
    nomFichier: `avis-echeance-${appel.periode.slice(0, 7)}`,
    liens: [
      { entite: "bail", entiteId: appel.bail_id },
      ...liensLocataires(ctx),
    ],
  };
}
