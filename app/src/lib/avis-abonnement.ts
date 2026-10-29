// Les courriers d'information sur l'abonnement (audit du 29/09/2026).
//
// TROIS AVIS, et aucun ne prélève quoi que ce soit.
//  1. FIN D'ESSAI (webhook `customer.subscription.trial_will_end`) : la date
//     du premier prélèvement et son montant, quelques jours avant. Souscrire
//     pendant l'essai ne fait pas payer plus tôt ; encore faut-il le rappeler
//     avant que la banque ne le dise.
//  2. CAPACITÉ DÉPASSÉE À L'ÉCHÉANCE (tâche de nuit) : le portefeuille
//     dépasse ce que l'abonnement couvre. On ne relève JAMAIS la formule
//     d'office : le client confirme la hausse sur « Mon abonnement ».
//  3. RECONDUCTION TACITE (art. L215-1 du code de la consommation) : un
//     particulier abonné à l'année est informé, entre trois mois et un mois
//     avant le terme, de la date de reconduction, du montant, et de son droit
//     de ne pas reconduire. Une fois par période (la base le retient).
//
// La partie haute est PURE (gabarits) : tests/avis-abonnement.test.ts
// l'exerce. La partie basse lit la base (client de service) et envoie.

import type { SupabaseClient } from "@supabase/supabase-js";
import { envoyerEmail } from "@/lib/email";
import { eur } from "@/lib/ged";
import { echapperMarque } from "@/lib/marque-organisation";
import { adresseDuSite } from "@/lib/site";
import { baseEspace } from "@/lib/racine-espace";
import { baseDeLOrganisation } from "@/lib/racine-espace-serveur";
import { REGIME_TVA } from "@/lib/editeur";
import { dateParis } from "@/lib/heure-paris-calcul";
import { jourEnLettres } from "@/lib/delai-retractation";
import { etiquetteTaxes, formuleParCode, offreFormule, type Periodicite } from "@/lib/tarifs";

export type Courrier = { sujet: string; html: string };

/** Le jour de Paris en toutes lettres, « 1er » compris (relecture adverse du 24/10, M2). */
function jour(iso: string): string {
  return jourEnLettres(dateParis(new Date(iso)));
}

function enveloppe(titre: string, corps: string, lien: string | null, geste: string, organisation: string): string {
  return `
    <div style="font-family:sans-serif;font-size:14px;color:#111;line-height:1.5">
      <h2 style="font-size:17px">${echapperMarque(titre)}</h2>
      <p>Bonjour,</p>
      ${corps}
      ${
        lien
          ? `<p style="margin:22px 0">
        <a href="${echapperMarque(lien)}"
           style="background:#12263f;color:#fff;padding:11px 18px;border-radius:6px;text-decoration:none;display:inline-block">
          ${echapperMarque(geste)}
        </a>
      </p>`
          : `<p style="margin:22px 0"><strong>${echapperMarque(geste)}</strong> depuis « Mon abonnement »,
             dans votre espace Gerimmo.</p>`
      }
      <p style="color:#555">— Gerimmo, pour ${echapperMarque(organisation)}</p>
    </div>`;
}

export function courrierFinEssai(p: {
  organisation: string;
  premierPrelevementLe: string;
  montantCents: number | null;
  lien: string | null;
}): Courrier {
  const titre = `Votre essai Gerimmo se termine : premier prélèvement le ${jour(p.premierPrelevementLe)}`;
  const montant = p.montantCents !== null ? ` de <strong>${eur(p.montantCents / 100)}</strong>` : "";
  return {
    sujet: titre,
    html: enveloppe(
      titre,
      `<p>Votre période d'essai arrive à son terme. Le premier prélèvement${montant}
       aura lieu le <strong>${jour(p.premierPrelevementLe)}</strong>, sur le moyen de
       paiement que vous avez enregistré.</p>
       <p>Vous pouvez vérifier votre formule, changer de carte ou résilier avant
       cette date depuis « Mon abonnement ». Sans geste de votre part,
       l'abonnement démarre normalement.</p>`,
      p.lien,
      "Vérifier mon abonnement",
      p.organisation
    ),
  };
}

