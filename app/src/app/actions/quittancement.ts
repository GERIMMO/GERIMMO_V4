"use server";

import { revalidatePath } from "next/cache";
import { sansJargon } from "@/lib/erreurs";
import { verifierGerant } from "@/lib/ged-acces";
import { eur } from "@/lib/ged";
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
  const appel = ((lignes ?? []) as { appel_id: string; montant_du: number; montant_couvert: number }[])
    .find((l) => l.appel_id === appelId);
  if (!appel) return { erreur: "Appel de loyer introuvable." };
  const reste = Number(appel.montant_du) - Number(appel.montant_couvert);
  if (reste <= 0) return { erreur: "Cet appel est déjà couvert." };

  const { error } = await supabase.from("encaissements").insert({
    organization_id: orgId,
    bail_id: bailId,
    montant: Math.round(reste * 100) / 100,
    mode: "virement",
    note: "Encaissé depuis le quittancement",
  });
  if (error) return { erreur: sansJargon(error.message) };
  // L'encaissement déclenche tout : la quittance du mois soldé s'émet dans la
  // foulée (paiement partiel → reçu, promu en quittance au solde).
  const { error: erreurQuittance } = await supabase.rpc("emettre_quittances", { p_bail: bailId });
  revalidatePath(`/agence/${orgId}/comptabilite`);
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  if (erreurQuittance)
    return {
      succes: `${eur(reste)} encaissés — mais la quittance n'a pas pu être émise : ${sansJargon(erreurQuittance.message)}`,
    };
  return { succes: `${eur(reste)} encaissés · quittance émise.` };
}

// Émettre la quittance d'un bail dont le mois est soldé (payé sans quittance).
export async function emettreQuittanceBail(orgId: string, bailId: string): Promise<EtatLoyers> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const { data, error } = await supabase.rpc("emettre_quittances", { p_bail: bailId });
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/comptabilite`);
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: `${data ?? 0} quittance(s) émise(s).` };
}

// Envoi groupé : toutes les quittances du mois pas encore parties, chacune au
// bon locataire (e-mail + lien vers le document).
export async function envoyerQuittancesMois(orgId: string, mois: string): Promise<EtatLoyers> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const { data: rows, error } = await supabase
    .from("quittances")
    .select("id, bail_id, appel:appels_loyer!quittances_appel_id_fkey(periode)")
    .eq("organization_id", orgId)
    .is("email_envoye_at", null);
  if (error) return { erreur: sansJargon(error.message) };
  const cibles = ((rows ?? []) as { id: string; bail_id: string; appel: { periode: string } | { periode: string }[] | null }[])
    .filter((r) => {
      const a = Array.isArray(r.appel) ? r.appel[0] : r.appel;
      return a?.periode?.slice(0, 7) === mois;
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
