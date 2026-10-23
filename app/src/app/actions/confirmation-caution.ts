"use server";

import { revalidatePath } from "next/cache";
import { clientDeService } from "@/lib/supabase/service";
import { sansJargon } from "@/lib/erreurs";
import { ipDeLaRequete } from "@/lib/lien-mot-de-passe";
import { fermetureModeleSignature } from "@/lib/signature-interrupteurs";
import { controlerEnvoi, envoyerApresControle } from "@/lib/signature-envoi";
import { LIMITE_CONFIRMATIONS_PAR_IP, empreinteJetonCaution, mobileCautionDepuisSaisie, mobileLisible } from "@/lib/confirmation-mobile-caution";
import type { CircuitBail } from "@/lib/signature-bail";

// LA CAUTION CONFIRME SON MOBILE (page publique /signature/caution/<jeton>, décision du dirigeant du 23/10/2026).
//
// Aucune session : le jeton du lien, gardé en base sous forme d'empreinte, est la seule preuve. L'ouverture de la page
// (GET, y compris par une messagerie qui pré-ouvre les liens) ne consomme rien ; seul l'envoi du formulaire, avec le
// numéro saisi deux fois, le consomme — une fois, sous verrou, en base. Ensuite, la demande de signature est créée avec
// CE numéro, au nom du propriétaire qui a envoyé le lien (la base revérifie qu'il est toujours propriétaire actif).
//
// Si l'envoi échoue après la confirmation, le numéro reste confirmé sur l'acte prêt : le propriétaire relance l'envoi
// depuis son espace sans redemander quoi que ce soit à la caution.

export type EtatConfirmationCaution = { erreur?: string; succes?: string };

const INDISPONIBLE = "Le service est momentanément indisponible. Réessayez dans un instant.";

export async function confirmerMobileCaution(jeton: string, _etat: EtatConfirmationCaution, formData: FormData): Promise<EtatConfirmationCaution> {
  const empreinte = empreinteJetonCaution(jeton);
  if (!empreinte) return { erreur: "Ce lien n’est pas valable." };
  const saisie = String(formData.get("mobile") ?? "").slice(0, 40);
  const repetition = String(formData.get("mobile_confirmation") ?? "").slice(0, 40);
  if (formData.get("personnel") !== "oui") return { erreur: "Confirmez que ce numéro est votre numéro de mobile personnel." };
  const lu = mobileCautionDepuisSaisie(saisie);
  if ("erreur" in lu) return { erreur: lu.erreur };
  const relu = mobileCautionDepuisSaisie(repetition);
  if ("erreur" in relu || relu.telephone !== lu.telephone) return { erreur: "Les deux numéros saisis ne sont pas identiques." };
  // Le réglage serveur qui suspend le cautionnement électronique ne consomme pas le lien.
  const fermeture = fermetureModeleSignature("cautionnement");
  if (fermeture) return { erreur: "La signature électronique de cet acte est suspendue pour le moment. Le bailleur vous proposera de le signer autrement." };

  const service = clientDeService();
  if (!service) return { erreur: INDISPONIBLE };
  const limite = await service.rpc("autoriser_lien_mot_de_passe_cle", { p_cle: `caution-mobile:ip:${(await ipDeLaRequete()) ?? "inconnue"}`, p_max: LIMITE_CONFIRMATIONS_PAR_IP });
  if (limite.error) return { erreur: INDISPONIBLE };
  if (limite.data !== true) return { erreur: "Trop de tentatives depuis une heure. Réessayez plus tard." };

  const conso = await service.rpc("consommer_confirmation_mobile_caution", { p_jeton_empreinte: empreinte, p_telephone: lu.telephone });
  const ligne = (conso.data as { circuit_id: string; organization_id: string; demande_par: string }[] | null)?.[0];
  if (conso.error || !ligne) return { erreur: sansJargon(conso.error?.message ?? "Ce lien n’est pas valable.") };

  const confirme = `Votre numéro ${mobileLisible(lu.telephone)} est confirmé.`;
  let bail: string | null = null;
  try {
    const { data, error } = await service.from("bail_signature_circuits").select("*").eq("id", ligne.circuit_id).eq("organization_id", ligne.organization_id).single();
    if (error || !data) throw new Error("L’acte n’est plus disponible.");
    const circuit = data as CircuitBail;
    bail = circuit.bail_id;
    const controle = await controlerEnvoi({ db: service, org: ligne.organization_id, bail: circuit.bail_id ?? circuit.cible_id ?? "", circuit });
    const envoi = await envoyerApresControle({ db: service, org: ligne.organization_id, circuit, acteur: ligne.demande_par, controle });
    if ("erreur" in envoi) throw new Error(envoi.erreur);
    rafraichir(ligne.organization_id, bail);
    return { succes: `${confirme} Vous allez recevoir de Zoho Sign l’invitation à signer l’acte de cautionnement. Vous y saisirez vous-même la mention de caution ; le code de signature sera envoyé par SMS à ce numéro.` };
  } catch (e) {
    const motif = e instanceof Error ? sansJargon(e.message) : "L’envoi n’a pas pu être confirmé.";
    // Le propriétaire le lit sur l'acte prêt (l'état « à vérifier » garde son propre motif).
    await service.from("bail_signature_circuits").update({ erreur: `La caution a confirmé son mobile, mais l’envoi en signature n’a pas pu partir : ${motif} Relancez l’envoi depuis le suivi de l’acte.`.slice(0, 1000), updated_at: new Date().toISOString() })
      .eq("id", ligne.circuit_id).eq("etat", "pret");
    rafraichir(ligne.organization_id, bail);
    return { erreur: `${confirme} L’envoi de l’acte n’a pas pu se faire pour le moment. Le bailleur en est informé et pourra le relancer sans vous redemander votre numéro.` };
  }
}

function rafraichir(org: string, bail: string | null) {
  if (!bail) return;
  revalidatePath(`/agence/${org}/baux/${bail}`);
  revalidatePath(`/espace/${org}/baux/${bail}`);
}
