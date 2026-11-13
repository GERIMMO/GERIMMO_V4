"use server";

import { revalidatePath } from "next/cache";
import { envoyerQuittance } from "./loyers";
import { verifierGerant } from "@/lib/ged-acces";
import { lireCleEnvoi } from "@/lib/cle-envoi";
import { lireMontant, verifierDateDejaPassee } from "@/lib/saisie-montant";
import { sansJargon } from "@/lib/erreurs";
import { emettreRecusQuittances } from "@/lib/quittances";
import { bilanApresPaiement, type BilanReception } from "@/lib/bilan-reception-loyer";
import { eur } from "@/lib/ged";
import { envoyerEmail } from "@/lib/email";
import { piloteLimite } from "@/lib/perimetre-pilote";
import { adresseDuSite } from "@/lib/site";
import { aujourdhuiParis } from "@/lib/ged";
import { cleRelanceLoyer } from "@/lib/cles-idempotence-courriels";
import { corpsRelanceLoyer, sujetRelanceLoyer, type RelanceLoyer } from "@/lib/relance-loyer-email";
import { verifierCourrierDuBail, detteDuBail, idRelanceReception, NOTE_RELANCE_TABLEAU, type RappelLoyer } from "@/lib/rappels-loyers";

export type EtatReceptionLoyer = { erreur?: string; succes?: string; termine?: boolean; bilan?: BilanReception };

export async function declarerReceptionLoyer(orgId: string, appelId: string, _etat: EtatReceptionLoyer, form: FormData): Promise<EtatReceptionLoyer> {
  const { supabase, user, role } = await verifierGerant(orgId, { geste: "encaissement" });
  if (!user || role !== "proprietaire_direct") return { erreur: "Accès refusé." };
  const reponse = String(form.get("reponse") ?? "");
  if (!["recu", "partiel", "non_recu"].includes(reponse)) return { erreur: "Choisissez votre réponse." };
  const cle = lireCleEnvoi(form.get("cle_envoi"));
  if ("erreur" in cle) return { erreur: cle.erreur };
  const reste = lireMontant(form.get("reste_attendu"));
  if ("erreur" in reste) return { erreur: "Actualisez le tableau de bord pour vérifier le montant restant." };
  const montant = reponse === "non_recu" ? { montant: null } : lireMontant(form.get("montant"));
  if ("erreur" in montant) return { erreur: montant.erreur };
  const date = String(form.get("date_paiement") ?? "");
  const mode = String(form.get("mode") ?? "");
  if (reponse !== "non_recu") {
    if (reponse === "partiel" && montant.montant! >= reste.montant) return { erreur: "Le montant partiel doit être inférieur au reste à recevoir. Pour solder ce loyer, choisissez « J’ai reçu le loyer » ou « J’ai reçu le reste »." };
    if (reponse === "recu" && montant.montant !== reste.montant) return { erreur: "Le montant a changé. Actualisez le tableau de bord avant de confirmer la réception." };
    const erreurDate = verifierDateDejaPassee(date, "La date de réception");
    if (!date || erreurDate) return { erreur: erreurDate || "Indiquez la date réelle de réception." };
    if (!["virement", "cheque", "especes", "prelevement", "autre"].includes(mode)) return { erreur: "Choisissez le mode de règlement." };
  }
  const { data, error } = await supabase.rpc("declarer_reception_loyer", {
    p_org: orgId, p_appel: appelId, p_reponse: reponse, p_montant: montant.montant,
    p_date: reponse === "non_recu" ? null : date, p_mode: reponse === "non_recu" ? null : mode,
    p_cle: cle.cle, p_reste_attendu: reste.montant,
  });
  if (error) return { erreur: sansJargon(error.message) };
  const resultat = data as { statut?: string; bail_id?: string; montant?: number } | null;
  if (!resultat?.bail_id || !["non_recu", "deja_solde", "deja_enregistre", "enregistre", "annule"].includes(resultat.statut ?? ""))
    return { erreur: "La confirmation n’a pas pu être vérifiée. Actualisez le tableau de bord avant de recommencer." };
  for (const suffixe of ["", "/loyers", "/comptabilite", "/alertes", `/baux/${resultat.bail_id}`]) {
    revalidatePath(`/agence/${orgId}${suffixe}`);
    revalidatePath(`/espace/${orgId}${suffixe}`);
  }
  if (resultat.statut === "non_recu") return { bilan: { statut: "non_recu" }, succes: piloteLimite() ? "Votre réponse « Pas encore reçu » est enregistrée. L’envoi de relances par e-mail est suspendu." : "Votre réponse « Pas encore reçu » est enregistrée. Si les relances automatiques sont activées et leur délai atteint, cette confirmation autorise le prochain envoi. Le paiement sera revérifié avant toute relance." };
  if (resultat.statut === "annule") return { succes: "Ce règlement a été annulé dans le bail. Aucun règlement ajouté ; vérifiez votre compte bancaire avant une nouvelle déclaration." };
  if (resultat.statut === "deja_solde") return {
    succes: "Cette échéance est déjà soldée.", termine: true,
    bilan: await bilanApresPaiement(supabase, orgId, resultat.bail_id, appelId, "regle", null),
  };
  const emission = await emettreRecusQuittances(supabase, resultat.bail_id).catch(() => ({
    erreur: "La création du justificatif reste à vérifier.",
  }));
  const bilan = await bilanApresPaiement(supabase, orgId, resultat.bail_id, appelId,
    reponse === "partiel" ? "partiel" : "regle", cle.cle);
  const quittanceAttendue = reponse === "recu";
  const doc = bilan.document;
  if (doc && doc.quittance === quittanceAttendue && !doc.envoyeLe && doc.disponibilite === "disponible") {
    try {
      const envoi = await envoyerQuittance(orgId, resultat.bail_id, doc.id, quittanceAttendue);
      if (envoi.envoyeLe) doc.envoyeLe = envoi.envoyeLe;
      if (envoi.dateNonConsignee) bilan.informationEnvoi = "La date d’envoi reste à enregistrer dans le suivi.";
      else if (envoi.erreur) bilan.informationEnvoi = envoi.erreur;
    } catch {
      // Une erreur après l’encaissement ne doit jamais inviter à enregistrer le loyer une deuxième fois.
      bilan.informationEnvoi = "Envoi du justificatif à vérifier. Le règlement est enregistré.";
    }
  }
  const message = resultat.statut === "deja_enregistre"
    ? "Ce règlement est déjà enregistré. Aucun doublon ajouté."
    : `${eur(Number(resultat.montant))} reçus et enregistrés. ${reponse === "partiel" ? "Le rappel sera actualisé avec le montant restant." : "Cette échéance est soldée."}`;
  return { succes: emission.erreur ? `${message} Les documents restent à vérifier : ${emission.erreur}` : message, termine: reponse !== "partiel", bilan };
}

