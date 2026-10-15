"use server";

import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { sansJargon } from "@/lib/erreurs";
import { aujourdhuiParis, eur } from "@/lib/ged";
import { valeursDuFormulaire } from "@/lib/formulaires";
import { lireMontant } from "@/lib/saisie-montant";
import { estRejeuCleEnvoi, lireCleEnvoi, messageDejaEnregistre } from "@/lib/cle-envoi";
import { lireMoyenReglement, verifierDateReglement } from "@/lib/reglement-facture";
import { notifierEnCoulisses, notifierReglementFacture } from "@/lib/notifications";

/**
 * Le règlement DÉCLARATIF de la facture d'intervention (décision D23 du 14/10/2026, option A ; fiches PRO2-21, CHN-02).
 *
 * Le propriétaire ou le gérant déclare avoir réglé l'artisan ; Gerimmo n'exécute aucun paiement, aucun virement, aucun
 * prélèvement. La base (`enregistrer_reglement_facture`) écrit dans une seule transaction le règlement, la dépense
 * comptable liée, l'événement du fil et la ligne d'audit ; elle refuse une facture non validée, un montant au-delà du
 * reste à régler, une date future au jour de Paris, un mois comptable clos, un abonnement suspendu. L'action lit la
 * saisie telle que tapée (lib/saisie-montant.ts : jamais `Number()` sur un champ) et répond dans les mots du formulaire.
 *
 * Clé d'envoi (D05) : la même clé rejouée n'écrit rien, l'écran dit « déjà enregistré ». E-mail à l'artisan APRÈS le
 * succès, par `notifierEnCoulisses` : un envoi qui échoue est consigné et ne défait jamais le geste (réponse 4 de B.15).
 */
export type EtatReglementAction = {
  erreur?: string;
  succes?: string;
  // Saisie renvoyée en erreur pour que le formulaire la repose (recette 22/08).
  valeurs?: Record<string, string>;
  // D05 : cet envoi (même clé) était déjà enregistré. `succes` le dit ; rien n'a été écrit de plus.
  dejaEnregistre?: boolean;
};

function revaliderEcrans(orgId: string) {
  revalidatePath(`/agence/${orgId}/incidents`);
  revalidatePath(`/agence/${orgId}/comptabilite`);
  revalidatePath(`/agence/${orgId}/comptabilite/fiscal`);
  revalidatePath("/artisan/facturation");
}

export async function declarerReglementFacture(
  orgId: string,
  factureId: string,
  _etat: EtatReglementAction,
  formData: FormData
): Promise<EtatReglementAction> {
  const { supabase, user } = await verifierGerant(orgId, { geste: "reglement_facture", cible: factureId });
  if (!user) return { erreur: "Accès refusé." };
  const valeurs = valeursDuFormulaire(formData);

  const lu = lireMontant(formData.get("montant"));
  if ("erreur" in lu) return { erreur: lu.erreur, valeurs };
  // Le montant est lu au centime près par `lireMontant` ; il passe à la base en centimes entiers.
  const montantCents = Math.round(lu.montant * 100);

  const date = String(formData.get("date_reglement") ?? "").trim();
  const erreurDate = verifierDateReglement(date, aujourdhuiParis());
  if (erreurDate) return { erreur: erreurDate, valeurs };

  const moyenLu = lireMoyenReglement(formData.get("moyen"));
  if ("erreur" in moyenLu) return { erreur: moyenLu.erreur, valeurs };

  const reference = String(formData.get("reference") ?? "").trim();
  if (reference.length > 200) return { erreur: "La référence du règlement est trop longue (200 caractères au plus).", valeurs };

  const cleLue = lireCleEnvoi(formData.get("cle_envoi"));
  if ("erreur" in cleLue) return { erreur: cleLue.erreur, valeurs };

  const { data: reglementId, error } = await supabase.rpc("enregistrer_reglement_facture", {
    p_org: orgId,
    p_facture: factureId,
    p_montant_cents: montantCents,
    p_date_reglement: date,
    p_moyen: moyenLu.moyen,
    p_reference: reference || null,
    p_cle_envoi: cleLue.cle,
  });
  if (error) {
    if (estRejeuCleEnvoi(error)) {
      revaliderEcrans(orgId);
      return {
        succes: messageDejaEnregistre({ objet: "Ce règlement", montant: lu.montant, date }),
        dejaEnregistre: true,
      };
    }
    return { erreur: sansJargon(error.message), valeurs };
  }

  // L'artisan apprend la déclaration par e-mail, APRÈS le succès : son adresse n'est pas lisible par le client du gérant.
  if (typeof reglementId === "string") {
    await notifierEnCoulisses(supabase, { evenement: "facture_reglee", objet: reglementId, org: orgId }, (service) =>
      notifierReglementFacture(service, orgId, reglementId)
    );
  }
  revaliderEcrans(orgId);
  return {
    succes: `Règlement de ${eur(lu.montant)} enregistré et écrit au journal comptable. Aucun paiement bancaire n’a été effectué par Gerimmo ; l’artisan est prévenu de votre déclaration.`,
  };
}

export async function retirerReglementFacture(
  orgId: string,
  reglementId: string,
  _etat: EtatReglementAction,
  formData: FormData
): Promise<EtatReglementAction> {
  const { supabase, user } = await verifierGerant(orgId, { geste: "retrait_reglement_facture", cible: reglementId });
  if (!user) return { erreur: "Accès refusé." };
  const valeurs = valeursDuFormulaire(formData);
  const motif = String(formData.get("motif") ?? "").trim();
  if (!motif) return { erreur: "Indiquez le motif du retrait : il est écrit sur la contre-écriture.", valeurs };
  const { error } = await supabase.rpc("retirer_reglement_facture", { p_org: orgId, p_reglement: reglementId, p_motif: motif });
  if (error) return { erreur: sansJargon(error.message), valeurs };
  revaliderEcrans(orgId);
  return { succes: "Règlement retiré : la contre-écriture est passée au journal et l’état de la facture est recalculé. Le règlement reste visible, marqué « retiré »." };
}
