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

export type Courrier = { sujet: string; html: string };

function jour(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  });
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

export function courrierReconduction(p: {
  organisation: string;
  echeance: string;
  montantCents: number | null;
  formule: string | null;
  lien: string | null;
}): Courrier {
  const titre = `Votre abonnement annuel Gerimmo sera reconduit le ${jour(p.echeance)}`;
  const montant =
    p.montantCents !== null
      ? `pour une nouvelle année, au prix de <strong>${eur(p.montantCents / 100)} TTC</strong>`
      : "pour une nouvelle année";
  const formule = p.formule ? ` (formule ${echapperMarque(p.formule.charAt(0).toUpperCase() + p.formule.slice(1))})` : "";
  return {
    sujet: titre,
    html: enveloppe(
      titre,
      `<p>Votre abonnement annuel${formule} arrive à échéance le
       <strong>${jour(p.echeance)}</strong>. Sans demande contraire de votre part,
       il sera reconduit tacitement ${montant}, prélevés à cette date.</p>
       <p><strong>Vous pouvez choisir de ne pas le reconduire</strong> : il suffit de
       le résilier depuis « Mon abonnement » avant le ${jour(p.echeance)}. L'accès
       payé reste alors entier jusqu'à l'échéance, puis vos données restent
       consultables et exportables. Vous pouvez aussi passer au paiement mensuel,
       sans engagement, à partir de l'échéance.</p>
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

function lienAbonnement(orgId: string): string | null {
  const site = adresseDuSite();
  return site ? `${site}/agence/${orgId}/abonnement` : null;
}

async function destinataire(supabase: SupabaseClient, orgId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("destinataire_facturation", { p_org: orgId });
  if (error) return null;
  return (data as string | null) ?? null;
}

/** L'avis de fin d'essai. Rend un motif d'échec, ou `null` si envoyé. */
export async function envoyerAvisFinEssai(
  p: { orgId: string; organisation: string; destinataire: string | null; premierPrelevementLe: string; montantCents: number | null; cle: string }
): Promise<string | null> {
  if (!p.destinataire) return "sans adresse";
  const c = courrierFinEssai({ ...p, lien: lienAbonnement(p.orgId) });
  const { erreur } = await envoyerEmail({ to: p.destinataire, subject: c.sujet, html: c.html, cleIdempotence: p.cle });
  return erreur ?? null;
}

/** L'avis de capacité dépassée à l'échéance. Rend un motif d'échec, ou `null`. */
export async function envoyerAvisCapaciteDepassee(
  supabase: SupabaseClient,
  p: { orgId: string; organisation: string; estAgence: boolean; capacite: number; aCouvrir: number; echeance: string }
): Promise<string | null> {
  const a = await destinataire(supabase, p.orgId);
  if (!a) return "sans adresse";
  const c = courrierCapaciteDepassee({ ...p, lien: lienAbonnement(p.orgId) });
  const { erreur } = await envoyerEmail({
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
};

export type BilanReconduction = { envoyes: number; sans_adresse: string[]; echecs: string[] };

/**
 * Les avis de reconduction dus aujourd'hui. On envoie, PUIS on marque : un
 * échec réseau laisse l'avis « dû », il repartira demain (la fenêtre court
 * sur deux mois). La clé d'idempotence empêche un doublon le même jour.
 */
export async function envoyerAvisReconduction(supabase: SupabaseClient): Promise<BilanReconduction> {
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
    const c = courrierReconduction({
      organisation: a.organisation,
      echeance: a.periode_fin,
      montantCents: a.montant_periode_cents === null ? null : Number(a.montant_periode_cents),
      formule: a.formule,
      lien: lienAbonnement(a.organization_id),
    });
    const { erreur } = await envoyerEmail({
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
