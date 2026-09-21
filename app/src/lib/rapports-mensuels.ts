import { createHash } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { envoyerEmail } from "@/lib/email";
import { deposerFichierGed } from "@/lib/ged-depot";
import { rendrePdf } from "@/lib/documents/rendu";
import { assemblerComplementGestion } from "@/lib/documents/modeles/catalogue-gestion";
import { echapper } from "@/lib/documents/gabarit";
import { sansJargon } from "@/lib/erreurs";
import { pdfComplet, TAILLE_MAX_OCTETS } from "@/lib/file-type";
import { refusDocumentIncomplet } from "@/lib/documents/completude";

type Rapport = { id: string; mandat_id: string; mois: string; statut: string };
export type RemiseRapport = { erreur?: string; succes?: string; documentId?: string };

// Appelé uniquement après contrôle de session et du rôle gérant. Toutes les
// lectures conservent la session et les RLS ; aucun client service-role.
export async function remettreRapportMensuel(
  db: SupabaseClient, user: User, orgId: string, rapportId: string, commentaire: string | null, role: string,
): Promise<RemiseRapport> {
  if (!["admin_agence", "agent", "proprietaire_direct"].includes(role)) return { erreur: "Accès refusé." };
  let documentId: string | undefined;
  try {
    const { data, error } = await db.from("rapports_gestion")
      .select("id,mandat_id,mois,statut").eq("id", rapportId).eq("organization_id", orgId).maybeSingle();
    if (error) return { erreur: "Le rapport n’a pas pu être lu. Aucun e-mail envoyé." };
    const rapport = data as Rapport | null;
    if (!rapport) return { erreur: "Rapport introuvable ou inaccessible." };
    const { data: mandat, error: erreurMandat } = await db.from("mandats")
      .select("person_id,agent_account_id").eq("id", rapport.mandat_id).eq("organization_id", orgId).maybeSingle();
    if (erreurMandat || !mandat) return { erreur: "Le mandat n’a pas pu être lu. Aucun e-mail envoyé." };
    if (role === "agent" && mandat.agent_account_id && mandat.agent_account_id !== user.id) {
      return { erreur: "Ce mandat appartient au portefeuille d’un autre gestionnaire." };
    }
    const { data: mandant, error: erreurMandant } = await db.from("persons")
      .select("email").eq("id", mandat.person_id).eq("organization_id", orgId).maybeSingle();
    if (erreurMandant || !mandant) return { erreur: "Le propriétaire n’a pas pu être lu. Aucun e-mail envoyé." };
    const email = String(mandant.email ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { erreur: "Renseignez une adresse e-mail valide sur la fiche du propriétaire avant l’envoi." };

    // Le statut historique « envoye » signifie rapport figé. Il n'est pas une
    // preuve de livraison : un échec Resend doit rester récupérable sans refaire
    // le gel ni créer une deuxième alerte de versement.
    if (rapport.statut === "a_valider") {
      const { error: erreurValidation } = await db.rpc("envoyer_rapport", {
        p_rapport: rapportId, p_commentaire: commentaire,
      });
      if (erreurValidation) return { erreur: sansJargon(erreurValidation.message) };
    } else if (rapport.statut !== "envoye") {
      return { erreur: "Ce rapport ne peut pas être transmis dans son état actuel." };
    }

    // Une tentative suivante réutilise exactement la copie conservée. Le PDF
    // n'est pas régénéré au gré des changements de coordonnées ou de modèle.
    const titreArchive = `Compte rendu mensuel · ${rapportId}`;
    const { data: archives, error: erreurArchive } = await db.from("documents")
      .select("id,storage_path,empreinte,mime_type,taille_octets")
      .eq("organization_id", orgId).eq("type", "rapport_gestion").eq("titre", titreArchive)
      .is("purged_at", null).order("created_at", { ascending: true }).limit(1);
    if (erreurArchive) return { erreur: "Rapport validé, mais la copie archivée n’a pas pu être vérifiée. Aucun e-mail envoyé ; réessayez." };
    const archive = archives?.[0];
    let pdf: Uint8Array;
    if (archive) {
      documentId = archive.id;
      if (!archive.storage_path?.startsWith(`${orgId}/`) || archive.mime_type !== "application/pdf" || archive.taille_octets > TAILLE_MAX_OCTETS) {
        return { erreur: "La copie du rapport doit être vérifiée dans Documents avant envoi.", documentId };
      }
      const { data: fichier, error: erreurFichier } = await db.storage.from("documents").download(archive.storage_path);
      if (erreurFichier || !fichier) return { erreur: "La copie du rapport est indisponible. Aucun e-mail envoyé ; réessayez.", documentId };
      pdf = new Uint8Array(await fichier.arrayBuffer());
      if (pdf.length > TAILLE_MAX_OCTETS || !pdfComplet(pdf) || createHash("sha256").update(pdf).digest("hex") !== archive.empreinte) {
        return { erreur: "La copie du rapport ne correspond pas à son empreinte. Aucun e-mail envoyé.", documentId };
      }
    } else {
      const assemblage = await assemblerComplementGestion("rapport_gestion", db, orgId, rapportId);
      if ("erreur" in assemblage) return { erreur: `Rapport validé, PDF non préparé : ${assemblage.erreur}` };
      const refus = refusDocumentIncomplet(assemblage.document);
      if (refus) return { erreur: `Rapport validé, PDF non préparé : ${refus.manquants.join(" · ")}. Complétez le dossier puis réessayez.` };
      pdf = await rendrePdf(assemblage.document);
      const depot = await deposerFichierGed(db, user, orgId,
        new File([pdf as BlobPart], `rapport-${rapport.mois.slice(0,7)}.pdf`, { type: "application/pdf" }),
        "rapport_gestion", titreArchive);
      if (depot.erreur || !depot.documentId) return { erreur: "Rapport validé, mais l’archivage du PDF a échoué. Aucun e-mail envoyé ; réessayez." };
      documentId = depot.documentId;
    }
    // Le rattachement est également réparé après une interruption entre dépôt
    // et liens. La clé composée empêche les doublons de liens.
    const { error: erreurLiens } = await db.from("document_liens").upsert([
      { document_id: documentId, organization_id: orgId, entite: "mandat", entite_id: rapport.mandat_id },
      { document_id: documentId, organization_id: orgId, entite: "personne", entite_id: mandat.person_id },
    ], { onConflict: "document_id,entite,entite_id", ignoreDuplicates: true });
    if (erreurLiens) return { erreur: "Le PDF est conservé, mais son rattachement a échoué. Aucun e-mail envoyé ; réessayez.", documentId };

    const mois = rapport.mois.slice(0, 7);
    const resultat = await envoyerEmail({
      to: email,
      subject: `Votre compte rendu de gestion — ${mois}`,
      html: `<div style="font-family:sans-serif;line-height:1.6"><h2>Votre compte rendu mensuel</h2><p>Bonjour,</p><p>Vous trouverez en pièce jointe votre compte rendu de gestion pour ${echapper(mois)}, avec le détail des opérations enregistrées et le net du rapport.</p><p>Vous pouvez consulter et conserver ce PDF sans compte Gerimmo. Pour toute question, contactez votre agence.</p><p>— Votre agence</p></div>`,
      piecesJointes: [{ nom: `compte-rendu-${mois}-${rapportId.slice(0,8)}.pdf`, contenuBase64: Buffer.from(pdf).toString("base64") }],
      // Protection Resend 24 h contre double clic/réponse réseau perdue.
      // Un renvoi volontaire après ce délai reste possible depuis l'agence.
      cleIdempotence: `rapport/${rapportId}/${createHash("sha256").update(email.toLowerCase()).digest("hex")}`,
    });
    const erreurRemise = resultat.erreur || (!resultat.id ? "Le service n’a pas renvoyé de référence d’envoi." : null);
    const { error: erreurTrace } = await db.rpc("log_tech", { evenement: "remise_rapport_mensuel", details: {
      organization_id: orgId, rapport_id: rapportId, document_id: documentId,
      resultat: erreurRemise ? "echec" : "accepte_prestataire", email_id: resultat.id ?? null,
    } });
    if (erreurRemise) return { erreur: `Rapport validé et PDF conservé. L’e-mail n’a pas été confirmé : ${erreurRemise} Vous pouvez réessayer l’envoi.`, documentId };
    return { succes: `Compte rendu complet joint à l’e-mail, accepté par le service d’envoi. La réception n’est pas encore confirmée.${erreurTrace ? " Le journal technique n’a pas pu être enregistré." : ""}`, documentId };
  } catch (e) {
    console.error("[rapport-mensuel] remise interrompue", e);
    return { erreur: "La remise du rapport n’a pas pu être confirmée. Vérifiez le dossier puis réessayez ; la copie déjà conservée sera réutilisée.", documentId };
  }
}
