// 18 — Quittance de loyer · 19 — Reçu de paiement partiel (même épreuve à
// deux visages : `quittances.est_quittance` décide du titre et des mentions).

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

export type DonneesQuittance = {
  estQuittance: boolean;
  reference: string;
  dateEmission: string;
  periode: string; // premier jour du mois (ISO)
  loyerHc: number | null;
  charges: number | null;
  montant: number;
  montantDu: number;
  regularisation: number | null;
  encaissements: { date: string; mode: string | null; montant: number }[];
  bailleurNom: string;
  locatairesNoms: string;
  logementAdresse: string;
  referenceBail: string;
  dateBail: string | null;
  exp: ReturnType<typeof expediteur>;
  f: Fusion;
};

function bornesPeriode(periodeIso: string): { du: string; au: string } {
  const debut = new Date(`${periodeIso.slice(0, 10)}T12:00:00`);
  const fin = new Date(debut);
  fin.setMonth(fin.getMonth() + 1);
  fin.setDate(0);
  return { du: formaterDateFr(debut.toISOString()), au: formaterDateFr(fin.toISOString()) };
}

export function construireQuittance(d: DonneesQuittance) {
  const f = d.f;
  const { du, au } = bornesPeriode(d.periode);
  const titreDoc = d.estQuittance ? "Quittance de loyer" : "Reçu de paiement partiel";
  const solde = d.montantDu - d.montant;

  const lignes: string[][] = [
    ["Loyer hors charges", f.montant(d.loyerHc)],
    ["Provision ou forfait de charges", f.montant(d.charges)],
  ];
  if (d.regularisation) lignes.push(["Régularisation de charges", f.montant(d.regularisation)]);

  const reglement = d.encaissements[0];
  const corps = `
    ${enTete(f, d.exp, { libelle: "Contrat", reference: d.referenceBail, etabliLe: d.dateEmission })}
    ${titre(titreDoc, `Période du ${du} au ${au}`, ["Article 21 de la loi n° 89-462 du 6 juillet 1989"])}
    ${cartouches([
      ["Bailleur", `<div>${d.bailleurNom}</div>`],
      ["Locataire", `<div>${d.locatairesNoms}</div>`],
      ["Logement loué", `<div>${f.champ(d.logementAdresse, "adresse complète, étage, porte")}</div>`],
      ["Bail", `Réf. ${f.champ(d.referenceBail, "référence du bail")} du ${f.date(d.dateBail)}`],
    ])}
    <p>Je soussigné(e) ${d.bailleurNom}, bailleur du logement désigné ci-dessus, déclare avoir reçu de
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
        ? `<table><tbody><tr class="total"><td><b>Total du terme</b></td><td class="d"><b>${f.montant(d.montantDu, "total du terme")}</b></td></tr></tbody></table>`
        : ""
    }
    <p>Règlement reçu le ${f.date(reglement?.date)} par ${f.champ(reglement?.mode, "virement, chèque, espèces…")}.</p>
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

  const ctx = await chargerContexteBail(supabase, orgId, q.bail_id);
  if ("erreur" in ctx) return ctx;

  const [{ data: appel }, { data: encaissements }, { data: regul }] = await Promise.all([
    supabase
      .from("appels_loyer")
      .select("periode, loyer_hc, charges, montant_du")
      .eq("id", q.appel_id)
      .maybeSingle(),
    supabase
      .from("encaissements")
      .select("date_paiement, mode, montant")
      .eq("bail_id", q.bail_id)
      .order("date_paiement", { ascending: false })
      .limit(1),
    supabase
      .from("regularisations_charges")
      .select("ecart, date_emission")
      .eq("bail_id", q.bail_id)
      .order("annee", { ascending: false })
      .limit(1),
  ]);
  if (!appel) return { erreur: "Appel de loyer introuvable pour cette quittance." };

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
    // La régularisation n'apparaît que si elle est émise sur la période
    regularisation:
      regul?.[0]?.date_emission && regul[0].date_emission.slice(0, 7) === appel.periode.slice(0, 7)
        ? Number(regul[0].ecart)
        : null,
    encaissements: (encaissements ?? []).map((e) => ({
      date: e.date_paiement,
      mode: e.mode,
      montant: Number(e.montant),
    })),
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
    titreGed: `${q.est_quittance ? "Quittance" : "Reçu"} — ${moisLong}`,
    nomFichier: `${q.est_quittance ? "quittance" : "recu"}-${appel.periode.slice(0, 7)}`,
    liens: [
      { entite: "bail", entiteId: q.bail_id },
      ...(ctx.bail.locataire_principal
        ? [{ entite: "personne" as const, entiteId: ctx.bail.locataire_principal }]
        : []),
    ],
  };
}
