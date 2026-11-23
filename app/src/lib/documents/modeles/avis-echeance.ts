// 17 — Avis d'échéance : le terme à venir, son détail et les modalités de
// règlement. Cible : l'appel de loyer.

import type { SupabaseClient } from "@supabase/supabase-js";
import { aujourdhuiParis } from "@/lib/ged";
import { resteTermesSuivantsEchus } from "@/lib/appel-email";
import {
  Fusion,
  assemblerPage,
  cartouches,
  enTete,
  eur,
  faitA,
  blocSignatureEmetteur,
  formaterDateFr,
  section,
  tableau,
  titre,
  pointFinal,
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
  interlocuteurLocataire,
  coordonneesBancaires,
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
  /** Ce qui reste dû sur les termes SUIVANTS déjà échus à la date de l'avis (0 si aucun) : un avis établi en rappel. */
  suivantsEchus?: number;
  /** Ce qui est déjà réglé sur CE terme (paiement partiel ; 0 ou absent : rien reçu). */
  dejaRegle?: number;
  lieuPaiement?: string | null;
  iban?: string | null;
  bailleurNom: string;
  locatairesNoms: string;
  logementAdresse: string;
  referenceBail: string;
  dateBail: string | null;
  exp: ReturnType<typeof expediteur>;
  /** Le type de l'espace qui émet l'avis : il n'y a de « gestionnaire » à contacter que dans une agence (C52). */
  typeOrganisation: string | null;
  // Signature préenregistrée de l'émetteur (data-URI) — null : zone vierge
  signatureImg?: string | null;
  /** Jour d'établissement de l'avis (« AAAA-MM-JJ »). Par défaut : le jour de Paris, celui que la base donne à l'appel. */
  jour?: string;
  f: Fusion;
};

