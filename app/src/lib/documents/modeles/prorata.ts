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
    <table><tbody><tr class="total"><td><b>Total dû pour la période</b></td><td class="d"><b>${f.montant(
      d.montantDu,
      "total dû"
    )}</b></td></tr></tbody></table>
    <div class="mentions">
      <p>Le prorata est calculé au réel du mois considéré, au centime le plus proche. Ce décompte
      accompagne l'avis d'échéance ou la quittance du terme concerné.</p>
    </div>
    ${faitA(f, d.exp.ville, new Date().toISOString())}
  `;
  return assemblerPage({
    f,
    titreDocument: "Décompte de prorata",
    nomPied: "Décompte de prorata",
    reference: d.reference,
    corps,
  });
}

export async function assemblerProrata(
  supabase: SupabaseClient,
  orgId: string,
  appelId: string
): Promise<Assemblage> {
  const { data: appel } = await supabase
    .from("appels_loyer")
    .select("id, bail_id, periode, loyer_hc, charges, montant_du, prorata")
    .eq("id", appelId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!appel) return { erreur: "Appel de loyer introuvable." };
  if (!appel.prorata) return { erreur: "Cet appel est un mois plein : pas de prorata à décompter." };

  const ctx = await chargerContexteBail(supabase, orgId, appel.bail_id);
  if ("erreur" in ctx) return ctx;

  const memePeriode = (iso: string | null) => iso && iso.slice(0, 7) === appel.periode.slice(0, 7);
  const motif = memePeriode(ctx.bail.date_debut) ? "entrée" : "sortie";

  const f = new Fusion();
  const document = construireProrata({
    reference: referenceCourte("PRO", appel.id),
    motif,
    periode: appel.periode,
    dateDebutOccupation: motif === "entrée" ? ctx.bail.date_debut : appel.periode,
    dateFinOccupation: motif === "sortie" ? ctx.bail.date_fin : null,
    loyerHcPlein: ctx.bail.loyer_hc === null ? null : Number(ctx.bail.loyer_hc),
    chargesPleines: ctx.bail.charges === null ? null : Number(ctx.bail.charges),
    loyerHcProrate: appel.loyer_hc === null ? null : Number(appel.loyer_hc),
    chargesProratees: appel.charges === null ? null : Number(appel.charges),
    montantDu: Number(appel.montant_du),
    bailleurNom: nomsBailleurs(f, ctx.bailleurs),
    locatairesNoms: nomsLocataires(f, ctx.locataires),
    logementAdresse: adresseLogement(ctx.lot, ctx.bien),
    referenceBail: referenceCourte("BAIL", ctx.bail.id),
    exp: expediteur(ctx),
    f,
  });

  return {
    document,
    titreGed: `Décompte de prorata — ${appel.periode.slice(0, 7)}`,
    nomFichier: `prorata-${appel.periode.slice(0, 7)}`,
    liens: [
      { entite: "bail", entiteId: appel.bail_id },
      ...(ctx.bail.locataire_principal
        ? [{ entite: "personne" as const, entiteId: ctx.bail.locataire_principal }]
        : []),
    ],
  };
}
