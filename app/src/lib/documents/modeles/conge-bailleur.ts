// Congé délivré par le bailleur — art. 15 de la loi n° 89-462 du 6 juillet
// 1989 (logement nu), art. 25-8 (meublé) : au terme du bail uniquement, reçu
// au moins six mois (nu) ou trois mois (meublé) avant l'échéance, sous peine
// de nullité. Le motif (vente, reprise, motif légitime et sérieux) et ses
// précisions arrivent par `options` : ce sont les choix du geste, pas des
// données du bail. Congé pour vente d'un logement nu : le congé vaut offre de
// vente au profit du locataire (art. 15-II) : le prix proposé est exigé et
// imprimé (audit 29/09) — sans prix, pas de PDF. La date d'effet n'est plus
// saisie : c'est le terme du bail calculé par la base (`terme_bail`, la même
// règle que l'enregistrement du congé), pour la date de présentation prévue. Document émis SEUL par
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
  eur,
  faitA,
  montantEnLettres,
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

// Même arithmétique que la base (`date + interval 'n months'`) : le jour est
// ramené au dernier jour du mois quand il n'existe pas.
export function ajouterMois(iso: string, mois: number): string {
  const [a, m, j] = iso.slice(0, 10).split("-").map(Number);
  const cible = new Date(Date.UTC(a, m - 1 + mois, 1));
  const dernier = new Date(Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth() + 1, 0)).getUTCDate();
  cible.setUTCDate(Math.min(j, dernier));
  return cible.toISOString().slice(0, 10);
}

function lendemain(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Le congé du bailleur présenté à `presentation` respecte-t-il le préavis avant
 * le terme ? Miroir de `enregistrer_conge` : présentation + préavis ≤ terme + 1 jour.
 */
export function congeBailleurDansLesDelais(presentation: string, terme: string, preavisMois: number): boolean {
  return ajouterMois(presentation, preavisMois) <= lendemain(terme);
}

/** Prix saisi (« 245 000 », « 245000,50 ») → nombre positif, sinon null. */
export function prixDepuisOptions(brut: string | undefined): number | null {
  if (!brut) return null;
  const n = Number(brut.replace(/[\s\u00a0\u202f€]/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

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
  const preavisMois = meuble ? 3 : 6;

  // Congé pour vente d'un logement NU : le congé vaut offre de vente, le prix
  // en est une mention obligatoire (art. 15 II). Pas de PDF sans prix.
  const prixVente = prixDepuisOptions(options?.prix_vente);
  if (motif === "vente" && !meuble && prixVente === null) {
    return {
      erreur:
        "Congé pour vente d'un logement loué nu : indiquez le prix de vente proposé — le congé vaut offre de vente au locataire (article 15 II de la loi du 6 juillet 1989).",
    };
  }

  // Date d'effet : le terme du bail calculé par la base pour la date de
  // présentation prévue ; si le préavis n'y tient plus, le terme suivant.
  const presentation = /^\d{4}-\d{2}-\d{2}$/.test(options?.date_presentation ?? "")
    ? (options?.date_presentation as string)
    : new Date().toISOString().slice(0, 10);
  let terme: string | null = null;
  {
    const { data, error } = await supabase.rpc("terme_bail", { p_bail: ctx.bail.id, p_date: presentation });
    if (error) return { erreur: "Le terme du bail n'a pas pu être calculé." };
    terme = (data as string | null) ?? null;
  }
  if (terme && terme < presentation) {
    return {
      erreur: `Le bail étudiant a pris fin le ${terme.split("-").reverse().join("/")} : il n'est jamais reconduit, aucun congé n'est à délivrer.`,
    };
  }
  const termeTardif = terme !== null && !congeBailleurDansLesDelais(presentation, terme, preavisMois);
  if (terme && termeTardif) {
    const { data, error } = await supabase.rpc("terme_bail", { p_bail: ctx.bail.id, p_date: lendemain(terme) });
    if (error) return { erreur: "Le terme du bail n'a pas pu être calculé." };
    terme = (data as string | null) ?? null;
  }
  const articleLoi = meuble ? "25-8" : "15";

  const f = new Fusion();
  const exp = expediteur(ctx);
  const reference = referenceCourte("CONGE", ctx.bail.id);
  const referenceBail = referenceCourte("BAIL", ctx.bail.id);
  const agence = ctx.organisation.type === "agence";
  // La date d'effet est le terme calculé ; incalculable (bail nu à durée
  // réduite), la date de fin du bail, à défaut un libellé à compléter.
  const dateEffet = f.date(terme ?? ctx.bail.date_fin, "date d'échéance du bail");
  const prixHtml =
    prixVente !== null
      ? `<b>${eur(prixVente)}</b>${prixVente < 1_000_000 ? ` (${montantEnLettres(prixVente)})` : ""}`
      : null;
  const conditions = options?.conditions_vente?.trim();

  let blocMotif: string;
  if (motif === "vente") {
    blocMotif = meuble
      ? `<p>Le présent congé vous est délivré au motif de la <b>vente</b> du logement désigné
         ci-dessus (article 25-8 de la loi du 6 juillet 1989).</p>
         ${prixHtml ? `<p>Prix de vente envisagé : ${prixHtml}.</p>` : ""}
         <p class="mentions">En location meublée, le congé pour vendre n'emporte pas offre de vente
         au profit du locataire : le droit de préemption de l'article 15-II, propre à la location
         nue, ne s'applique pas ici.</p>`
      : `<p>Le présent congé vous est délivré en vue de la <b>vente</b> du logement désigné
         ci-dessus.</p>
         <p>En application de l'article 15-II de la loi du 6 juillet 1989, le présent congé
         <b>vaut offre de vente</b> à votre profit : vous disposez d'un droit de préemption pendant
         les <b>deux premiers mois</b> du délai de préavis.</p>
         <p>Prix de la vente projetée : ${prixHtml}${
           conditions ? `.<br/>Conditions de la vente : ${echapper(conditions)}` : ""
         }.</p>
         <p class="mentions">Le prix et les conditions de la vente figurent dans le congé à peine de
         nullité de l'offre. À défaut d'acceptation dans ce délai, vous êtes déchu de plein droit de
         tout titre d'occupation au terme du préavis. Si le logement est ensuite vendu à des
         conditions ou à un prix plus avantageux, le notaire doit vous notifier ces conditions et ce
         prix (article 15 II).</p>`;
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
    ${
      termeTardif
        ? `<p class="mentions">Présenté le ${f.date(presentation)}, ce congé ne respecte plus le préavis
           avant l'échéance en cours : il vise l'échéance suivante.</p>`
        : ""
    }
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