/** Relance amiable explicite : relecture du dû, clé stable et trace après acceptation de l'e-mail. */
export async function envoyerRelanceReception(orgId: string, appelId: string, _etat: EtatReceptionLoyer, form: FormData): Promise<EtatReceptionLoyer> {
  const { supabase, user, role } = await verifierGerant(orgId, { geste: "ajout_relance" });
  if (!user || role !== "proprietaire_direct") return { erreur: "Accès refusé." };
  if (form.get("confirmer") !== "oui") return { erreur: "Confirmez l’envoi de la relance au locataire." };
  const { data: abonnement, error: erreurOuverture } = await supabase.rpc("etat_abonnement", { p_org: orgId });
  if (erreurOuverture || !abonnement?.[0]?.ecriture_ouverte) return { erreur: "Les envois ne sont pas disponibles pour cet abonnement." };
  const { data, error } = await supabase.rpc("rappels_loyers_proprietaire", { p_org: orgId }).eq("appel_id", appelId).maybeSingle();
  const ligne = data as RappelLoyer | null;
  if (error) return { erreur: "Impossible de vérifier le loyer restant dû. Aucun message envoyé." };
  if (!ligne || ligne.date_echeance.slice(0,10) > aujourdhuiParis()) return { erreur: "Ce loyer n’est plus en attente à échéance. Aucun message envoyé." };
  if (ligne.date_echeance.slice(0,10) === aujourdhuiParis()) return { erreur: "Ce loyer est prévu aujourd’hui. La relance sera disponible dès demain si le règlement reste en attente." };
  const reste = Math.round((Number(ligne.montant_du) - Number(ligne.montant_couvert)) * 100) / 100;
  const resteAttendu = lireMontant(form.get("reste_attendu"));
  if ("erreur" in resteAttendu || resteAttendu.montant !== reste) return { erreur: "Le montant restant à recevoir a changé. Actualisez le tableau de bord avant de relancer le locataire." };
  // Comme les relances automatiques : le courrier dit aussi la dette échue totale du bail (audit du 27/10, NEW-01).
  const { data: lignesDuBail, error: erreurDette } = await supabase.rpc("rappels_loyers_proprietaire", { p_org: orgId }).eq("bail_id", ligne.bail_id);
  if (erreurDette || !Array.isArray(lignesDuBail) || lignesDuBail.length >= 1000) return { erreur: "Impossible de vérifier la dette totale du bail. Aucun message envoyé." };
  const totalDu = detteDuBail(lignesDuBail as RappelLoyer[], aujourdhuiParis()).resteEchu;
  const niveau = form.get("niveau") ?? "relance_1";
  if (niveau !== "relance_1" && niveau !== "relance_2") return { erreur: "Choisissez le palier de relance affiché." };
  const plusAncienne = (lignesDuBail as RappelLoyer[]).filter(l => Number(l.montant_du) > Number(l.montant_couvert))
    .sort((a,b) => a.periode.localeCompare(b.periode) || a.appel_id.localeCompare(b.appel_id))[0];
  if (plusAncienne?.appel_id !== appelId) return { erreur: "Reprenez le suivi depuis la plus ancienne échéance impayée." };
  const suivi = await verifierCourrierDuBail(supabase, orgId, ligne.bail_id, lignesDuBail, aujourdhuiParis(), niveau);
  if (suivi.erreur) return { erreur: suivi.erreur };
  const id = idRelanceReception(orgId, appelId, niveau);
  const { data: bail, error: erreurBail } = await supabase.from("baux").select("locataire_principal").eq("organization_id",orgId).eq("id",ligne.bail_id).maybeSingle();
  if (erreurBail || !bail?.locataire_principal) return { erreur: "Le destinataire n’a pas pu être vérifié. Aucun message envoyé." };
  const { data: personne, error: erreurPersonne } = await supabase.from("persons").select("email,prenom").eq("organization_id",orgId).eq("id",bail.locataire_principal).maybeSingle();
  const { data: organisation, error: erreurOrganisation } = await supabase.from("organizations").select("name").eq("id",orgId).maybeSingle();
  if (erreurPersonne || erreurOrganisation || !personne?.email?.trim() || !organisation) return { erreur: "Vérifiez l’adresse e-mail du locataire et votre profil avant l’envoi." };
  // Même règle que les relances du bail : les colocataires encore engagés reçoivent aussi le courrier.
  const { data: parties, error: erreurParties } = await supabase.from("bail_personnes").select("person_id,date_solidarite_fin")
    .eq("organization_id",orgId).eq("bail_id",ligne.bail_id).eq("role","colocataire");
  if (erreurParties) return { erreur: "Les colocataires du bail n’ont pas pu être vérifiés. Aucun message envoyé." };
  const personnesColocataires = [...new Set((parties ?? []).filter(p => p.person_id !== bail.locataire_principal && (!p.date_solidarite_fin || p.date_solidarite_fin >= aujourdhuiParis())).map(p => p.person_id))];
  const destinataires = new Map<string, { email: string; prenom: string | null }>();
  const ajouter = (email: string | null, prenom: string | null) => {
    const adresse = email?.trim();
    if (adresse && !destinataires.has(adresse.toLowerCase())) destinataires.set(adresse.toLowerCase(), { email: adresse, prenom });
  };
  ajouter(personne.email,personne.prenom);
  if (personnesColocataires.length) {
    const { data: colocataires, error: erreurColocataires } = await supabase.from("persons").select("email").eq("organization_id",orgId).in("id",personnesColocataires);
    if (erreurColocataires) return { erreur: "Les coordonnées des colocataires n’ont pas pu être vérifiées. Aucun message envoyé." };
    for (const colocataire of colocataires ?? []) ajouter(colocataire.email,null);
  }
  const site = adresseDuSite();
  if (!site || !/^https?:\/\//.test(site)) return { erreur: "L’adresse du site doit être configurée avant d’envoyer une relance." };
  let envoyes = 0;const erreursEnvoi:string[]=[];
  for (const destinataire of destinataires.values()) {
    const message: RelanceLoyer = { niveau, prenom: destinataire.prenom, emetteur: organisation.name, lot: ligne.lot_nom, periode: ligne.periode, dateEcheance: ligne.date_echeance, reste, totalDu, lien: `${site}/locataire/${orgId}/loyers` };
    const envoi = await envoyerEmail({ circuit:"app/actions/reception-loyer", repriseAutonome: false, organisation: { db: supabase, id: orgId }, to: destinataire.email,
      subject: sujetRelanceLoyer(message), html: corpsRelanceLoyer(message),
      cleIdempotence: cleRelanceLoyer({ bailId: ligne.bail_id, niveau, dateEcheance: ligne.date_echeance, destinataire: destinataire.email, role: "locataire", reste, totalDu }),
    });
    if(envoi.erreur){erreursEnvoi.push(envoi.erreur);continue;}
    envoyes += 1;
  }
  if(erreursEnvoi.length)return {erreur:`${envoyes} destinataire(s) accepté(s), ${erreursEnvoi.length} envoi(s) à terminer. La relance n’est pas marquée complète. ${erreursEnvoi[0]}`};
  const { error: erreurTrace } = await supabase.from("relances").upsert({ id, organization_id: orgId, bail_id: ligne.bail_id,
    niveau, date_envoi: aujourdhuiParis(), note: `${NOTE_RELANCE_TABLEAU} · échéance ${ligne.periode} · ${envoyes} destinataire${envoyes > 1 ? "s" : ""}`,
  }, { onConflict: "id", ignoreDuplicates: true });
  for (const suffixe of ["", "/alertes", `/baux/${ligne.bail_id}`]) {
    revalidatePath(`/agence/${orgId}${suffixe}`); revalidatePath(`/espace/${orgId}${suffixe}`);
  }
  return { succes: erreurTrace ? "La relance a été envoyée, mais sa trace au bail n’a pas pu être confirmée. Vérifiez le suivi avant tout nouvel envoi." : `Relance envoyée ${envoyes > 1 ? "au locataire et aux colocataires concernés" : "au locataire"} et enregistrée dans le suivi du bail.` };
}