export function construireAvisEcheance(d: DonneesAvisEcheance) {
  const f = d.f;
  // « Établi le » et « Fait à … le » : le jour de Paris. `new Date().toISOString()` donnait le jour UTC, donc la veille
  // entre minuit et 2 h à Paris, sur un avis qui annonce une échéance que la base lit, elle, au jour de Paris.
  const jour = d.jour ?? aujourdhuiParis();
  // Audit du 27/09 : période bornée à l'entrée / la sortie d'un terme au prorata.
  const bornes = bornesTerme(d.periode, d.prorata, d.dateBail, d.dateFinBail);
  const du = formaterDateFr(bornes.du);
  const au = formaterDateFr(bornes.au);
  const arriere = Math.max(0, Number(d.arriere ?? 0));
  const suivantsEchus = Math.max(0, Number(d.suivantsEchus ?? 0));
  const autresEchus = Math.round((arriere + suivantsEchus) * 100) / 100;
  // Reprise du lot 38 (C49) : un terme réglé en partie reste à régler, mais l'avis ne réclame que ce qui en reste. Il annonçait
  // le terme entier (« Total du terme 760,00 € ») sans dire les 400 € déjà reçus, alors que l'avis du mois suivant les comptait.
  const dejaRegle = Math.min(Math.max(0, Number(d.dejaRegle ?? 0)), Number(d.montantDu));
  const resteCeTerme = Math.round((Number(d.montantDu) - dejaRegle) * 100) / 100;
  // Reprise du lot 38 (C49) : une échéance passée ne s'annonce plus au présent (« arrive à échéance le 05/09/2026. Le règlement
  // est attendu à cette date », sur un avis établi le 23/11/2026) ; l'avis dit qu'il est établi après l'échéance, en rappel.
  const echu = Boolean(d.dateEcheance) && String(d.dateEcheance).slice(0, 10) < jour;
  const annonce = echu
    ? `<p>Le terme désigné ci-dessous est arrivé à échéance le ${f.date(d.dateEcheance)}. À la date du présent avis,
    ${dejaRegle > 0 ? "il n’est réglé qu’en partie : le détail ci-dessous indique la somme déjà reçue et ce qui reste à régler." : "il n’est pas réglé."}</p>`
    : `<p>Nous vous informons que le terme désigné ci-dessous arrive à échéance
    le ${f.date(d.dateEcheance)}. ${dejaRegle > 0 ? "Le règlement de ce qui en reste est attendu à cette date." : "Le règlement est attendu à cette date."}</p>`;

  const corps = `
    ${enTete(f, d.exp, { libelle: "Contrat", reference: d.referenceBail, etabliLe: jour })}
    ${titre("Avis d'échéance", `Période du ${du} au ${au}`, [
      "Le présent avis ne constitue ni une quittance ni un reçu.",
      ...(echu ? ["Avis établi après la date d'échéance : il rappelle un terme restant à régler."] : []),
    ])}
    ${cartouches([
      ["Bailleur", `<div>${d.bailleurNom}</div>`],
      ["Locataire", `<div>${d.locatairesNoms}</div>`],
      ["Logement loué", `<div>${f.champ(d.logementAdresse, "adresse complète, étage, porte")}</div>`],
      ["Bail", `Réf. ${f.champ(d.referenceBail, "référence du bail")} prenant effet le ${f.date(d.dateBail)}`],
    ])}
    ${annonce}
    ${section("Détail du terme")}
    ${tableau(
      [{ libelle: "Nature" }, { libelle: "Montant", droite: true }],
      [
        [`Loyer hors charges${d.prorata ? " (au prorata de la période d'occupation)" : ""}`, f.montant(d.loyerHc)],
        [libelleCharges(d.chargesMode), f.montant(d.charges)],
      ]
    )}
    ${ligneTotal("Total du terme", f.montant(d.montantDu, "total à régler"))}
    ${
      dejaRegle > 0
        ? `<table class="ligne-total"><tbody><tr><td>Déjà reçu sur ce terme</td><td class="d">${eur(dejaRegle)}</td></tr></tbody></table>
           ${ligneTotal("Reste à régler sur ce terme", eur(resteCeTerme))}`
        : ""
    }
    ${
      // Même règle que l'avis par e-mail (wiki « Quittancement des loyers »,
      // 18/09) : taire une dette en cours laisserait croire au locataire qu'il
      // sera à jour une fois le terme réglé.
      // Phase 3, lot 44 (C49) : le total doit être vrai à la date de l'avis. Un avis établi en rappel d'un terme passé ne
      // comptait que les termes antérieurs : celui d'octobre, établi le 23/11, annonçait 1 120 € « pour solder votre compte »
      // alors que le terme de novembre, échu et impayé, le portait à 1 890,50 €. Les termes suivants déjà échus sont comptés et
      // dits ; un avis sans terme suivant échu garde sa phrase.
      autresEchus > 0
        ? `<p><b>${
            suivantsEchus > 0
              ? `Solde des autres termes échus restant dû : ${eur(autresEchus)}</b> (${
                  arriere > 0 ? `termes antérieurs : ${eur(arriere)} ; termes suivants déjà échus : ${eur(suivantsEchus)}` : "termes suivants déjà échus"
                }).`
              : `Solde antérieur restant dû : ${eur(arriere)}.</b>`
          } Total à régler pour solder votre compte${echu ? " à la date du présent avis" : ""} :
           <b>${eur(autresEchus + resteCeTerme)}</b>.</p>`
        : ""
    }
    ${section("Modalités de règlement")}
    <p>Lieu de paiement prévu au bail : ${f.champ(d.lieuPaiement ?? null, "domicile du bailleur, virement…")}${pointFinal(d.lieuPaiement)}</p>
    <p>Coordonnées bancaires : ${coordonneesBancaires(f, d.lieuPaiement, d.iban)}.</p>
    <div class="mentions">
      <p>En cas de difficulté de paiement, rapprochez-vous sans attendre de votre ${interlocuteurLocataire(d.typeOrganisation)} :
      des solutions amiables existent (délais, aides au logement).</p>
    </div>
    ${faitA(f, d.exp.ville, jour)}
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

// Phase 3 (C49) : un avis annonce un terme à régler (« Le règlement est attendu à cette date »). Sur un terme soldé, il
// réclamerait une somme déjà payée : le document qui atteste le paiement est la quittance.
export const REFUS_TERME_SOLDE =
  "Ce terme est déjà réglé : l’avis d’échéance n’a plus lieu d’être. Pour attester le paiement, préparez la quittance de ce terme.";
export const REFUS_TERME_NON_DU =
  "Ce terme suit la fin du bail : aucun loyer n’est dû pour cette période, l’avis d’échéance n’a pas lieu d’être.";

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

  // L'arriéré : ce qui reste dû sur les termes antérieurs à celui-ci. La même lecture dit si ce terme-ci est soldé (C49) :
  // sans elle, l'avis ne peut ni dire l'arriéré ni écarter un terme déjà payé.
  const { data: etat, error: erreurEtat } = await supabase.rpc("etat_loyers_bail", { p_bail: appel.bail_id });
  if (erreurEtat) return { erreur: "La situation des paiements du bail n’a pas pu être lue. Réessayez avant de générer cet avis." };
  const termes = (etat ?? []) as { appel_id?: string; periode: string; date_echeance?: string | null; montant_du: number; montant_couvert: number; statut?: string }[];
  const ceTerme = termes.find((t) => t.appel_id === appel.id);
  if (ceTerme?.statut === "non_du") return { erreur: REFUS_TERME_NON_DU };
  if (ceTerme && Number(ceTerme.montant_couvert) >= Number(ceTerme.montant_du)) return { erreur: REFUS_TERME_SOLDE };
  const resteDu = (t: (typeof termes)[number]) => Math.max(0, Number(t.montant_du) - Number(t.montant_couvert));
  const arriere = termes
    .filter((t) => t.periode < appel.periode)
    .reduce((s, t) => s + resteDu(t), 0);
  // Phase 3, lot 44 (C49) : les termes SUIVANTS déjà échus à la date de l'avis (échéance passée, comme « impayé » en base),
  // pour que le total « pour solder votre compte » d'un avis établi en rappel soit celui du compte à cette date.
  // Reprise du lot 44 : la règle est partagée avec l'avis par e-mail (resteTermesSuivantsEchus, lib/appel-email).
  const jour = aujourdhuiParis();
  const suivantsEchus = resteTermesSuivantsEchus(termes, appel.periode, jour);

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
    suivantsEchus: Math.round(suivantsEchus * 100) / 100,
    dejaRegle: ceTerme ? Number(ceTerme.montant_couvert) : 0,
    lieuPaiement: ctx.bail.lieu_paiement,
    iban: ctx.organisation.iban ?? null,
    bailleurNom: nomsBailleurs(f, ctx.bailleurs),
    locatairesNoms: nomsLocataires(f, ctx.locataires),
    logementAdresse: adresseLogement(ctx.lot, ctx.bien),
    referenceBail: referenceCourte("BAIL", ctx.bail.id),
    dateBail: ctx.bail.date_debut,
    exp: expediteur(ctx),
    typeOrganisation: ctx.organisation.type,
    signatureImg: await signatureOrganisation(supabase, orgId),
    // Le même jour pour dire l'échéance passée et pour compter les termes échus.
    jour,
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
