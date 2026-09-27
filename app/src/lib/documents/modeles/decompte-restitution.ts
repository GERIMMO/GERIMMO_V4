// Décompte de restitution du dépôt de garantie (article 22 de la loi du
// 6 juillet 1989) : dépôt reçu, impayés imputés, retenues avec décote de
// vétusté, solde de tout compte. Cible : le bail (une restitution par bail).
// Document émis seul par l'organisation — signature de l'émetteur.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Fusion,
  assemblerPage,
  blocSignatureEmetteur,
  cartouches,
  echapper,
  enTete,
  eur,
  faitA,
  montantEnLettres,
  section,
  tableau,
  titre,
} from "../gabarit";
import {
  chargerContexteBail,
  expediteur,
  nomPersonne,
  nomsBailleurs,
  nomsLocataires,
  adresseLogement,
  referenceCourte,
  signatureOrganisation,
  liensLocataires,
} from "./communs";
import type { Assemblage } from "./index";

type Retenue = {
  libelle: string;
  cout: number;
  duree_vie_ans: number | null;
  age_ans: number | null;
  montant_retenu: number;
  sans_justificatif: boolean;
  justificatif_document: string | null;
};

// Fin du délai légal : la remise des clés décalée du délai en mois, BORNÉE au
// dernier jour du mois d'arrivée — comme la base (restitution_date_limite,
// `date + interval 'n months'`) et l'alerte. Audit du 27/09 : setMonth
// débordait (31/01 + 1 mois → 03/03 au lieu du 28/02), le PDF promettait un
// délai légal plus long que le vrai (wiki « Restitution du dépôt de garantie »).
export function finDelaiRestitution(dateRemise: string, delaiMois: number): string {
  const [a, m, j] = dateRemise.slice(0, 10).split("-").map(Number);
  const cible = new Date(Date.UTC(a, m - 1 + delaiMois, 1));
  const dernierJour = new Date(Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth() + 1, 0)).getUTCDate();
  cible.setUTCDate(Math.min(j, dernierJour));
  return cible.toISOString().slice(0, 10);
}

// Colonne « Justificatif » d'une retenue (audit du 27/09) : « sur demande »
// est réservé aux pièces réellement déposées ; sans pièce, on l'écrit (wiki
// « Restitution du dépôt de garantie », RM-2.4.6 et RM-2.7.2).
export function libelleJustificatifRetenue(r: { sans_justificatif: boolean; justificatif_document: string | null }): string {
  return r.justificatif_document && !r.sans_justificatif ? "Déposé — sur demande" : "Non fourni";
}

// La décote de vétusté telle qu'appliquée : retenue = coût × (durée − âge) / durée
function vetusteAppliquee(r: Retenue): string {
  if (!r.duree_vie_ans) return "Aucune — coût retenu en intégralité";
  const cout = Number(r.cout);
  const decote = cout > 0 ? Math.round((1 - Number(r.montant_retenu) / cout) * 100) : 0;
  return `${r.age_ans ?? 0}/${r.duree_vie_ans} ans — décote ${decote.toLocaleString("fr-FR")} %`;
}

function moisLong(periode: string): string {
  const [a, m] = periode.slice(0, 7).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, 15)).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
}

