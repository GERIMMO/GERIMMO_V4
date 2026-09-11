"use server";

import { revalidatePath } from "next/cache";
import { sansJargon } from "@/lib/erreurs";
import { verifierGerant } from "@/lib/ged-acces";
import { lotsDuPortefeuille } from "@/lib/portefeuille";
import { eur } from "@/lib/ged";
import { emettreRecusQuittances, libelleEmission } from "@/lib/quittances";
import { compteRenduEncaissement, type EtatAppel } from "@/lib/imputation";
import { envoyerQuittance, type EtatLoyers } from "./loyers";

// Vue « Quittancement du mois » (maquette v3) : les gestes en un clic depuis
// la comptabilité — encaisser le reste d'un appel, émettre la quittance d'un
// mois soldé, envoyer d'un coup toutes les quittances non parties.

// Encaisse d'un clic ce qui reste dû sur un appel : montant = le reste,
// date = aujourd'hui, mode virement (le cas neuf fois sur dix) — corrigeable
// ensuite sur la fiche du bail (« Retirer » puis saisie détaillée).
export async function encaisserReste(
  orgId: string,
  bailId: string,
  appelId: string
): Promise<EtatLoyers> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const { data: lignes, error: erreurEtat } = await supabase.rpc("etat_loyers_bail", {
    p_bail: bailId,
  });
  if (erreurEtat) return { erreur: sansJargon(erreurEtat.message) };
  const avant = (lignes ?? []) as EtatAppel[];
  const appel = avant.find((l) => l.appel_id === appelId);
  if (!appel) return { erreur: "Appel de loyer introuvable." };
  const reste = Number(appel.montant_du) - Number(appel.montant_couvert);
  if (reste <= 0) return { erreur: "Cet appel est déjà couvert." };
  const montant = Math.round(reste * 100) / 100;

  const { error } = await supabase.from("encaissements").insert({
    organization_id: orgId,
    bail_id: bailId,
    montant,
    mode: "virement",
    note: "Encaissé depuis le quittancement",
  });
  if (error) return { erreur: sansJargon(error.message) };
  // Filet de rattrapage : le déclencheur encaissement_quittances a déjà
  // resynchronisé les documents pendant l'INSERT. Cet appel ne sert plus qu'à
  // un historique dérivé — et ses compteurs valent donc 0 : le compte rendu ne
  // peut pas en venir, il se lit dans l'état des loyers d'après.
  const emission = await emettreRecusQuittances(supabase, bailId);
  const { data: lignesApres, error: erreurApres } = await supabase.rpc("etat_loyers_bail", {
    p_bail: bailId,
  });
  revalidatePath(`/agence/${orgId}/comptabilite`);
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  if (erreurApres)
    return {
      succes: `${eur(montant)} encaissés — l'imputation n'a pas pu être relue : ${sansJargon(erreurApres.message)}`,
    };
  const compteRendu = compteRenduEncaissement(montant, avant, (lignesApres ?? []) as EtatAppel[]);
  if (emission.erreur)
    return { succes: `${compteRendu} Rattrapage des documents en échec : ${emission.erreur}` };
  return { succes: compteRendu };
}

// Émettre la quittance d'un bail dont le mois est soldé (payé sans quittance).
export async function emettreQuittanceBail(orgId: string, bailId: string): Promise<EtatLoyers> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const emission = await emettreRecusQuittances(supabase, bailId);
  if (emission.erreur) return { erreur: emission.erreur };
  revalidatePath(`/agence/${orgId}/comptabilite`);
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  // Le déclencheur d'encaissement tient normalement les documents à jour : ne
  // rien avoir à émettre est le cas NORMAL, et « aucun reçu ni quittance à
  // émettre » se lirait comme un échec.
  if (emission.quittances + emission.recus === 0)
    return { succes: "Reçus et quittances étaient déjà à jour." };
  return { succes: `${libelleEmission(emission.quittances, emission.recus)}.` };
}

// Envoi groupé : toutes les quittances du mois pas encore parties, chacune au
// bon locataire (e-mail + lien vers le document).
export async function envoyerQuittancesMois(orgId: string, mois: string): Promise<EtatLoyers> {
  const { supabase, user, role } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  // « Mon portefeuille » : l'envoi groupé d'un agent ne concerne que les baux
  // de ses mandats — sans portefeuille, comportement inchangé (tout part).
  const portefeuille = await lotsDuPortefeuille(supabase, orgId, role ?? "", user.id);

  const { data: rows, error } = await supabase
    .from("quittances")
    .select(
      "id, bail_id, appel:appels_loyer!quittances_appel_id_fkey(periode), bail:baux!quittances_bail_id_fkey(lot_id)"
    )
    .eq("organization_id", orgId)
    .is("email_envoye_at", null);
  if (error) return { erreur: sansJargon(error.message) };
  const cibles = ((rows ?? []) as {
    id: string;
    bail_id: string;
    appel: { periode: string } | { periode: string }[] | null;
    bail: { lot_id: string | null } | { lot_id: string | null }[] | null;
  }[])
    .filter((r) => {
      const a = Array.isArray(r.appel) ? r.appel[0] : r.appel;
      if (a?.periode?.slice(0, 7) !== mois) return false;
      const b = Array.isArray(r.bail) ? r.bail[0] : r.bail;
      return !portefeuille || (b?.lot_id != null && portefeuille.has(b.lot_id));
    });
  if (cibles.length === 0) return { succes: "Rien à envoyer : tout est déjà parti." };

  let envoyees = 0;
  const echecs: string[] = [];
  for (const q of cibles) {
    const resultat = await envoyerQuittance(orgId, q.bail_id, q.id);
    if (resultat.erreur) echecs.push(resultat.erreur);
    else envoyees += 1;
  }
  revalidatePath(`/agence/${orgId}/comptabilite`);
  if (echecs.length > 0)
    return {
      erreur: `${envoyees} envoyée${envoyees > 1 ? "s" : ""}, ${echecs.length} en échec — ${[...new Set(echecs)].join(" · ")}`,
    };
  return { succes: `${envoyees} quittance${envoyees > 1 ? "s" : ""} envoyée${envoyees > 1 ? "s" : ""}.` };
}
