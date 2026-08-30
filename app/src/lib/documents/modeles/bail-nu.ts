// 01 — Contrat de location, logement nu, résidence principale.
// Fidèle à l'épreuve (sections I → XII, contrat type du décret 2015-587).
// Blocs conditionnels pilotés par les données réelles (indivision, zone
// tendue, copropriété, colocataires, garants…) ; tout champ absent reste en
// libellé d'épreuve et remonte dans la liste des manquants.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Fusion,
  assemblerPage,
  cadreSignature,
  echapper,
  enTete,
  eur,
  montantEnLettres,
  section,
  sousSection,
  titre,
} from "../gabarit";
import {
  chargerContexteBail,
  expediteur,
  adressePersonne,
  adresseLogement,
  nomPersonne,
  referenceCourte,
  type ContexteBail,
  type PersonneDocument,
} from "./communs";
import type { Assemblage } from "./index";

function periodeConstruction(annee: number | null): string | null {
  if (!annee) return null;
  if (annee < 1949) return "avant 1949";
  if (annee <= 1974) return "1949-1974";
  if (annee <= 1997) return "1975-1997";
  return "après 1997";
}

function blocLocataire(f: Fusion, p: PersonneDocument): string {
  return `<p>${f.champ(nomPersonne(p), "nom et prénom(s)")}, né(e) le ${f.date(p.date_naissance)}
  à ${f.champ(null, "commune de naissance")}, demeurant ${f.champ(adressePersonne(p), "adresse actuelle")}.<br/>
  Adresse électronique : ${f.champ(p.email, "adresse électronique")} — Numéro de téléphone portable :
  ${f.champ(p.telephone, "facultatif")}.</p>`;
}

