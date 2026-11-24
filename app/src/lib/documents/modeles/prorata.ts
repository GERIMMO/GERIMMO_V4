// 21 — Décompte de prorata : base de calcul et détail pour un terme
// d'entrée ou de sortie en cours de mois. Cible : l'appel de loyer proraté.

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
  CSS_COURRIER_RESSERRE,
} from "./communs";
import type { Assemblage } from "./index";

export type DonneesProrata = {
  reference: string;
  motif: "entrée" | "sortie";
  periode: string;
  dateDebutOccupation: string | null;
  dateFinOccupation: string | null;
  loyerHcPlein: number | null;
  chargesPleines: number | null;
  loyerHcProrate: number | null;
  chargesProratees: number | null;
  montantDu: number;
  bailleurNom: string;
  locatairesNoms: string;
  logementAdresse: string;
  referenceBail: string;
  exp: ReturnType<typeof expediteur>;
  // Signature préenregistrée de l'émetteur (data-URI) — null : zone vierge
  signatureImg?: string | null;
  f: Fusion;
};

function joursDansLeMois(periodeIso: string): number {
  const d = new Date(`${periodeIso.slice(0, 10)}T12:00:00`);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export function construireProrata(d: DonneesProrata) {
  const f = d.f;
  const joursMois = joursDansLeMois(d.periode);
  const debut = d.dateDebutOccupation ?? d.periode;
  const finMois = new Date(`${d.periode.slice(0, 10)}T12:00:00`);
  finMois.setMonth(finMois.getMonth() + 1);
  finMois.setDate(0);
  const fin = d.dateFinOccupation ?? finMois.toISOString().slice(0, 10);
  const joursOccupes =
    Math.round((new Date(`${fin}T12:00:00`).getTime() - new Date(`${debut}T12:00:00`).getTime()) / 86_400_000) + 1;

  const detailCalcul =
    d.loyerHcPlein !== null
      ? `${eur(d.loyerHcPlein)} × ${joursOccupes} / ${joursMois}`
      : null;

  const corps = `
    ${enTete(f, d.exp, { libelle: "Contrat", reference: d.referenceBail, etabliLe: new Date().toISOString() })}
    ${titre("Décompte de prorata", d.motif === "entrée" ? "Entrée en cours de mois" : "Sortie en cours de mois", [
      "Le loyer n'est dû que pour la période d'occupation effective.",
    ])}
    ${cartouches([
      ["Bailleur", `<div>${d.bailleurNom}</div>`],
      ["Locataire", `<div>${d.locatairesNoms}</div>`],
      ["Logement loué", `<div>${f.champ(d.logementAdresse, "adresse complète, étage, porte")}</div>`],
      ["Bail", `Réf. ${f.champ(d.referenceBail, "référence du bail")}`],
    ])}
    ${section("Base de calcul")}
    ${tableau(
      [{ libelle: "Élément" }, { libelle: "Valeur", droite: true }],
      [
        ["Période d'occupation", `du ${formaterDateFr(debut)} au ${formaterDateFr(fin)}`],
        ["Jours occupés", f.champ(String(joursOccupes), "nombre de jours")],
        ["Jours du mois", f.champ(String(joursMois), "28 à 31")],
        ["Loyer hors charges du mois plein", f.montant(d.loyerHcPlein)],
        ["Charges du mois plein", f.montant(d.chargesPleines)],
      ]
    )}
    ${section("Calcul")}
    ${tableau(
      [{ libelle: "Nature" }, { libelle: "Détail du calcul" }, { libelle: "Montant", droite: true }],
      [
        ["Loyer hors charges au prorata", f.champ(detailCalcul, "détail du calcul"), f.montant(d.loyerHcProrate)],
        ["Charges au prorata", f.champ(
          d.chargesPleines !== null ? `${eur(d.chargesPleines)} × ${joursOccupes} / ${joursMois}` : null,
          "détail du calcul"
        ), f.montant(d.chargesProratees)],
      ]
    )}
    ${ligneTotal("Total dû pour la période", f.montant(d.montantDu, "total dû"))}
    <div class="mentions">
      <p>Le prorata est calculé au réel du mois considéré, au centime le plus proche. Ce décompte
      accompagne l'avis d'échéance ou la quittance du terme concerné.</p>
    </div>
    ${faitA(f, d.exp.ville, new Date().toISOString())}
    ${blocSignatureEmetteur(d.exp.nom, d.signatureImg ?? null)}
  `;
  return assemblerPage({
    f,
    titreDocument: "Décompte de prorata",
    nomPied: "Décompte de prorata",
    reference: d.reference,
    // Phase 3, lot 52 (W23, suite de C53) : à la taille commune, le décompte dépassait d'environ 3 cm ; la mention, « Fait à » et
    // la signature (gardés ensemble, règle .fait-a) partaient seuls en page 2, loin du calcul qu'ils valident. La mise en page
    // compacte des documents du catalogue et du reçu de dépôt (lot 51, W14 : titre à 19 pt, marges réduites) le garde sur une
    // page, avec des lignes de tableau resserrées (ses deux tableaux comptent sept lignes et le total). Les règles de coupure
    // communes ne changent pas.
    // Reprise du lot 52 (W23) : cela ne laissait qu'environ 7 pt sous la zone de signature vierge (44 pt). Une signature
    // enregistrée (image jusqu'à 52 pt de haut), un second locataire ou une adresse de logement sur trois lignes renvoyaient
    // « Fait à » et la signature en page 2. La mise en page resserrée commune aux courriers de loyer (CSS_COURRIER_RESSERRE)
    // gagne environ 70 pt de plus.
    corps: `<style>${CSS_COURRIER_RESSERRE}</style>${corps}`,
  });
}

export async function assemblerProrata(
  supabase: SupabaseClient,
  orgId: string,
  appelId: string
): Promise<Assemblage> {
  const { data: appel } = await supabase
    .from("appels_loyer")
    .select("id, bail_id, periode, loyer_hc, charges, montant_du, prorata, base_loyer_hc, base_charges")
    .eq("id", appelId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!appel) return { erreur: "Appel de loyer introuvable." };
  if (!appel.prorata) return { erreur: "Cet appel est un mois plein : pas de prorata à décompter." };

  const ctx = await chargerContexteBail(supabase, orgId, appel.bail_id);
  if ("erreur" in ctx) return ctx;

  const memePeriode = (iso: string | null) => Boolean(iso && iso.slice(0, 7) === appel.periode.slice(0, 7));
  const motif = memePeriode(ctx.bail.date_debut) ? "entrée" : "sortie";
  // Phase 3 (C47) : la base imprimée est celle qui a ÉMIS l'appel (appels_loyer.base_loyer_hc et base_charges, mémorisées à
  // l'émission et gardées par les recalculs), pas le loyer actuel du bail : après une révision ou un avenant, le décompte
  // d'une entrée d'octobre 2025 imprimait 710,50 € × 17 / 31 pour un montant calculé sur 700,00 €. Les bornes sont celles
  // du calcul de la base (montants_appel_loyer) : entrée ET sortie quand le bail commence et finit dans le même mois.
  const base = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v));

  const f = new Fusion();
  const document = construireProrata({
    reference: referenceCourte("PRO", appel.id),
    motif,
    periode: appel.periode,
    dateDebutOccupation: memePeriode(ctx.bail.date_debut) ? ctx.bail.date_debut : appel.periode,
    dateFinOccupation: memePeriode(ctx.bail.date_fin) ? ctx.bail.date_fin : null,
    loyerHcPlein: base(appel.base_loyer_hc),
    chargesPleines: base(appel.base_charges),
    loyerHcProrate: appel.loyer_hc === null ? null : Number(appel.loyer_hc),
    chargesProratees: appel.charges === null ? null : Number(appel.charges),
    montantDu: Number(appel.montant_du),
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
    // Phase 3 (C64) : le mois en toutes lettres, comme l'avis d'échéance et la quittance (« Décompte de prorata — octobre 2025 »).
    titreGed: `Décompte de prorata — ${moisEnToutesLettres(appel.periode)}`,
    nomFichier: `prorata-${appel.periode.slice(0, 7)}`,
    liens: [
      { entite: "bail", entiteId: appel.bail_id },
      ...liensLocataires(ctx),
    ],
  };
}
