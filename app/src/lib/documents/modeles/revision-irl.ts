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
  // Signature préenregistrée de l'émetteur (data-URI) — null : zone vierge
  signatureImg?: string | null;
  f: Fusion;
};

export function construireRevisionIrl(d: DonneesRevisionIrl) {
  const f = d.f;
  const variation =
    d.irlReference && d.irlNouveau
      ? (((d.irlNouveau - d.irlReference) / d.irlReference) * 100).toLocaleString("fr-FR", {
          maximumFractionDigits: 2,
        }) + " %"
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
    ${section("Nouveau montant")}
    ${tableau(
      [{ libelle: "Nature" }, { libelle: "Montant", droite: true }],
      [
        ["Loyer hors charges avant révision", f.montant(d.ancienLoyer)],
        [`<b>Loyer hors charges révisé, à compter du ${f.date(d.dateEffet)}</b>`, `<b>${f.montant(d.nouveauLoyer)}</b>`],
        [`${libelleCharges(d.chargesMode)} (inchangé)`, f.montant(d.charges, "montant inchangé")],
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

  const f = new Fusion();
  const document = construireRevisionIrl({
    reference: referenceCourte("IRL", r.id),
    dateEffet: r.date_effet,
    dateEcheance: r.date_echeance,
    dateDemande: r.date_demande,
    trimestreNouveau: r.irl_trimestre,
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
    titreGed: `Révision IRL — effet au ${r.date_effet}`,
    nomFichier: `revision-irl-${r.date_effet}`,
    liens: [
      { entite: "bail", entiteId: r.bail_id },
      ...liensLocataires(ctx),
    ],
  };
}