export function construireBailNu(ctx: ContexteBail, options: { dpeClasse: string | null; f: Fusion }) {
  const f = options.f;
  const exp = expediteur(ctx);
  const referenceBail = referenceCourte("BAIL", ctx.bail.id);
  const bailleurPrincipal = ctx.bailleurs[0] ?? null;
  const indivision = ctx.bailleurs.length > 1;
  const plusieursLocataires = ctx.locataires.length > 1;
  const zoneTendue = ctx.bien.zone_tendue;
  const copro = ctx.bien.copropriete;
  const depot = ctx.bail.depot_garantie === null ? null : Number(ctx.bail.depot_garantie);
  const chargesMode =
    ctx.bail.charges_mode === "forfait"
      ? "forfait de charges"
      : "provisions sur charges avec régularisation annuelle";

  const corps = `
    ${enTete(f, exp, { libelle: "Contrat", reference: referenceBail, etabliLe: new Date().toISOString() })}
    ${titre("Contrat de location", "Logement nu · résidence principale", [
      "Soumis au titre Ier de la loi n° 89-462 du 6 juillet 1989",
      "Contrat type — annexe 1 du décret n° 2015-587 du 29 mai 2015",
    ])}
    <p>Les parties déclarent avoir pris connaissance de la notice d'information relative aux droits
    et obligations des locataires et des bailleurs, annexée au présent contrat et en faisant partie
    intégrante.</p>

    ${section("I — Désignation des parties")}
    <p>Le présent contrat est conclu entre les soussignés :</p>
    ${sousSection("Le bailleur")}
    <p>Nom et prénom(s) ou dénomination : ${f.champ(nomPersonne(bailleurPrincipal), "nom et prénom(s), ou dénomination")}
    — Qualité : ${f.champ(bailleurPrincipal?.qualite, "personne physique, SCI, indivision…")}<br/>
    Domicile ou siège social : ${f.champ(adressePersonne(bailleurPrincipal), "domicile ou siège social")}<br/>
    Adresse électronique : ${f.champ(bailleurPrincipal?.email, "adresse électronique")} — Numéro de
    téléphone portable : ${f.champ(bailleurPrincipal?.telephone, "facultatif")}</p>
    ${
      indivision
        ? `<p>Le logement étant détenu en indivision, sont également parties au présent contrat :
           ${ctx.bailleurs
             .slice(1)
             .map((b) => `${echapper(nomPersonne(b) ?? "")} (${b.quote_part.toLocaleString("fr-FR")} %)`)
             .join(" ; ")}.</p>`
        : ""
    }
    ${
      ctx.organisation.type === "agence"
        ? `<p>Le bailleur est représenté par son mandataire : ${echapper(ctx.organisation.name)},
           ${f.champ(exp.adresse, "adresse du mandataire")} — carte professionnelle :
           ${f.champ(null, "numéro de carte et CCI de délivrance")}.</p>`
        : ""
    }
    ${sousSection(plusieursLocataires ? "Les locataires" : "Le locataire")}
    ${
      ctx.locataires.length > 0
        ? ctx.locataires.map((l) => blocLocataire(f, l)).join("")
        : blocLocataire(f, {
            id: "",
            nom: "",
            prenom: null,
            email: null,
            telephone: null,
            date_naissance: null,
            address_line1: null,
            postal_code: null,
            city: null,
            qualite: null,
          })
    }
    <p>Ci-après dénommé${plusieursLocataires ? "s" : ""} « le locataire ».</p>

    ${section("II — Objet du contrat")}
    <p>Le présent contrat a pour objet la location d'un logement, ainsi déterminé :</p>
    ${sousSection("A. Consistance du logement")}
    <p>Localisation du logement : ${f.champ(adresseLogement(ctx.lot, ctx.bien), "adresse complète, étage, porte")}<br/>
    Identifiant fiscal du logement : ${f.champ(ctx.lot.identifiant_fiscal, "le cas échéant")}<br/>
    Type d'habitat : ${f.champ(
      ctx.bien.type === "appartement" || ctx.bien.type === "immeuble" ? "immeuble collectif" : "individuel",
      "immeuble collectif ou individuel"
    )} — Régime juridique de l'immeuble : ${f.champ(copro ? "copropriété" : "monopropriété", "monopropriété ou copropriété")} —
    Période de construction : ${f.champ(periodeConstruction(ctx.bien.annee_construction), "avant 1949, 1949-1974, après 1974…")}<br/>
    Surface habitable : ${f.champ(
      ctx.lot.surface_m2 !== null ? `${ctx.lot.surface_m2} m²` : null,
      "en m²"
    )} — Nombre de pièces principales : ${f.champ(ctx.lot.pieces, "nombre")}<br/>
    Autres parties du logement : ${f.champ(ctx.lot.description, "cave, grenier, balcon, terrasse, jardin…")}<br/>
    Éléments d'équipement du logement : ${f.champ(null, "cuisine équipée, sanitaires, placards…")}<br/>
    Modalité de production de chauffage : ${f.champ(null, "individuel ou collectif, énergie")} — Modalité de
    production d'eau chaude sanitaire : ${f.champ(null, "individuel ou collectif, énergie")}</p>
    ${sousSection("B. Destination des locaux")}
    <p>Le logement est loué à usage exclusif d'habitation, à titre de résidence principale du locataire.</p>
    ${sousSection("C. Désignation des locaux et équipements accessoires")}
    <p>Locaux et équipements à usage privatif : ${f.champ(null, "cave, parking, garage… avec numéro")}<br/>
    Locaux, parties, équipements et accessoires à usage commun : ${f.champ(null, "hall, ascenseur, local vélos…")}<br/>
    Équipements d'accès aux technologies de l'information et de la communication : ${f.champ(null, "fibre, câble, TNT…")}</p>
    ${
      copro
        ? `<p>L'immeuble étant soumis au statut de la copropriété, le locataire est tenu de respecter le
           règlement de copropriété, dont les extraits relatifs à la destination de l'immeuble, à la
           jouissance et à l'usage des parties privatives et communes lui sont remis en annexe.</p>`
        : ""
    }

    ${section("III — Date de prise d'effet et durée du contrat")}
    <p>Date de prise d'effet : ${f.date(ctx.bail.date_debut)}.<br/>
    Durée du contrat : ${f.champ(
      bailleurPrincipal?.qualite && bailleurPrincipal.qualite !== "Personne physique" ? "six ans" : "trois ans",
      "durée applicable au régime du bail"
    )}, reconduite tacitement aux mêmes conditions à défaut de congé donné dans les formes et délais légaux.</p>
    <p class="mentions">Un contrat d'une durée réduite (au moins un an) n'est possible que si un événement
    précis justifie la reprise du logement par le bailleur : ${f.champ(null, "événement précis justifiant la durée réduite")}.</p>

    ${section("IV — Conditions financières")}
    ${sousSection("A. Loyer")}
    <p>Montant du loyer mensuel hors charges : ${f.montant(ctx.bail.loyer_hc, "montant mensuel")}.<br/>
    Modalité de fixation du loyer : ${f.champ(null, "libre, plafonnement, réévaluation après travaux…")}.</p>
    ${
      zoneTendue
        ? `<div class="encadre"><p><b>Zone tendue.</b> Loyer de référence : ${f.champ(null, "loyer de référence €/m²")} —
           Loyer de référence majoré : ${f.champ(null, "loyer de référence majoré €/m²")}.<br/>
           Complément de loyer : ${f.champ(null, "montant")} — justifié par :
           ${f.champ(null, "caractéristiques justifiant le complément")}.<br/>
           Loyer du dernier locataire : ${f.champ(null, "dernier loyer du précédent locataire")}, versé le
           ${f.champ(null, "date de versement")}, dernière révision le ${f.champ(null, "date de dernière révision")}.</p></div>`
        : ""
    }
    ${
      ctx.bail.revision_irl
        ? `<p>Le loyer est révisé chaque année à la date anniversaire du contrat, dans la limite de la
           variation de l'indice de référence des loyers (IRL). Trimestre de référence :
           ${f.champ(ctx.bail.irl_trimestre, "ex. 2e trimestre 2026")} — valeur de l'indice :
           ${f.champ(null, "valeur de l'indice")}.</p>`
        : `<p>Le contrat ne prévoit pas de clause de révision annuelle du loyer.</p>`
    }
    ${options.dpeClasse === "F" || options.dpeClasse === "G"
      ? `<div class="encadre"><p>Le logement est classé ${options.dpeClasse} : la révision et la majoration
         du loyer sont bloquées tant que cette classe n'est pas améliorée (loi Climat et résilience).</p></div>`
      : ""}
    ${sousSection("B. Charges récupérables")}
    <p>Modalité de règlement : ${f.champ(chargesMode, "provisions avec régularisation, forfait, réel")} —
    Montant mensuel : ${f.montant(ctx.bail.charges, "montant mensuel")}.</p>
    ${sousSection("C. Modalités de paiement")}
    <p>Périodicité : ${f.champ("mensuelle", "mensuelle, trimestrielle…")} — paiement ${f.champ(null, "à échoir ou échu")}
    le ${f.champ(ctx.bail.jour_echeance, "jour du mois")} de chaque mois.<br/>
    Lieu de paiement : ${f.champ(null, "domicile du bailleur, virement…")} — Coordonnées bancaires :
    ${f.champ(null, "IBAN, facultatif")}.<br/>
    Montant total dû à la première échéance : ${f.champ(null, "loyer + charges, montant au prorata")}.</p>

    ${section("V — Travaux")}
    <p>Travaux d'amélioration ou de mise en conformité effectués depuis la fin du dernier contrat :
    ${f.champ(null, "nature des travaux")} — montant : ${f.champ(null, "montant")}.<br/>
    Travaux que le locataire est autorisé à réaliser et contreparties : ${f.champ(null, "nature des travaux, contrepartie financière")}.</p>

    ${section("VI — Garanties")}
    <p>Dépôt de garantie : ${
      depot !== null
        ? `<b>${eur(depot)}</b> (${montantEnLettres(depot)})`
        : f.champ(null, "montant convenu, dans la limite légale applicable")
    }, soit au plus un mois de loyer hors charges.</p>

    ${plusieursLocataires ? `${section("VII — Clause de solidarité")}
    <p>Les locataires sont tenus solidairement et indivisiblement de l'exécution du présent contrat.
    En cas de congé de l'un d'eux, la solidarité s'éteint six mois après la date d'effet du congé, ou
    dès qu'un nouveau locataire le remplace au bail.</p>` : ""}

    ${section(`${plusieursLocataires ? "VIII" : "VII"} — Clause résolutoire`)}
    <p>Le présent contrat sera résilié de plein droit, après commandement resté infructueux, en cas de
    défaut de paiement du loyer, des charges (provisions ou régularisation annuelle) aux termes convenus,
    de non-versement du dépôt de garantie, de défaut d'assurance contre les risques locatifs, ou de
    troubles de voisinage constatés par une décision de justice passée en force de chose jugée.</p>

    ${section(`${plusieursLocataires ? "IX" : "VIII"} — Honoraires de location`)}
    <p>Le cas échéant (article 5-I de la loi du 6 juillet 1989), les honoraires de visite, de
    constitution du dossier et de rédaction du bail sont partagés : part du bailleur
    ${f.champ(null, "montant honoraires bailleur")} — part du locataire ${f.champ(null, "montant honoraires locataire")}
    (plafond : ${f.champ(null, "par m²")} de surface habitable), état des lieux compris.</p>

    ${section(`${plusieursLocataires ? "X" : "IX"} — Autres conditions particulières`)}
    <p>${f.champ(null, "clauses librement convenues entre les parties")}</p>

    ${section(`${plusieursLocataires ? "XI" : "X"} — Annexes`)}
    <p>Sont annexées et jointes au contrat les pièces suivantes :</p>
    <p class="mentions">☐ Le dossier de diagnostic technique (DPE, ERP, et selon l'ancienneté du
    logement : plomb, amiante, électricité, gaz)<br/>
    ☐ La notice d'information relative aux droits et obligations des locataires et des bailleurs<br/>
    ☐ L'état des lieux d'entrée<br/>
    ${copro ? "☐ Les extraits du règlement de copropriété<br/>" : ""}
    ${ctx.garants.length > 0 ? "☐ L'acte de cautionnement<br/>" : ""}
    ☐ Le cas échéant, l'attestation d'assurance contre les risques locatifs<br/>
    ☐ Le cas échéant, la grille de vétusté applicable</p>

    ${section(`${plusieursLocataires ? "XII" : "XI"} — Date et signatures`)}
    <p>Fait à ${f.champ(exp.ville, "commune")}, le ${f.date(new Date().toISOString())}, en autant
    d'exemplaires originaux que de parties.</p>
    <div class="signatures">
      ${cadreSignature("Le bailleur", f.champ(nomPersonne(bailleurPrincipal), "nom et prénom(s), ou dénomination"))}
      ${cadreSignature(
        plusieursLocataires ? "Les locataires" : "Le locataire",
        ctx.locataires.map((l) => echapper(nomPersonne(l) ?? "")).join("<br/>") ||
          f.champ(null, "nom et prénom(s) du ou des locataires")
      )}
      ${ctx.garants.length > 0 ? cadreSignature("La caution", ctx.garants.map((g) => echapper(nomPersonne(g) ?? "")).join("<br/>")) : ""}
    </div>
  `;

  return assemblerPage({
    f,
    titreDocument: "Contrat de location — logement nu",
    nomPied: "Contrat de location — logement nu",
    reference: referenceBail,
    corps,
  });
}

export async function assemblerBailNu(
  supabase: SupabaseClient,
  orgId: string,
  bailId: string
): Promise<Assemblage> {
  const ctx = await chargerContexteBail(supabase, orgId, bailId);
  if ("erreur" in ctx) return ctx;
  if (ctx.bail.type !== "nu") {
    return { erreur: "Ce modèle couvre le bail nu — le meublé et la colocation arrivent avec les modèles 02/03." };
  }
  if (!ctx.bail.locataire_principal) {
    return { erreur: "Renseignez d'abord le locataire principal du bail." };
  }

  const { data: dpe } = await supabase
    .from("diagnostics")
    .select("classe_dpe")
    .eq("lot_id", ctx.lot.id)
    .eq("type", "dpe")
    .is("archived_at", null)
    .order("date_realisation", { ascending: false })
    .limit(1)
    .maybeSingle();

  const f = new Fusion();
  const document = construireBailNu(ctx, { dpeClasse: dpe?.classe_dpe ?? null, f });

  return {
    document,
    titreGed: "Bail nu (généré, à faire signer)",
    nomFichier: `bail-nu-${referenceCourte("BAIL", ctx.bail.id).toLowerCase()}`,
    liens: [
      { entite: "bail", entiteId: ctx.bail.id },
      { entite: "lot", entiteId: ctx.lot.id },
      ...(ctx.bail.locataire_principal
        ? [{ entite: "personne" as const, entiteId: ctx.bail.locataire_principal }]
        : []),
    ],
  };
}
