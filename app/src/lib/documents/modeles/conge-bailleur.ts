// Congé délivré par le bailleur — art. 15 de la loi n° 89-462 du 6 juillet
// 1989 (logement nu), art. 25-8 (meublé) : au terme du bail uniquement, reçu
// au moins six mois (nu) ou trois mois (meublé) avant l'échéance, sous peine
// de nullité. Le motif (vente, reprise, motif légitime et sérieux) et ses
// précisions arrivent par `options` : ce sont les choix du geste, pas des
// données du bail. Congé pour vente d'un logement nu : le congé vaut offre de
// vente au profit du locataire (art. 15-II) — le prix s'arrête chez le
// notaire, l'épreuve n'en invente jamais. Document émis SEUL par
// l'organisation → signature d'émetteur ; la notification part hors
// plateforme (LRAR, acte d'huissier, remise en main propre) : Gerimmo génère
// et suit, il ne notifie jamais (RM-A3.1).

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Fusion,
  assemblerPage,
  blocSignatureEmetteur,
  cartouches,
  echapper,
  enTete,
  faitA,
  section,
  titre,
} from "../gabarit";
import {
  adresseLogement,
  chargerContexteBail,
  expediteur,
  liensLocataires,
  nomsBailleurs,
  nomsLocataires,
  referenceCourte,
  signatureOrganisation,
} from "./communs";
import type { Assemblage } from "./index";

const LIBELLES_MOTIF = {
  vente: "vente",
  reprise: "reprise",
  motif_legitime: "motif légitime et sérieux",
} as const;

type Motif = keyof typeof LIBELLES_MOTIF;

const SOUS_TITRES: Record<Motif, string> = {
  vente: "Congé pour vendre",
  reprise: "Congé pour reprise",
  motif_legitime: "Congé pour motif légitime et sérieux",
};

