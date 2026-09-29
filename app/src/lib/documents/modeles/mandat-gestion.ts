// Mandat de gestion locative (loi n° 70-9 du 2 janvier 1970 dite « Hoguet »,
// décret n° 72-678 du 20 juillet 1972) : le propriétaire (mandant) confie à
// l'agence (mandataire) la gestion de lots, chacun avec son taux d'honoraires
// (une ligne de mandat par lot). Acte des parties : cadres de signature,
// jamais de signature d'émetteur. Cible : le mandat.
// Audit 29/09 : un mandant PERSONNE PHYSIQUE est un consommateur. Le mandat
// porte alors le droit de rétractation de 14 jours (contrat conclu à distance
// ou hors établissement, art. L221-18 du code de la consommation) et son
// formulaire type, le médiateur de la consommation (art. L612-1 et L616-1) et
// l'information sur la reconduction tacite (art. L215-1).

import type { SupabaseClient } from "@supabase/supabase-js";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";
import {
  Fusion,
  assemblerPage,
  cadreSignature,
  cartouches,
  echapper,
  enTete,
  eur,
  faitA,
  section,
  tableau,
  titre,
} from "../gabarit";
import {
  adressePersonne,
  expediteur,
  nomPersonne,
  referenceCourte,
  type PersonneDocument,
} from "./communs";
import type { Assemblage, LienDocument } from "./index";
import { estPersonnePhysique } from "@/lib/qualite-bailleur";

// Mentions dues au mandant consommateur — exportées pour les tests.
export function mentionsConsommateur(
  f: Fusion,
  numero: string,
  mandataire: { nom: string; adresse?: string | null; email?: string | null; mediateur?: string | null }
): string {
  return `
    ${section(`${numero} — Informations du mandant consommateur`)}
    <p><b>Droit de rétractation.</b> Lorsque le présent mandat est conclu à distance ou hors
    établissement, le mandant dispose d'un délai de <b>quatorze jours</b> à compter de sa
    conclusion pour exercer son droit de rétractation, sans avoir à motiver sa décision ni à
    supporter d'autres coûts que ceux prévus par la loi (articles L221-18 et suivants du code de
    la consommation). Il l'exerce en adressant au mandataire, avant l'expiration de ce délai, le
    formulaire de rétractation reproduit en annexe ou toute autre déclaration dénuée d'ambiguïté
    exprimant sa volonté de se rétracter. Si le mandant demande expressément que l'exécution du
    mandat commence avant la fin de ce délai, il reste redevable, en cas de rétractation, des
    honoraires correspondant au service fourni jusqu'à la communication de sa décision
    (article L221-25).</p>
    <p><b>Médiation de la consommation.</b> En cas de litige non résolu par une réclamation écrite
    préalable auprès du mandataire, le mandant peut recourir gratuitement au médiateur de la
    consommation dont relève le mandataire (articles L612-1 et L616-1 du code de la
    consommation) — nom, adresse et site internet du médiateur :
    ${
      mandataire.mediateur?.trim()
        ? echapper(mandataire.mediateur.trim())
        : // Aucune fiche d'agence ne porte encore son médiateur : un blanc à
          // compléter à la main, qui ne bloque pas la génération (un champ de
          // fusion vide refuserait tout mandat de particulier).
          "………………………………………………………………………………"
    }.</p>
    <p><b>Reconduction tacite.</b> Conformément à l'article L215-1 du code de la consommation, le
    mandataire informe le mandant par écrit, par lettre nominative ou courrier électronique
    dédiés, au plus tôt trois mois et au plus tard un mois avant le terme de la période
    autorisant le rejet de la reconduction, de la possibilité de ne pas reconduire le mandat ;
    cette information mentionne, dans un encadré apparent, la date limite de non-reconduction.
    À défaut, le mandant peut mettre gratuitement un terme au mandat, à tout moment à compter de
    la date de reconduction.</p>

    <div class="encadre">
      <p class="etiquette">Annexe — Formulaire de rétractation</p>
      <p>(Veuillez compléter et renvoyer le présent formulaire uniquement si vous souhaitez vous
      rétracter du contrat.)</p>
      <p>À l'attention de ${echapper(mandataire.nom)}, ${f.champ(mandataire.adresse, "adresse du mandataire")}${
        mandataire.email ? `, ${echapper(mandataire.email)}` : ""
      } :</p>
      <p>Je/Nous (*) vous notifie/notifions (*) par la présente ma/notre (*) rétractation du contrat
      pour la prestation de services ci-dessous : mandat de gestion locative.<br/>
      Commandé le (*)/reçu le (*) : ……………………<br/>
      Nom du (des) consommateur(s) : ……………………<br/>
      Adresse du (des) consommateur(s) : ……………………<br/>
      Signature du (des) consommateur(s) (uniquement en cas de notification du présent formulaire
      sur papier) : ……………………<br/>
      Date : ……………………</p>
      <p>(*) Rayez la mention inutile.</p>
    </div>`;
}

