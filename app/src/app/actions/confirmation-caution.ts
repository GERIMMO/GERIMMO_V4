"use server";

import { revalidatePath } from "next/cache";
import { clientDeService } from "@/lib/supabase/service";
import { sansJargon } from "@/lib/erreurs";
import { ipDeLaRequete } from "@/lib/lien-mot-de-passe";
import { fermetureModeleSignature } from "@/lib/signature-interrupteurs";
import { controlerEnvoi, envoyerApresControle, estCircuitDeBail, garantsSansMobileConfirme, type EtapeEchecEnvoi } from "@/lib/signature-envoi";
import { LIMITE_CONFIRMATIONS_PAR_IP, MESSAGES_LIEN_CAUTION_CLOS, acteDuLienCaution, empreinteJetonCaution, mobileCautionDepuisSaisie, mobileLisible } from "@/lib/confirmation-mobile-caution";
import type { CircuitBail, SignataireBail } from "@/lib/signature-bail";

// LA CAUTION CONFIRME SON MOBILE (page publique /signature/caution/<jeton>, décision du dirigeant du 23/10/2026).
//
// Aucune session : le jeton du lien, gardé en base sous forme d'empreinte, est la seule preuve. L'ouverture de la page
// (GET, y compris par une messagerie qui pré-ouvre les liens) ne consomme rien ; seul l'envoi du formulaire, avec le
// numéro saisi deux fois, le consomme — une fois, sous verrou, en base. Ensuite, la demande de signature est créée avec
// CE numéro, au nom du propriétaire qui a envoyé le lien (la base revérifie qu'il est toujours propriétaire actif).
//
// Si l'envoi échoue après la confirmation, le message dit ce qui se passe ensuite (relecture du 24/10) :
//  · échec avant la réservation : le numéro reste confirmé sur l'acte prêt, le propriétaire relance l'envoi depuis son
//    espace sans rien redemander à la caution ;
//  · réservation défaite : le circuit est annulé, une nouvelle préparation enverra un nouveau lien ;
//  · échec après l'appel au prestataire : l'envoi est à vérifier, l'invitation est peut-être partie.
//
// LE GARANT QUI SIGNE AUSSI LE BAIL (décision du 24/10) passe par la même page. Après sa confirmation, les numéros que
// les autres garants ont déjà confirmés pour leur acte de cautionnement sont repris ; le bail part quand tous les
// garants ont confirmé, sinon il attend les autres. Le réglage qui suspend le cautionnement électronique ne le touche
// pas. Le contrôle de mise en location, qui exige la session du propriétaire, a été fait quand il a demandé l'envoi.

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
  const service = clientDeService();
  if (!service) return { erreur: INDISPONIBLE };
  // Le réglage serveur qui suspend le cautionnement électronique ne consomme pas le lien ; il ne touche pas le lien
  // d'un garant qui signe le bail (lu seulement quand le réglage est posé).
  if (fermetureModeleSignature("cautionnement")) {
    let acte: Awaited<ReturnType<typeof acteDuLienCaution>> = null;
    try { acte = await acteDuLienCaution(service, empreinte); } catch { return { erreur: INDISPONIBLE }; }
    if (acte !== "bail") return { erreur: MESSAGES_LIEN_CAUTION_CLOS.suspendu };
  }
  const limite = await service.rpc("autoriser_lien_mot_de_passe_cle", { p_cle: `caution-mobile:ip:${(await ipDeLaRequete()) ?? "inconnue"}`, p_max: LIMITE_CONFIRMATIONS_PAR_IP });
  if (limite.error) return { erreur: INDISPONIBLE };
  if (limite.data !== true) return { erreur: "Trop de tentatives depuis une heure. Réessayez plus tard." };

  const conso = await service.rpc("consommer_confirmation_mobile_caution", { p_jeton_empreinte: empreinte, p_telephone: lu.telephone });
  const ligne = (conso.data as { circuit_id: string; organization_id: string; demande_par: string }[] | null)?.[0];
  if (conso.error || !ligne) return { erreur: sansJargon(conso.error?.message ?? "Ce lien n’est pas valable.") };

  const confirme = `Votre numéro ${mobileLisible(lu.telephone)} est confirmé.`;
  let bail: string | null = null;
  let etape: EtapeEchecEnvoi = "avant_envoi";
  // Libellés selon l'acte : l'acte de cautionnement (la caution), ou le bail que le garant signe aussi.
  let estBail = false;
  const lActe = () => (estBail ? "le bail" : "l’acte");
  const dActe = () => (estBail ? "du bail" : "de l’acte");
  try {
    const { data, error } = await service.from("bail_signature_circuits").select("*").eq("id", ligne.circuit_id).eq("organization_id", ligne.organization_id).single();
    if (error || !data) throw new Error("L’acte n’est plus disponible.");
    let circuit = data as CircuitBail;
    bail = circuit.bail_id;
    estBail = estCircuitDeBail(circuit);
    if (estBail) {
      // Les numéros que les autres garants ont déjà confirmés pour leur acte de cautionnement sont repris.
      const repris = await service.rpc("reprendre_mobiles_garants_bail", { p_circuit: circuit.id });
      if (repris.error || !Array.isArray(repris.data) || repris.data.length !== circuit.signataires.length) throw new Error("Les numéros des garants n’ont pas pu être relus.");
      circuit = { ...circuit, signataires: repris.data as SignataireBail[] };
      const restants = garantsSansMobileConfirme(circuit.signataires).length;
      if (restants) {
        rafraichir(ligne.organization_id, bail);
        return { succes: `${confirme} Le bail partira en signature dès que ${restants > 1 ? "les autres garants auront confirmé le leur" : "l’autre garant aura confirmé le sien"}. Vous recevrez alors de Zoho Sign, à votre tour, l’invitation à signer le bail ; le code de signature sera envoyé par SMS à ce numéro.` };
      }
    }
    const controle = await controlerEnvoi({ db: service, org: ligne.organization_id, bail: circuit.bail_id ?? circuit.cible_id ?? "", circuit, miseEnLocationDejaControlee: estBail });
    const envoi = await envoyerApresControle({ db: service, org: ligne.organization_id, circuit, acteur: ligne.demande_par, controle });
    if ("erreur" in envoi) {
      etape = envoi.etape;
      throw new Error(envoi.erreur);
    }
    rafraichir(ligne.organization_id, bail);
    return { succes: estBail
      ? `${confirme} Vous recevrez de Zoho Sign, à votre tour, l’invitation à signer le bail ; le code de signature sera envoyé par SMS à ce numéro.`
      : `${confirme} Vous allez recevoir de Zoho Sign l’invitation à signer l’acte de cautionnement. Vous y saisirez vous-même la mention de caution ; le code de signature sera envoyé par SMS à ce numéro.` };
  } catch (e) {
    rafraichir(ligne.organization_id, bail);
    if (etape === "abandonne") {
      // Le circuit est annulé (il garde son propre motif) : une nouvelle préparation repart d'un nouveau lien.
      return { erreur: `${confirme} L’envoi ${dActe()} n’a pas pu se faire. Le bailleur le voit dans son espace : il devra préparer de nouveau ${lActe()}${estBail ? ". Votre numéro confirmé sera repris, sans nouveau lien." : ", et vous recevrez alors un nouveau lien pour confirmer votre numéro."}` };
    }
    if (etape === "a_verifier") {
      return { erreur: `${confirme} L’envoi ${dActe()} doit être vérifié : l’invitation de Zoho Sign vous parviendra peut-être dans les prochaines minutes. Sinon, le bailleur reprendra l’envoi depuis son espace, et vous recevrez peut-être un nouveau lien.` };
    }
    // Deux garants du bail qui confirment en même temps : l'envoi est parti par la confirmation de l'autre.
    if (estBail) {
      const { data: actuel } = await service.from("bail_signature_circuits").select("etat").eq("id", ligne.circuit_id).eq("organization_id", ligne.organization_id).maybeSingle();
      if (actuel && ["preparation", "en_cours"].includes(String((actuel as { etat?: string }).etat))) {
        return { succes: `${confirme} Vous recevrez de Zoho Sign, à votre tour, l’invitation à signer le bail ; le code de signature sera envoyé par SMS à ce numéro.` };
      }
    }
    const motif = e instanceof Error ? sansJargon(e.message) : "L’envoi n’a pas pu être confirmé.";
    // Le propriétaire le lit sur l'acte prêt.
    await service.from("bail_signature_circuits").update({ erreur: `${estBail ? "Les garants ont confirmé leur mobile" : "La caution a confirmé son mobile"}, mais l’envoi en signature n’a pas pu partir : ${motif} Relancez l’envoi depuis le suivi ${dActe()}.`.slice(0, 1000), updated_at: new Date().toISOString() })
      .eq("id", ligne.circuit_id).eq("etat", "pret");
    return { erreur: `${confirme} L’envoi ${dActe()} n’a pas pu se faire pour le moment. Le bailleur le voit dans son espace et pourra le relancer sans vous redemander votre numéro.` };
  }
}

function rafraichir(org: string, bail: string | null) {
  if (!bail) return;
  revalidatePath(`/agence/${org}/baux/${bail}`);
  revalidatePath(`/espace/${org}/baux/${bail}`);
}