export async function assemblerDecompteRestitution(
  supabase: SupabaseClient,
  orgId: string,
  bailId: string
): Promise<Assemblage> {
  const ctx = await chargerContexteBail(supabase, orgId, bailId);
  if ("erreur" in ctx) return ctx;

  const { data: restitution } = await supabase
    .from("restitutions")
    .select(
      "id, date_remise_cles, delai_mois, depot, impayes, trop_percu, statut, solde, date_emission, sans_edl_entree"
    )
    .eq("bail_id", bailId)
    .maybeSingle();
  if (!restitution) return { erreur: "Aucune restitution démarrée pour ce bail." };

  const { data: lignes } = await supabase
    .from("retenues")
    .select(
      "libelle, cout, duree_vie_ans, age_ans, montant_retenu, sans_justificatif, justificatif_document"
    )
    .eq("restitution_id", restitution.id)
    .order("created_at");
  const retenues = (lignes ?? []) as Retenue[];

  const depot = Number(restitution.depot);
  const impayes = Number(restitution.impayes);
  const tropPercu = Number(restitution.trop_percu ?? 0);

  // Détail période par période (RM-2.7.1) : termes restés dus et soldes de
  // régularisation, tels qu'ils figurent aux comptes du bail.
  const [{ data: etat }, { data: regularisations }] = await Promise.all([
    supabase.rpc("etat_loyers_bail", { p_bail: bailId }),
    supabase.from("regularisations_charges").select("annee, ecart").eq("bail_id", bailId).order("annee"),
  ]);
  const termesDus = ((etat ?? []) as { periode: string; montant_du: number; montant_couvert: number }[])
    .filter((t) => Number(t.montant_couvert) < Number(t.montant_du));
  const soldesRegul = ((regularisations ?? []) as { annee: number; ecart: number }[]).filter((r) => Number(r.ecart) !== 0);
  const totalRetenues = retenues.reduce((s, r) => s + Number(r.montant_retenu), 0);
  const finalise = restitution.statut === "finalise";
  // Solde arrêté à la finalisation ; avant, le projeté sur les retenues saisies
  const solde =
    restitution.solde !== null ? Number(restitution.solde) : depot - impayes + tropPercu - totalRetenues;
  const libelleSolde = solde < 0 ? "Créance restant due par le locataire" : "Solde à restituer au locataire";
  const loyerHc = ctx.bail.loyer_hc === null ? null : Number(ctx.bail.loyer_hc);

  const f = new Fusion();
  const exp = expediteur(ctx);

  const corps = `
    ${enTete(f, exp, {
      libelle: "Restitution",
      reference: referenceCourte("REST", restitution.id),
      etabliLe: restitution.date_emission ?? new Date().toISOString(),
    })}
    ${titre("Décompte de restitution", "Dépôt de garantie", [
      "Article 22 de la loi n° 89-462 du 6 juillet 1989",
    ])}
    ${cartouches([
      ["Logement", `<div>${f.champ(adresseLogement(ctx.lot, ctx.bien), "adresse complète, étage, porte")}</div>`],
      [ctx.locataires.length > 1 ? "Locataires" : "Locataire", `<div>${nomsLocataires(f, ctx.locataires)}</div>`],
      ["Remise des clés", `Le ${f.date(restitution.date_remise_cles)}`],
      [
        "Délai légal",
        `${restitution.delai_mois} mois — au plus tard le ${f.date(finDelaiRestitution(restitution.date_remise_cles, Number(restitution.delai_mois)))}`,
      ],
    ])}
    <p>Le bailleur (${nomsBailleurs(f, ctx.bailleurs)}) arrête comme suit le décompte des sommes
    dues de part et d'autre au terme de la location et le solde du dépôt de garantie${
      finalise && restitution.date_emission ? `, décompte établi le ${f.date(restitution.date_emission)}` : ""
    }.</p>
    ${
      !finalise
        ? `<div class="encadre"><p><b>Projet</b> — le décompte n'est pas encore finalisé : le solde
           ci-dessous est calculé sur les impayés et retenues saisis à ce jour.</p></div>`
        : ""
    }
    ${
      restitution.sans_edl_entree
        ? `<div class="encadre"><p>Sans état des lieux d'entrée signé, aucune retenue pour dégradation
           n'est opposable au locataire : le dépôt est restitué intégralement, déduction faite des
           seuls impayés.</p></div>`
        : ""
    }

    ${section("Retenues sur le dépôt")}
    ${
      retenues.length > 0
        ? tableau(
            [
              { libelle: "Libellé" },
              { libelle: "Coût", droite: true },
              { libelle: "Vétusté appliquée" },
              { libelle: "Retenu", droite: true },
              { libelle: "Justificatif" },
            ],
            retenues.map((r) => [
              echapper(r.libelle),
              eur(Number(r.cout)),
              echapper(vetusteAppliquee(r)),
              eur(Number(r.montant_retenu)),
              libelleJustificatifRetenue(r),
            ])
          )
        : `<p>Néant — aucune retenue n'est opérée sur le dépôt de garantie.</p>`
    }

    ${section("Décompte")}
    ${tableau(
      [{ libelle: "Nature" }, { libelle: "Montant", droite: true }],
      [
        ["Dépôt de garantie reçu", eur(depot)],
        [
          soldesRegul.length > 0
            ? "Impayés imputés (loyers, charges et solde de régularisation)"
            : "Impayés imputés (loyers et charges)",
          impayes > 0 ? `− ${eur(impayes)}` : eur(0),
        ],
        ...(tropPercu > 0
          ? [["Trop-perçu restitué au locataire (avance de loyers, régularisation)", `+ ${eur(tropPercu)}`]]
          : []),
        ["Total des retenues", totalRetenues > 0 ? `− ${eur(totalRetenues)}` : eur(0)],
        [`<b>${libelleSolde}</b>`, `<b>${eur(Math.abs(solde))}</b>`],
      ]
    )}
    ${
      termesDus.length > 0 || soldesRegul.length > 0
        ? `${section("Détail des sommes par période")}${tableau(
            [{ libelle: "Période" }, { libelle: "Montant", droite: true }],
            [
              ...termesDus.map((t) => [
                `Terme de ${echapper(moisLong(t.periode))} — reste dû`,
                eur(Number(t.montant_du) - Number(t.montant_couvert)),
              ]),
              ...soldesRegul.map((r) => [
                Number(r.ecart) < 0
                  ? `Régularisation des charges ${r.annee} — complément dû`
                  : `Régularisation des charges ${r.annee} — trop-perçu dû au locataire`,
                Number(r.ecart) < 0 ? eur(-Number(r.ecart)) : `+ ${eur(Number(r.ecart))}`,
              ]),
            ]
          )}<p>État des comptes du bail à la date d'édition ; le décompte ci-dessus retient les montants arrêtés.</p>`
        : ""
    }
    <div class="encadre"><p><b>${libelleSolde} : ${eur(Math.abs(solde))}</b><br/>
    soit ${echapper(montantEnLettres(Math.abs(solde)))}.</p></div>

    ${section("Mentions")}
    <div class="mentions">
      <p>Le dépôt de garantie est restitué dans un délai maximal de ${restitution.delai_mois} mois à
      compter de la remise des clés (un mois lorsque l'état des lieux de sortie est conforme à celui
      d'entrée, deux mois sinon). À défaut de restitution dans le délai imparti, le solde dû au
      locataire est majoré d'une somme égale à 10 % du loyer mensuel hors charges${
        loyerHc !== null ? ` (soit ${eur(loyerHc * 0.1)})` : ""
      } pour chaque période mensuelle commencée en retard (article 22 de la loi du 6 juillet 1989).</p>
      <p>Les justificatifs déposés (devis, facture, constat comparé des états des lieux) sont tenus à la
      disposition du locataire sur demande. Une retenue marquée « Non fourni » n'est appuyée d'aucune pièce.</p>
    </div>
    ${faitA(f, exp.ville, restitution.date_emission ?? new Date().toISOString())}
    ${blocSignatureEmetteur(exp.nom, await signatureOrganisation(supabase, orgId))}
  `;

  const nomsLocatairesTexte =
    ctx.locataires.map((l) => nomPersonne(l)).filter(Boolean).join(", ") || "locataire";

  return {
    document: assemblerPage({
      f,
      titreDocument: "Décompte de restitution du dépôt de garantie",
      nomPied: "Décompte de restitution du dépôt de garantie",
      reference: referenceCourte("REST", restitution.id),
      corps,
    }),
    titreGed: `Décompte de restitution — ${nomsLocatairesTexte}`,
    nomFichier: `decompte-restitution-${referenceCourte("REST", restitution.id).toLowerCase()}`,
    liens: [
      { entite: "bail", entiteId: ctx.bail.id },
      ...liensLocataires(ctx),
    ],
  };
}