type BienLigne = {
  nom: string;
  address_line1: string | null;
  postal_code: string | null;
  city: string | null;
};
type LotLigne = { id: string; nom: string; bien: UnOuPlusieurs<BienLigne> };
type LigneMandat = {
  taux_honoraires: number;
  date_debut: string;
  lot: UnOuPlusieurs<LotLigne>;
};

export async function assemblerMandatGestion(
  supabase: SupabaseClient,
  orgId: string,
  mandatId: string
): Promise<Assemblage> {
  const [{ data: mandat }, { data: organisation }] = await Promise.all([
    supabase
      .from("mandats")
      .select(
        "id, person_id, etat, date_rapport, seuil_delegation, duree_mois, preavis_mois, date_debut"
      )
      .eq("id", mandatId)
      .eq("organization_id", orgId)
      .maybeSingle(),
    supabase
      .from("organizations")
      .select(
        "name, type, address_line1, postal_code, city, telephone, email_contact, siret, carte_pro, garantie_financiere"
      )
      .eq("id", orgId)
      .maybeSingle(),
  ]);
  if (!mandat) return { erreur: "Mandat introuvable." };
  if (!organisation) return { erreur: "Organisation introuvable." };

  const [{ data: mandantBrut }, { data: lignesBrutes }] = await Promise.all([
    supabase
      .from("persons")
      .select("id, nom, prenom, email, telephone, address_line1, postal_code, city, qualite")
      .eq("id", mandat.person_id)
      .maybeSingle(),
    // Les lignes EN COURS du mandat : chaque lot confié avec son taux
    supabase
      .from("mandat_lignes")
      .select(
        `taux_honoraires, date_debut,
         lot:lots!mandat_lignes_lot_meme_org_fk(id, nom,
           bien:biens!lots_bien_id_fkey(nom, address_line1, postal_code, city))`
      )
      .eq("mandat_id", mandatId)
      .eq("organization_id", orgId)
      .is("date_fin", null)
      .order("date_debut", { ascending: true }),
  ]);
  if (!mandantBrut) return { erreur: "Mandant introuvable." };
  const mandant = mandantBrut as Pick<
    PersonneDocument,
    "id" | "nom" | "prenom" | "email" | "telephone" | "address_line1" | "postal_code" | "city" | "qualite"
  >;
  const lignes = ((lignesBrutes ?? []) as unknown as LigneMandat[])
    .map((l) => ({ taux_honoraires: l.taux_honoraires, date_debut: l.date_debut, lot: premier(l.lot) }))
    .filter((l): l is { taux_honoraires: number; date_debut: string; lot: LotLigne } => Boolean(l.lot));

  const f = new Fusion();
  const exp = expediteur({ organisation });
  const reference = referenceCourte("MAND", mandat.id);
  // Défaut agence : 500 € (fondation mandats — seuil null = défaut surchargeable)
  const seuilDelegation = mandat.seuil_delegation === null ? 500 : Number(mandat.seuil_delegation);
  const jourRapport = mandat.date_rapport === 1 ? "1er" : String(mandat.date_rapport);

  const nomMandant = f.champ(nomPersonne(mandant), "nom et prénom(s), ou dénomination du mandant");
  // Mandant consommateur (personne physique ou indivision de personnes
  // physiques) : mentions du code de la consommation, section insérée avant
  // la reddition de comptes.
  const consommateur = estPersonnePhysique(mandant.qualite, mandant.prenom);
  const num = consommateur
    ? { reddition: "VI", signatures: "VII" }
    : { reddition: "V", signatures: "VI" };
  const libelleLot = (lot: LotLigne): string => {
    const bien = premier(lot.bien);
    const adresse = bien
      ? [bien.address_line1, [bien.postal_code, bien.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")
      : null;
    return [lot.nom, adresse].filter(Boolean).join(" — ");
  };

  const lignesTableau = lignes.map((l) => [
    echapper(libelleLot(l.lot)),
    `${Number(l.taux_honoraires).toLocaleString("fr-FR")} %`,
    f.date(l.date_debut),
  ]);

  const corps = `
    ${enTete(f, exp, { libelle: "Mandat", reference, etabliLe: new Date().toISOString() })}
    ${titre("Mandat de gestion locative", "Contrat de mandat entre le mandant et le mandataire", [
      "Loi n° 70-9 du 2 janvier 1970 (loi Hoguet) — décret n° 72-678 du 20 juillet 1972",
    ])}

    ${section("I — Les parties")}
    ${cartouches([
      [
        "Le mandant",
        `<div>${nomMandant}</div>
         <div>${f.champ(adressePersonne(mandant as PersonneDocument), "domicile ou siège social du mandant")}</div>
         <div>${[mandant.email, mandant.telephone].filter(Boolean).map((v) => echapper(String(v))).join(" · ") || "—"}</div>`,
      ],
      [
        "Le mandataire",
        `<div><b>${echapper(organisation.name)}</b></div>
         <div>${f.champ(exp.adresse, "adresse du mandataire")}</div>
         <div>SIRET : ${f.champ(organisation.siret, "siret")}</div>`,
      ],
    ])}
    <p>Le mandataire est titulaire de la carte professionnelle « Gestion immobilière » :
    ${f.champ(organisation.carte_pro, "numéro de carte et CCI de délivrance")}. Il justifie d'une
    garantie financière au titre de son activité de gestion :
    ${f.champ(organisation.garantie_financiere, "organisme et montant de la garantie financière")}.</p>
    <p>Le présent mandat est inscrit au registre des mandats du mandataire sous le
    n° ${echapper(reference)}.</p>

    ${section("II — Objet du mandat")}
    <p>Le mandant confie au mandataire, qui accepte, la <b>gestion locative</b> des lots désignés
    ci-dessous, dont il est propriétaire, aux conditions d'honoraires suivantes :</p>
    ${
      lignesTableau.length > 0
        ? tableau(
            [
              { libelle: "Lot" },
              { libelle: "Taux d'honoraires % TTC", droite: true },
              { libelle: "Depuis le", droite: true },
            ],
            lignesTableau
          )
        : `<p>${f.champ(null, "désignation des lots confiés en gestion")}</p>`
    }
    <p class="mentions">Les honoraires de gestion sont calculés au taux ci-dessus sur les sommes
    encaissées pour le compte du mandant, et prélevés lors de chaque reddition de comptes.</p>

    ${section("III — Missions du mandataire")}
    <p>Au titre du présent mandat, le mandataire est chargé, pour le compte du mandant, de :</p>
    <p>— <b>encaisser les loyers</b>, charges et accessoires dus par les locataires, et en
    poursuivre le recouvrement amiable ;<br/>
    — <b>délivrer les quittances</b> et reçus correspondants ;<br/>
    — <b>rendre compte de sa gestion</b> le ${jourRapport} de chaque mois ;<br/>
    — <b>faire exécuter les menues réparations</b> et l'entretien courant des lots, dans la limite
    d'un seuil de délégation de <b>${eur(seuilDelegation)}</b> par intervention ; au-delà, l'accord
    préalable du mandant est requis, sauf urgence mettant en péril le bien ou la sécurité des
    occupants.</p>

    ${section("IV — Durée et dénonciation")}
    <p>Le présent mandat est consenti pour une durée de <b>${mandat.duree_mois} mois</b> à compter
    du ${f.date(mandat.date_debut, "date de prise d'effet")}. Il se renouvelle ensuite par
    <b>reconduction tacite</b> par périodes d'un an, sans que sa durée totale puisse excéder dix
    ans. Chaque partie peut le dénoncer à tout moment, par lettre recommandée avec avis de
    réception, en respectant un préavis de <b>${mandat.preavis_mois} mois</b>.</p>

    ${consommateur ? mentionsConsommateur(f, "V", { nom: organisation.name, adresse: exp.adresse, email: organisation.email_contact }) : ""}

    ${section(`${num.reddition} — Reddition de comptes`)}
    <p>Le mandataire rend compte de sa gestion <b>chaque mois</b> : il remet au mandant un relevé
    détaillant les sommes encaissées et décaissées pour son compte, ses honoraires, et le solde qui
    lui revient, dont le versement accompagne le relevé. Les fonds détenus pour le compte du
    mandant sont couverts par la garantie financière désignée à l'article I.</p>

    <div class="bloc-signataires">
    ${section(`${num.signatures} — Date et signatures`)}
    ${faitA(f, exp.ville, new Date().toISOString(), ", en deux exemplaires originaux, dont un est remis au mandant.")}
    <div class="signatures">
      ${cadreSignature("Le mandant", `${nomMandant}<br/>Signature précédée de la mention « Bon pour mandat »`)}
      ${cadreSignature("Le mandataire", `${echapper(organisation.name)}<br/>Signature précédée de la mention « Mandat accepté »`)}
    </div>
    </div>
  `;

  const document = assemblerPage({
    f,
    titreDocument: "Mandat de gestion locative",
    nomPied: "Mandat de gestion locative",
    reference,
    corps,
  });

  // Un lien « lot » par lot du mandat (dédoublonné), en plus du mandat et du mandant
  const lotIds = [...new Set(lignes.map((l) => l.lot.id))];
  const liens: LienDocument[] = [
    { entite: "mandat", entiteId: mandat.id },
    { entite: "personne", entiteId: mandant.id },
    ...lotIds.map((id) => ({ entite: "lot" as const, entiteId: id })),
  ];

  return {
    document,
    titreGed: `Mandat de gestion — ${nomPersonne(mandant) ?? mandant.nom}`,
    nomFichier: `mandat-gestion-${reference.toLowerCase()}`,
    liens,
  };
}
