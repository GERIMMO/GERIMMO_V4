"use server";

// L'avenant signé d'un bail (audit palier 1 du 22/11/2026, P1-14).
//
// Jusque-là, l'avenant n'était qu'un PDF à faire signer : rien n'était enregistré, et le loyer appelé chaque mois
// restait celui d'avant. Ces deux gestes enregistrent l'avenant SIGNÉ (sa pièce est obligatoire) et l'annulent tant
// qu'il n'est pas appliqué. Toutes les règles sont dans la base (migration 20261122190000) : la date d'effet au 1er
// d'un mois non encore appelé, un seul avenant en attente, la hausse refusée sur un logement classé F ou G.
//
// La pièce suit le geste du congé (actions/baux.ts) : l'octet monte au stockage, sa fiche naît DANS la transaction de
// l'avenant. Un refus ne laisse donc aucune pièce rangée à vide, dont l'empreinte bloquerait le nouvel essai.

import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { abandonnerPieceGed, preparerFichierGed } from "@/lib/ged-depot";
import { resoudreDepotsFormulaire } from "@/lib/depot-direct";
import { sansJargon } from "@/lib/erreurs";
import { valeursDuFormulaire } from "@/lib/formulaires";
import { erreurDuChamp, lireMontant, lireMontantFacultatif } from "@/lib/saisie-montant";
import { estUuid } from "@/lib/identifiants";
import { aujourdhuiParis } from "@/lib/ged";
import { libellePremierDuMois } from "@/lib/avenants-bail";

export type EtatAvenantBailAction = { erreur?: string; succes?: string; valeurs?: Record<string, string> };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function rafraichir(orgId: string, bailId: string) {
  for (const racine of ["agence", "espace"]) {
    revalidatePath(`/${racine}/${orgId}/baux/${bailId}`);
    revalidatePath(`/${racine}/${orgId}/loyers`, "layout");
    revalidatePath(`/${racine}/${orgId}/documents`);
  }
  revalidatePath(`/locataire/${orgId}`, "layout");
}

export async function enregistrerAvenantBail(orgId: string, bailId: string, _etat: EtatAvenantBailAction, form: FormData): Promise<EtatAvenantBailAction> {
  if (!estUuid(orgId) || !estUuid(bailId)) return { erreur: "Accès refusé." };
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const valeurs = valeursDuFormulaire(form);

  const objet = String(form.get("objet") ?? "").trim();
  if (objet.length < 5 || objet.length > 500) return { erreur: "Indiquez l’objet de l’avenant (5 à 500 caractères).", valeurs };
  const signeLe = String(form.get("signe_le") ?? "").trim();
  if (!DATE.test(signeLe)) return { erreur: "Indiquez la date de signature de l’avenant.", valeurs };
  if (signeLe > aujourdhuiParis()) return { erreur: "La date de signature ne peut pas être dans le futur : l’avenant s’enregistre une fois signé.", valeurs };
  const dateEffet = String(form.get("date_effet") ?? "").trim();
  if (!DATE.test(dateEffet) || !dateEffet.endsWith("-01")) return { erreur: "Choisissez le mois à partir duquel l’avenant s’applique.", valeurs };

  const loyer = lireMontant(form.get("loyer_hc"));
  if ("erreur" in loyer) return { erreur: erreurDuChamp("Nouveau loyer hors charges", loyer.erreur), valeurs };
  const charges = lireMontantFacultatif(form.get("charges"));
  if ("erreur" in charges) return { erreur: erreurDuChamp("Nouvelles charges", charges.erreur), valeurs };
  if (charges.montant === null) return { erreur: "Indiquez les charges après l’avenant (0 s’il n’y en a pas).", valeurs };

  const erreurDepotDirect = await resoudreDepotsFormulaire(supabase, form);
  if (erreurDepotDirect) return { erreur: erreurDepotDirect, valeurs };
  const fichier = form.get("fichier");
  if (!(fichier instanceof File) || !fichier.size) return { erreur: "Joignez l’avenant signé par les parties : sans lui, rien n’est enregistré.", valeurs };

  const prep = await preparerFichierGed(supabase, orgId, fichier);
  if (prep.erreur || !prep.fichier) return { erreur: prep.erreur ?? "L’avenant signé n’a pas pu être déposé.", valeurs };
  const piece = prep.fichier;
  const { error } = await supabase.rpc("enregistrer_avenant_bail", {
    p_org: orgId,
    p_bail: bailId,
    p_objet: objet,
    p_signe_le: signeLe,
    p_date_effet: dateEffet,
    p_loyer_hc: loyer.montant,
    p_charges: charges.montant,
    p_storage_path: piece.chemin,
    p_mime: piece.mime,
    p_taille: piece.taille,
    p_empreinte: piece.empreinte,
  });
  if (error) {
    await abandonnerPieceGed(supabase, piece);
    return { erreur: sansJargon(error.message), valeurs };
  }
  rafraichir(orgId, bailId);
  const applique = dateEffet <= aujourdhuiParis();
  const base = applique
    ? "Avenant enregistré et appliqué : le loyer et les charges du bail sont à jour."
    : `Avenant enregistré. Il s’appliquera de lui-même au loyer du ${libellePremierDuMois(dateEffet)} ; d’ici là, rien ne change.`;
  return { succes: prep.avertissement ? `${base} ${prep.avertissement}` : base };
}

export async function annulerAvenantBail(orgId: string, bailId: string, avenantId: string, _etat: EtatAvenantBailAction, form: FormData): Promise<EtatAvenantBailAction> {
  if (!estUuid(orgId) || !estUuid(bailId) || !estUuid(avenantId)) return { erreur: "Accès refusé." };
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const valeurs = valeursDuFormulaire(form);
  const motif = String(form.get("motif_annulation") ?? "").trim();
  if (motif.length < 5 || motif.length > 500) return { erreur: "Indiquez le motif de l’annulation (5 à 500 caractères).", valeurs };
  const { error } = await supabase.rpc("annuler_avenant_bail", { p_org: orgId, p_avenant: avenantId, p_motif: motif });
  if (error) return { erreur: sansJargon(error.message), valeurs };
  rafraichir(orgId, bailId);
  return { succes: "Avenant annulé : le loyer et les charges du bail restent ceux d’avant. Sa pièce reste au dossier." };
}
