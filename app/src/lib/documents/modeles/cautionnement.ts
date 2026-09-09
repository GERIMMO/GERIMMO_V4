// Acte de cautionnement d'un bail d'habitation (art. 2288 et s. du code
// civil, rédaction issue de l'ordonnance n° 2021-1192 ; art. 22-1 de la loi
// du 6 juillet 1989). Un acte par garant : le garant, la forme (solidaire ou
// simple) et le plafond garanti arrivent par `options` — ce sont les choix du
// geste, pas des données du bail. Depuis le 1er janvier 2022 la mention type
// peut être dactylographiée, mais elle doit être APPOSÉE PAR LA CAUTION
// elle-même (art. 2297) : l'épreuve l'imprime dans un encadré à recopier.
// Acte des parties : cadres de signature, jamais de signature d'émetteur.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Fusion,
  assemblerPage,
  cadreSignature,
  echapper,
  enTete,
  eur,
  faitA,
  montantEnLettres,
  section,
  titre,
} from "../gabarit";
import {
  adresseLogement,
  adressePersonne,
  chargerContexteBail,
  expediteur,
  nomPersonne,
  nomsBailleurs,
  nomsLocataires,
  referenceCourte,
} from "./communs";
import type { Assemblage } from "./index";

// Le plafond saisi dans la carte (euros, chaîne libre) — un montant illisible
// ou nul vaut absence : le champ restera en libellé d'épreuve et manquant,
// car le montant maximal est exigé à peine de nullité (art. 2297).
function montantMaxDepuisOptions(brut: string | undefined): number | null {
  if (!brut) return null;
  const n = Number(brut.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const LIBELLES_BAIL: Record<string, string> = {
  nu: "de location — logement nu",
  meuble: "de location — logement meublé",
  colocation: "de colocation",
};

export async function assemblerCautionnement(
  supabase: SupabaseClient,
  orgId: string,
  bailId: string,
  options?: Record<string, string>
): Promise<Assemblage> {
  const ctx = await chargerContexteBail(supabase, orgId, bailId);
  if ("erreur" in ctx) return ctx;

  const garant = ctx.garants.find((g) => g.id === options?.garant);
  if (!garant) return { erreur: "Ce garant n'est pas rattaché au bail." };

  const solidaire = options?.forme !== "simple";
  const montantMax = montantMaxDepuisOptions(options?.montant_max);

  const f = new Fusion();
  const exp = expediteur(ctx);
  const reference = referenceCourte("CAUT", garant.id);
  const bailleurPrincipal = ctx.bailleurs[0] ?? null;
  const plusieursBailleurs = ctx.bailleurs.length > 1;
  // Garant nominatif : il ne couvre qu'un des locataires du bail
  const locataireCouvert = garant.garant_de
    ? ctx.locataires.find((l) => l.id === garant.garant_de) ?? null
    : null;

  const nomCaution = f.champ(nomPersonne(garant), "nom et prénom(s) de la caution");
  const nomsCouverts = locataireCouvert
    ? f.champ(nomPersonne(locataireCouvert), "nom et prénom(s) du locataire couvert")
    : nomsLocataires(f, ctx.locataires);
  // Le même libellé sert dans l'étendue et dans la mention : compté une fois
  const montantMaxHtml =
    montantMax !== null
      ? `<b>${eur(montantMax)}</b> (${montantEnLettres(montantMax)})`
      : f.champ(null, "montant maximal garanti");
  const montantMaxLettresHtml =
    montantMax !== null
      ? `${montantEnLettres(montantMax)} (${eur(montantMax)})`
      : f.champ(null, "montant maximal garanti");
  const chargesMode =
    ctx.bail.charges_mode === "forfait"
      ? "forfait de charges"
      : "provisions sur charges avec régularisation annuelle";

  const corps = `
    ${enTete(f, exp, { libelle: "Acte", reference, etabliLe: new Date().toISOString() })}
    ${titre("Acte de cautionnement", solidaire ? "Engagement de caution solidaire" : "Engagement de caution simple", [
      "Articles 2288 et suivants du code civil (ordonnance n° 2021-1192 du 15 septembre 2021)",
      "Article 22-1 de la loi n° 89-462 du 6 juillet 1989",
    ])}

    ${section("I — La caution")}
    <p>${nomCaution}, né(e) le ${f.date(garant.date_naissance)} à
    ${f.champ(garant.commune_naissance, "commune de naissance")}, demeurant
    ${f.champ(adressePersonne(garant), "adresse de la caution")},<br/>
    ci-après dénommé(e) « la caution ».</p>

    ${section("II — Le bailleur")}
    <p>${nomsBailleurs(f, ctx.bailleurs)}, ${f.champ(adressePersonne(bailleurPrincipal), "domicile ou siège social")},
    ci-après dénommé${plusieursBailleurs ? "s" : ""} « le bailleur ».</p>
    ${
      ctx.organisation.type === "agence"
        ? `<p>Le bailleur est représenté par son mandataire : ${echapper(ctx.organisation.name)},
           ${f.champ(exp.adresse, "adresse du mandataire")}.</p>`
        : ""
    }

    ${section("III — Le locataire cautionné")}
    <p>Le présent cautionnement garantit les obligations de ${nomsCouverts},
    locataire au titre du bail désigné ci-dessous, ci-après dénommé « le locataire ».</p>

    ${section("IV — Le bail cautionné")}
    <p>Logement : ${f.champ(adresseLogement(ctx.lot, ctx.bien), "adresse complète du logement")}.<br/>
    Contrat ${LIBELLES_BAIL[ctx.bail.type] ?? "de location"}, référence ${echapper(referenceCourte("BAIL", ctx.bail.id))},
    prenant effet le ${f.date(ctx.bail.date_debut)}.<br/>
    Loyer mensuel hors charges : ${f.montant(ctx.bail.loyer_hc, "loyer mensuel hors charges")} —
    charges : ${f.montant(ctx.bail.charges, "charges mensuelles")} (${chargesMode}).<br/>
    ${
      ctx.bail.revision_irl
        ? `Le loyer est révisé chaque année dans la limite de la variation de l'indice de référence
           des loyers (IRL) — trimestre de référence : ${f.champ(ctx.bail.irl_trimestre, "trimestre IRL de référence")}.
           Le cautionnement s'étend au loyer ainsi révisé.`
        : `Le bail ne prévoit pas de clause de révision annuelle du loyer.`
    }</p>

    ${section("V — Forme du cautionnement")}
    ${
      solidaire
        ? `<p>Le cautionnement est consenti à titre <b>solidaire</b>. La caution renonce expressément
           au bénéfice de discussion (article 2305 du code civil) et au bénéfice de division
           (article 2306 du code civil) : le bailleur peut la poursuivre pour l'intégralité des sommes
           dues sans avoir à poursuivre préalablement le locataire ni à diviser ses poursuites entre
           les cautions.</p>`
        : `<p>Le cautionnement est consenti à titre <b>simple</b>. Le bailleur ne peut poursuivre la
           caution qu'après avoir vainement poursuivi le locataire (bénéfice de discussion,
           article 2305 du code civil) et, en présence de plusieurs cautions, il divise ses poursuites
           entre elles (bénéfice de division, article 2306 du code civil).</p>`
    }

    ${section("VI — Étendue et durée de l'engagement")}
    <p>La caution garantit le paiement des loyers, des charges, des réparations locatives, des
    intérêts et, le cas échéant, des pénalités ou intérêts de retard dus par le locataire au titre du
    bail. L'engagement vaut pour la durée du bail et celle de ses renouvellements, dans la limite
    d'un montant maximal, principal et accessoires compris, de ${montantMaxHtml}.</p>
    ${
      locataireCouvert && ctx.locataires.length > 1
        ? `<p class="mentions">Colocation — cautionnement nominatif : l'engagement s'éteint à
           l'expiration d'un délai de six mois après la date d'effet du congé du colocataire couvert,
           ou dès qu'un nouveau colocataire le remplace au bail (article 8-1 de la loi du
           6 juillet 1989).</p>`
        : ""
    }

    ${section("VII — Mention apposée par la caution")}
    <div class="encadre">
      <p class="etiquette">Mention à recopier par la caution</p>
      <p>« Je, soussigné(e) ${nomCaution}, m'engage en qualité de caution${solidaire ? " solidaire" : ""}
      de ${nomsCouverts} envers le bailleur, à lui payer, en cas de défaillance du locataire, les
      sommes dues au titre du bail désigné dans le présent acte — loyers, charges, réparations
      locatives, intérêts et pénalités de retard —, pour la durée du bail et de ses renouvellements,
      dans la limite de la somme de ${montantMaxLettresHtml}, couvrant le principal et les
      accessoires.${
        solidaire
          ? " Je reconnais ne pouvoir exiger du bailleur qu'il poursuive d'abord le locataire, ni qu'il divise ses poursuites entre les cautions."
          : ""
      } »</p>
    </div>
    <p class="mentions">La mention ci-dessus peut être dactylographiée, mais, à peine de nullité de
    l'engagement, elle doit être apposée par la caution elle-même (article 2297 du code civil) :
    recopiée intégralement de sa main dans le cadre de signature, ou apposée par elle dans l'acte,
    puis suivie de sa signature.</p>

    ${section("VIII — Date et signatures")}
    ${faitA(f, exp.ville, new Date().toISOString(), ", en deux exemplaires originaux, dont un est remis à la caution avec un exemplaire du contrat de location (article 22-1 de la loi du 6 juillet 1989).")}
    <div class="signatures">
      ${cadreSignature("La caution", `${nomCaution}<br/>Mention apposée par la caution, puis signature`)}
      ${cadreSignature("Le bailleur", nomsBailleurs(f, ctx.bailleurs))}
    </div>
  `;

  const document = assemblerPage({
    f,
    titreDocument: "Acte de cautionnement",
    nomPied: "Acte de cautionnement",
    reference,
    corps,
  });

  return {
    document,
    titreGed: `Cautionnement — ${nomPersonne(garant) ?? garant.nom}`,
    nomFichier: `cautionnement-${reference.toLowerCase()}`,
    liens: [
      { entite: "bail", entiteId: ctx.bail.id },
      { entite: "personne", entiteId: garant.id },
    ],
  };
}