export async function assemblerCongeBailleur(
  supabase: SupabaseClient,
  orgId: string,
  bailId: string,
  options?: Record<string, string>
): Promise<Assemblage> {
  const motif = (options?.motif ?? "") as Motif;
  if (!(motif in LIBELLES_MOTIF)) {
    return {
      erreur: "Motif du congé manquant ou inconnu (vente, reprise ou motif légitime et sérieux).",
    };
  }

  const ctx = await chargerContexteBail(supabase, orgId, bailId);
  if ("erreur" in ctx) return ctx;

  // Nu ou meublé : le type du bail prime ; un bail « colocation » suit
  // l'ameublement du lot. Le préavis et la base légale en dépendent.
  const meuble = ctx.bail.type === "meuble" ? true : ctx.bail.type === "nu" ? false : ctx.lot.meuble;
  const preavis = meuble ? "trois" : "six";
  const articleLoi = meuble ? "25-8" : "15";

  const f = new Fusion();
  const exp = expediteur(ctx);
  const reference = referenceCourte("CONGE", ctx.bail.id);
  const referenceBail = referenceCourte("BAIL", ctx.bail.id);
  const agence = ctx.organisation.type === "agence";
  // La date d'effet est l'échéance du bail : le choix du geste prime, sinon
  // la date de fin enregistrée au bail — absente, elle reste en libellé.
  const dateEffet = f.date(options?.date_effet ?? ctx.bail.date_fin, "date d'échéance du bail");

  let blocMotif: string;
  if (motif === "vente") {
    blocMotif = meuble
      ? `<p>Le présent congé vous est délivré au motif de la <b>vente</b> du logement désigné
         ci-dessus (article 25-8 de la loi du 6 juillet 1989).</p>
         <p class="mentions">En location meublée, le congé pour vendre n'emporte pas offre de vente
         au profit du locataire : le droit de préemption de l'article 15-II, propre à la location
         nue, ne s'applique pas ici.</p>`
      : `<p>Le présent congé vous est délivré en vue de la <b>vente</b> du logement désigné
         ci-dessus.</p>
         <p>En application de l'article 15-II de la loi du 6 juillet 1989, le présent congé
         <b>vaut offre de vente</b> à votre profit : vous disposez d'un droit de préemption pendant
         les <b>deux premiers mois</b> du délai de préavis. Prix et conditions de la vente
         projetée : ${f.champ(null, "prix et conditions de la vente (à arrêter chez le notaire)")}.</p>
         <p class="mentions">Le prix et les conditions de la vente doivent figurer dans le congé
         notifié, à peine de nullité de l'offre : ils sont arrêtés avec le notaire avant la
         notification — l'épreuve n'imprime jamais de prix qui n'aurait pas été fixé.</p>`;
  } else if (motif === "reprise") {
    blocMotif = `<p>Le présent congé vous est délivré au motif de la <b>reprise</b> du logement
      pour l'habiter à titre de résidence principale, au bénéfice de
      ${f.champ(options?.beneficiaire_nom, "nom du bénéficiaire de la reprise")},
      ${f.champ(options?.beneficiaire_lien, "lien avec le bailleur")}.</p>
      <p class="mentions">Le bénéficiaire de la reprise ne peut être que le bailleur, son conjoint,
      le partenaire auquel il est lié par un pacte civil de solidarité, son concubin notoire depuis
      au moins un an, ses ascendants ou descendants, ou ceux de son conjoint, partenaire ou
      concubin. Le congé doit justifier du caractère <b>réel et sérieux</b> de la décision de
      reprise : une reprise fictive ou frauduleuse expose le bailleur à des dommages et intérêts.</p>`;
  } else {
    blocMotif = `<p>Le présent congé vous est délivré pour un <b>motif légitime et sérieux</b>,
      à savoir : ${f.champ(options?.motif_detail, "motif invoqué")}.</p>
      <p class="mentions">Le motif légitime et sérieux résulte notamment de l'inexécution par le
      locataire de l'une de ses obligations (impayés répétés, troubles de voisinage…) ; en cas de
      contestation, son bien-fondé est apprécié par le juge.</p>`;
  }

  const corps = `
    ${enTete(f, exp, { libelle: "Contrat", reference: referenceBail, etabliLe: new Date().toISOString() })}
    ${titre("Congé délivré par le bailleur", SOUS_TITRES[motif], [
      `Article ${articleLoi} de la loi n° 89-462 du 6 juillet 1989`,
    ])}
    ${cartouches([
      ["Bailleur", `<div>${nomsBailleurs(f, ctx.bailleurs)}</div>`],
      ["Locataire (destinataire)", `<div>${nomsLocataires(f, ctx.locataires)}</div>`],
      [
        "Logement loué",
        `<div>${f.champ(adresseLogement(ctx.lot, ctx.bien), "adresse complète, étage, porte")}</div>`,
      ],
      [
        "Bail",
        `Réf. ${echapper(referenceBail)} — prise d'effet le ${f.date(ctx.bail.date_debut, "date de prise d'effet du bail")}`,
      ],
    ])}
    <p>Madame, Monsieur,</p>
    <p>${
      agence
        ? "Au nom et pour le compte du bailleur, dont nous sommes mandataire, nous vous notifions"
        : "Nous vous notifions"
    } par la présente <b>congé</b> du logement désigné ci-dessus, à effet à l'échéance du contrat
    de location, conformément à l'article ${articleLoi} de la loi n° 89-462 du 6 juillet 1989.</p>

    ${section("Motif du congé")}
    ${blocMotif}

    ${section("Date d'effet et préavis")}
    <p>Le présent congé prend effet à l'échéance du bail, soit le ${dateEffet}. Il doit vous
    parvenir au moins <b>${preavis} mois</b> avant cette date — délai de préavis applicable à un
    logement ${meuble ? "loué meublé" : "loué nu"} ; un congé reçu hors délai serait sans effet
    pour l'échéance visée.</p>
    <p>Vous devrez avoir libéré les lieux et restitué l'ensemble des clés au plus tard à la date
    d'effet ; un état des lieux de sortie sera établi contradictoirement.</p>

    <div class="encadre">
      <p class="etiquette">Notification</p>
      <p>À notifier par <b>lettre recommandée avec accusé de réception</b>, par <b>acte
      d'huissier</b> ou par <b>remise en main propre contre récépissé ou émargement</b>, à chaque
      locataire et colocataire individuellement. Gerimmo génère et suit ce document — il ne le
      notifie jamais : le délai s'apprécie à la première présentation, dont la date est à
      enregistrer sur la fiche du bail.</p>
    </div>

    ${section("Mentions")}
    <div class="mentions">
      <p>Pendant le délai de préavis, le locataire n'est redevable du loyer et des charges que
      pour le temps où il occupe réellement les lieux : il peut quitter le logement à tout moment,
      sans préavis de sa part.</p>
      <p>Le bailleur ne peut donner congé à un locataire âgé de plus de soixante-cinq ans dont les
      ressources sont inférieures aux plafonds réglementaires sans qu'un logement correspondant à
      ses besoins et à ses possibilités lui soit proposé, sauf s'il est lui-même âgé de plus de
      soixante-cinq ans ou dispose de ressources inférieures à ces plafonds.</p>
    </div>
    ${faitA(f, exp.ville, new Date().toISOString())}
    ${blocSignatureEmetteur(exp.nom, await signatureOrganisation(supabase, orgId))}
  `;

  const document = assemblerPage({
    f,
    titreDocument: "Congé délivré par le bailleur",
    nomPied: "Congé du bailleur",
    reference,
    corps,
  });

  return {
    document,
    titreGed: `Congé du bailleur — ${LIBELLES_MOTIF[motif]}`,
    nomFichier: `conge-bailleur-${motif}`,
    liens: [{ entite: "bail", entiteId: ctx.bail.id }, ...liensLocataires(ctx)],
  };
}
