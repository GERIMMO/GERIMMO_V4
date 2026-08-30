// 17 — Avis d'échéance : le terme à venir, son détail et les modalités de
// règlement. Cible : l'appel de loyer.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Fusion,
  assemblerPage,
  cartouches,
  enTete,
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

export type DonneesAvisEcheance = {
  reference: string;
  periode: string;
  dateEcheance: string | null;
  loyerHc: number | null;
  charges: number | null;
  montantDu: number;
  prorata: boolean;
  bailleurNom: string;
  locatairesNoms: string;
  logementAdresse: string;
  referenceBail: string;
  dateBail: string | null;
  exp: ReturnType<typeof expediteur>;
  f: Fusion;
};

export function construireAvisEcheance(d: DonneesAvisEcheance) {
  const f = d.f;
  const debut = new Date(`${d.periode.slice(0, 10)}T12:00:00`);
  const fin = new Date(debut);
  fin.setMonth(fin.getMonth() + 1);
  fin.setDate(0);
  const du = formaterDateFr(debut.toISOString());
  const au = formaterDateFr(fin.toISOString());

  const corps = `
    ${enTete(f, d.exp, { libelle: "Contrat", reference: d.referenceBail, etabliLe: new Date().toISOString() })}
    ${titre("Avis d'échéance", `Période du ${du} au ${au}`, [
      "Le présent avis ne constitue ni une quittance ni un reçu.",
    ])}
    ${cartouches([
      ["Bailleur", `<div>${d.bailleurNom}</div>`],
      ["Locataire", `<div>${d.locatairesNoms}</div>`],
      ["Logement loué", `<div>${f.champ(d.logementAdresse, "adresse complète, étage, porte")}</div>`],
      ["Bail", `Réf. ${f.champ(d.referenceBail, "référence du bail")} du ${f.date(d.dateBail)}`],
    ])}
    <p>Nous vous informons que le terme désigné ci-dessous arrive à échéance
    le ${f.date(d.dateEcheance)}. Le règlement est attendu à cette date.</p>
    ${section("Détail du terme")}
    ${tableau(
      [{ libelle: "Nature" }, { libelle: "Montant", droite: true }],
      [
        [`Loyer hors charges${d.prorata ? " (au prorata de la période d'occupation)" : ""}`, f.montant(d.loyerHc)],
        ["Provision ou forfait de charges", f.montant(d.charges)],
      ]
    )}
    <table><tbody><tr class="total"><td><b>Total à régler</b></td><td class="d"><b>${f.montant(
      d.montantDu,
      "total à régler"
    )}</b></td></tr></tbody></table>
    ${section("Modalités de règlement")}
    <p>Mode de règlement : ${f.champ(null, "virement, prélèvement, chèque…")} —
    Lieu de paiement : ${f.champ(null, "domicile du bailleur, virement…")}.</p>
    <p>Coordonnées bancaires : ${f.champ(null, "IBAN, facultatif")}.</p>
    <div class="mentions">
      <p>En cas de difficulté de paiement, rapprochez-vous sans attendre de votre gestionnaire :
      des solutions amiables existent (délais, aides au logement).</p>
    </div>
    ${faitA(f, d.exp.ville, new Date().toISOString())}
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

  const f = new Fusion();
  const document = construireAvisEcheance({
    reference: referenceCourte("AVIS", appel.id),
    periode: appel.periode,
    dateEcheance: appel.date_echeance,
    loyerHc: appel.loyer_hc === null ? null : Number(appel.loyer_hc),
    charges: appel.charges === null ? null : Number(appel.charges),
    montantDu: Number(appel.montant_du),
    prorata: Boolean(appel.prorata),
    bailleurNom: nomsBailleurs(f, ctx.bailleurs),
    locatairesNoms: nomsLocataires(f, ctx.locataires),
    logementAdresse: adresseLogement(ctx.lot, ctx.bien),
    referenceBail: referenceCourte("BAIL", ctx.bail.id),
    dateBail: ctx.bail.date_debut,
    exp: expediteur(ctx),
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
      ...(ctx.bail.locataire_principal
        ? [{ entite: "personne" as const, entiteId: ctx.bail.locataire_principal }]
        : []),
    ],
  };
}