export function courrierCapaciteDepassee(p: {
  organisation: string;
  estAgence: boolean;
  capacite: number;
  aCouvrir: number;
  echeance: string;
  lien: string | null;
}): Courrier {
  const unite = p.estAgence ? "lot sous mandat" : "bien";
  const pluriel = (n: number) => `${n} ${unite}${n > 1 ? "s" : ""}`;
  const titre = "Votre portefeuille dépasse votre abonnement";
  return {
    sujet: titre,
    html: enveloppe(
      titre,
      `<p>Votre abonnement couvre <strong>${pluriel(p.capacite)}</strong> ; vous en gérez
       aujourd'hui <strong>${p.aCouvrir}</strong>. Il se renouvellera le
       <strong>${jour(p.echeance)}</strong> à l'identique : <strong>rien ne sera
       prélevé en plus sans votre accord</strong>.</p>
       <p>Vos données restent intactes. Pour ajouter de nouveaux ${unite}s,
       confirmez l'offre adaptée sur « Mon abonnement » : le nouveau montant et
       le prorata vous y sont présentés avant toute confirmation.</p>`,
      p.lien,
      "Voir l'offre adaptée",
      p.organisation
    ),
  };
}

/** La veille d'une échéance, en jour de Paris (AAAA-MM-JJ) : la date limite de non-reconduction (plan du 23/10, R17). */
export function veilleDeLEcheance(echeance: string): string {
  const j = dateParis(new Date(echeance));
  const d = new Date(`${j}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function jourCivil(jourParis: string): string {
  return jour(`${jourParis}T12:00:00Z`);
}

/**
 * LE MONTANT DE LA PÉRIODE SUIVANTE (plan du 23/10, R17), et non celui de la période en cours.
 *
 * Sans changement demandé, Stripe reconduit la souscription au même prix : le montant de la période en cours (qui garde
 * un avantage ou une ancienne condition). Un passage au mensuel demandé pour l'échéance : le prix mensuel de la formule
 * détenue, pour la capacité payée. Une baisse automatique à l'échéance (portefeuille réduit, choix non explicite) ne
 * peut que réduire ce montant : l'avis n'annonce jamais moins que ce qui sera prélevé.
 */
export function periodeSuivante(a: {
  formule: string | null;
  periodicite_suivante: string | null;
  unites_souscrites: number | null;
  montant_periode_cents: number | null;
}): { periodicite: Periodicite; montantCents: number | null } {
  const periodicite: Periodicite = a.periodicite_suivante === "mensuel" ? "mensuel" : "annuel";
  const formule = formuleParCode(a.formule);
  const capacite = a.unites_souscrites ?? formule?.biens ?? null;
  const tarif = formule && capacite ? (offreFormule(formule, capacite, periodicite)?.montantCents ?? null) : null;
  const annuelCourant = formule && capacite ? offreFormule(formule, capacite, "annuel")?.montantCents : null;
  // La tâche de facturation exige un nouvel accord pour changer de périodicité
  // avec une ancienne condition tarifaire : l'avis garde donc ce contrat.
  if (periodicite === "mensuel" && a.montant_periode_cents !== null && a.montant_periode_cents !== annuelCourant) {
    return { periodicite: "annuel", montantCents: a.montant_periode_cents };
  }
  if (periodicite === "mensuel") return { periodicite, montantCents: tarif };
  return { periodicite, montantCents: a.montant_periode_cents ?? tarif };
}

export function courrierReconduction(p: {
  organisation: string;
  echeance: string;
  /** Le montant de la PÉRIODE SUIVANTE (`periodeSuivante`). */
  montantCents: number | null;
  /** La périodicité de la période suivante : « mensuel » si le client a demandé ce passage pour l'échéance. */
  periodiciteSuivante?: Periodicite;
  formule: string | null;
  lien: string | null;
}): Courrier {
  const titre = `Votre abonnement annuel Gerimmo sera reconduit le ${jour(p.echeance)}`;
  const mensuel = p.periodiciteSuivante === "mensuel";
  // Plan du 23/10 (R55) : « TTC » seulement si l'éditeur facture la TVA ; en franchise, le montant seul.
  const taxes = etiquetteTaxes("ttc", REGIME_TVA);
  const prix = p.montantCents !== null ? `<strong>${eur(p.montantCents / 100)}${taxes ? ` ${taxes}` : ""}</strong>` : null;
  const reconduit = mensuel
    ? `il se poursuivra ensuite au mois, comme vous l'avez demandé, sans engagement${prix ? `, au prix de ${prix} par mois` : ""}`
    : `il sera reconduit tacitement pour une nouvelle année${prix ? `, au prix de ${prix}, prélevés à cette date` : ""}`;
  const formule = p.formule ? ` (formule ${echapperMarque(p.formule.charAt(0).toUpperCase() + p.formule.slice(1))})` : "";
  const limite = jourCivil(veilleDeLEcheance(p.echeance));
  // Plan du 23/10 (R17) : l'encadré de la date limite, en table HTML (les messageries ignorent souvent les bordures
  // d'un paragraphe). À relire par le juriste (source non ouverte le 23/10/2026).
  const encadre = `<table role="presentation" border="1" cellpadding="12" cellspacing="0" style="border-collapse:collapse;border:2px solid #12263f;margin:16px 0"><tr><td><strong>Date limite de non-reconduction : ${limite}</strong><br>Pour ne pas reconduire votre abonnement, résiliez-le depuis « Mon abonnement » au plus tard à cette date.</td></tr></table>`;
  return {
    sujet: titre,
    html: enveloppe(
      titre,
      `<p>Votre abonnement annuel${formule} arrive à échéance le
       <strong>${jour(p.echeance)}</strong>. Sans demande contraire de votre part,
       ${reconduit}.</p>
       ${encadre}
       <p><strong>Vous pouvez choisir de ne pas le reconduire</strong> : il suffit de
       le résilier depuis « Mon abonnement » au plus tard le ${limite}. L'accès
       payé reste alors entier jusqu'à l'échéance, puis vos données restent
       consultables et exportables.${mensuel ? "" : " Vous pouvez aussi passer au paiement mensuel, sans engagement, à partir de l'échéance."}</p>
       <p style="color:#555">Information délivrée en application de l'article
       L215-1 du code de la consommation.</p>`,
      p.lien,
      "Gérer mon abonnement",
      p.organisation
    ),
  };
}

// ============================================================
// Envois (client de service : webhook et tâche de nuit seulement)
// ============================================================

// `base` : « /espace/<id> » chez un propriétaire direct, « /agence/<id> » chez une agence (décision D27) ; à défaut,
// l'ancienne adresse, que le proxy redirige.
function lienAbonnement(orgId: string, base?: string): string | null {
  const site = adresseDuSite();
  return site ? `${site}${base ?? `/agence/${orgId}`}/abonnement` : null;
}

async function destinataire(supabase: SupabaseClient, orgId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("destinataire_facturation", { p_org: orgId });
  if (error) return null;
  return (data as string | null) ?? null;
}

/** L'avis de fin d'essai. Rend un motif d'échec, ou `null` si envoyé. */
export async function envoyerAvisFinEssai(
  p: { orgId: string; organisation: string; destinataire: string | null; premierPrelevementLe: string; montantCents: number | null; cle: string; base?: string },
  avantEffet?: () => Promise<void>
): Promise<string | null> {
  if (!p.destinataire) return "sans adresse";
  const c = courrierFinEssai({ ...p, lien: lienAbonnement(p.orgId, p.base) });
  const { erreur } = await envoyerEmail({ to: p.destinataire, subject: c.sujet, html: c.html, cleIdempotence: p.cle, avantEnvoi: avantEffet });
  return erreur ?? null;
}

/** L'avis de capacité dépassée à l'échéance. Rend un motif d'échec, ou `null`. */
export async function envoyerAvisCapaciteDepassee(
  supabase: SupabaseClient,
  p: { orgId: string; organisation: string; estAgence: boolean; capacite: number; aCouvrir: number; echeance: string },
  avantEffet?: () => Promise<void>
): Promise<string | null> {
  const a = await destinataire(supabase, p.orgId);
  if (!a) return "sans adresse";
  const c = courrierCapaciteDepassee({ ...p, lien: lienAbonnement(p.orgId, baseEspace(p.orgId, !p.estAgence)) });
  await avantEffet?.();
  const { erreur } = await envoyerEmail({
    avantEnvoi: avantEffet,
    to: a,
    subject: c.sujet,
    html: c.html,
    cleIdempotence: `capacite-${p.orgId}-${p.echeance.slice(0, 10)}`,
  });
  return erreur ?? null;
}

type AvisReconduction = {
  organization_id: string;
  organisation: string;
  destinataire: string | null;
  periode_fin: string;
  montant_periode_cents: number | string | null;
  formule: string | null;
  periodicite_suivante?: string | null;
  unites_souscrites?: number | null;
};

export type BilanReconduction = { envoyes: number; sans_adresse: string[]; echecs: string[] };

/**
 * Les avis de reconduction dus aujourd'hui. On envoie, PUIS on marque : un
 * échec réseau laisse l'avis « dû », il repartira demain (plan du 23/10, R54 :
 * la fenêtre court d'un mois à trois mois avant la DATE LIMITE de
 * non-reconduction, veille de l'échéance — relecture adverse du 24/10, M8 —,
 * comptés en mois et en dates de Paris, migration 20261024110000). La clé
 * d'idempotence empêche un doublon le même jour. Le montant annoncé est celui
 * de la période suivante (R17, `periodeSuivante`).
 */
export async function envoyerAvisReconduction(supabase: SupabaseClient, avantEffet?: () => Promise<void>): Promise<BilanReconduction> {
  const bilan: BilanReconduction = { envoyes: 0, sans_adresse: [], echecs: [] };
  const { data, error } = await supabase.rpc("abonnements_avis_reconduction_dus", { p_limite: 200 });
  if (error) {
    bilan.echecs.push(error.message);
    return bilan;
  }
  for (const a of (data ?? []) as AvisReconduction[]) {
    if (!a.destinataire) {
      bilan.sans_adresse.push(a.organisation);
      continue;
    }
    const suivante = periodeSuivante({
      formule: a.formule,
      periodicite_suivante: a.periodicite_suivante ?? null,
      unites_souscrites: a.unites_souscrites ?? null,
      montant_periode_cents: a.montant_periode_cents === null ? null : Number(a.montant_periode_cents),
    });
    const c = courrierReconduction({
      organisation: a.organisation,
      echeance: a.periode_fin,
      montantCents: suivante.montantCents,
      periodiciteSuivante: suivante.periodicite,
      formule: a.formule,
      lien: lienAbonnement(a.organization_id, await baseDeLOrganisation(supabase, a.organization_id)),
    });
    await avantEffet?.();
    const { erreur } = await envoyerEmail({
      avantEnvoi: avantEffet,
      to: a.destinataire,
      subject: c.sujet,
      html: c.html,
      cleIdempotence: `reconduction-${a.organization_id}-${a.periode_fin.slice(0, 10)}`,
    });
    if (erreur) {
      bilan.echecs.push(`${a.organisation} : ${erreur}`);
      continue;
    }
    await supabase.rpc("abonnement_avis_reconduction_envoye", {
      p_org: a.organization_id,
      p_periode_fin: a.periode_fin,
    });
    bilan.envoyes += 1;
  }
  return bilan;
}
