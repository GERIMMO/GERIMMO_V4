"use server";

// LES GESTES DE CONTRÔLE DE LA CONSOLE (audit console du 27/09, majeurs 7 et 8).
//
// Le porteur : « le super admin garde le contrôle, CHAQUE action est
// enregistrée, sans jamais emprunter l'identité d'un utilisateur ». Chaque
// geste ici :
// - est réservé au superviseur permanent en double vérification (garde
//   serveur, pas seulement la RLS) ;
// - est confirmé à l'écran (case « Je confirme ») et motivé quand il retire
//   un droit ;
// - est fait AU NOM DU SUPERVISEUR : aucune session n'est émise pour le
//   compte visé, aucun mot de passe n'est lu ni posé ;
// - laisse sa ligne au journal d'audit (dans la transaction SQL pour les
//   organisations, AVANT l'appel pour les comptes).

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { clientDeService } from "@/lib/supabase/service";
import { sansJargon } from "@/lib/erreurs";
import { adresseDeRetour } from "@/lib/site";
import { journaliserSupervision } from "@/lib/journal-supervision";

export type EtatControle = { erreur?: string; succes?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFUS_ACCES = "Ce geste demande votre compte de supervision et sa double vérification.";

async function superviseurPermanent() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_permanent_super_admin");
  return { supabase, ok: !error && data === true };
}

// ── Renvoyer l'invitation du responsable (majeur 7) ─────────────────────────
/**
 * Après « Ouvrir une organisation », l'invitation peut échouer (Resend). La
 * fiche le dit et propose ce geste : le même lien que « mot de passe oublié »,
 * envoyé au responsable rattaché — jamais à une adresse saisie librement.
 */
export async function renvoyerInvitation(orgId: string, _etat: EtatControle, form: FormData): Promise<EtatControle> {
  if (!UUID.test(orgId)) return { erreur: "Organisation introuvable." };
  const { supabase, ok } = await superviseurPermanent();
  if (!ok) return { erreur: REFUS_ACCES };
  if (form.get("confirmation") !== "oui") return { erreur: "Confirmez l’envoi de l’invitation." };
  const courriel = String(form.get("email") ?? "").trim().toLowerCase();
  const { data: responsables, error } = await supabase
    .from("memberships")
    .select("account:accounts(email)")
    .eq("organization_id", orgId)
    .in("role", ["admin_agence", "proprietaire_direct"]);
  if (error) return { erreur: "Les responsables de cette organisation n’ont pas pu être relus. Réessayez." };
  const adresses = ((responsables ?? []) as unknown as { account: { email: string } | { email: string }[] | null }[])
    .flatMap((r) => (Array.isArray(r.account) ? r.account : r.account ? [r.account] : []))
    .map((a) => a.email.toLowerCase());
  if (!courriel || !adresses.includes(courriel)) return { erreur: "Choisissez le responsable rattaché à cette organisation." };
  const { error: erreurMail } = await supabase.auth.resetPasswordForEmail(courriel, {
    redirectTo: `${adresseDeRetour()}/auth/confirm?next=/nouveau-mot-de-passe`,
  });
  // Le geste est journalisé, réussi ou non : un renvoi tenté est une action.
  const journal = await journaliserSupervision(supabase, "invitation_renvoyee", { envoyee: !erreurMail }, orgId);
  revalidatePath(`/admin/organisations/${orgId}`);
  if (erreurMail) return { erreur: `L’invitation n’est pas partie : ${sansJargon(erreurMail.message)}` };
  return { succes: `Invitation renvoyée à ${courriel}.${journal ? "" : " Sa ligne au journal d’audit n’a pas pu être écrite : signalez-le."}` };
}

// ── L'organisation (majeur 8) ───────────────────────────────────────────────
const GESTES_ORGANISATION = ["suspendre", "reactiver", "prolonger_essai", "archiver"] as const;
type GesteOrganisation = (typeof GESTES_ORGANISATION)[number];
const MESSAGES_ORGANISATION: Record<GesteOrganisation, string> = {
  suspendre: "Organisation suspendue : ses utilisateurs gardent la lecture, l’écriture est fermée.",
  reactiver: "Organisation réactivée.",
  prolonger_essai: "Essai prolongé.",
  archiver: "Organisation archivée : elle n’est pas supprimée et peut être réactivée.",
};

export async function controlerOrganisation(orgId: string, _etat: EtatControle, form: FormData): Promise<EtatControle> {
  if (!UUID.test(orgId)) return { erreur: "Organisation introuvable." };
  const geste = String(form.get("geste") ?? "") as GesteOrganisation;
  if (!GESTES_ORGANISATION.includes(geste)) return { erreur: "Choisissez un geste proposé sur cette fiche." };
  if (form.get("confirmation") !== "oui") return { erreur: "Cochez la confirmation avant d’appliquer ce geste." };
  const motif = String(form.get("motif") ?? "").trim().slice(0, 500);
  const jours = geste === "prolonger_essai" ? Number(form.get("jours")) : null;
  if ((geste === "suspendre" || geste === "archiver") && motif.length < 5) return { erreur: "Motivez ce geste en quelques mots : le motif est conservé au journal." };
  if (geste === "prolonger_essai" && (!Number.isInteger(jours) || jours! < 1 || jours! > 90)) return { erreur: "Prolongez l’essai de 1 à 90 jours." };
  const { supabase, ok } = await superviseurPermanent();
  if (!ok) return { erreur: REFUS_ACCES };
  // La fonction relit l'état sous verrou, applique et journalise dans la même transaction.
  const { error } = await supabase.rpc("controler_organisation", { p_org: orgId, p_geste: geste, p_jours: jours, p_motif: motif || null });
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/admin/organisations/${orgId}`);
  revalidatePath("/admin/clients");
  revalidatePath("/admin");
  return { succes: MESSAGES_ORGANISATION[geste] };
}

// ── Le compte (majeur 8) ────────────────────────────────────────────────────
const GESTES_COMPTE = ["bloquer", "debloquer", "reinitialiser_mfa"] as const;
type GesteCompte = (typeof GESTES_COMPTE)[number];
const ACTION_COMPTE = { bloquer: "compte_bloque", debloquer: "compte_debloque", reinitialiser_mfa: "second_facteur_reinitialise" } as const;

/**
 * Bloquer, débloquer un compte, ou réinitialiser son second facteur, par
 * l'API d'administration de Supabase (clé de service, côté serveur
 * seulement). Aucune session n'est ouverte au nom du compte visé.
 */
export async function controlerCompte(accountId: string, _etat: EtatControle, form: FormData): Promise<EtatControle> {
  if (!UUID.test(accountId)) return { erreur: "Compte introuvable." };
  const geste = String(form.get("geste") ?? "") as GesteCompte;
  if (!GESTES_COMPTE.includes(geste)) return { erreur: "Choisissez un geste proposé sur cette fiche." };
  if (form.get("confirmation") !== "oui") return { erreur: "Cochez la confirmation avant d’appliquer ce geste." };
  const motif = String(form.get("motif") ?? "").trim().slice(0, 300);
  if (geste !== "debloquer" && motif.length < 5) return { erreur: "Motivez ce geste en quelques mots : le motif est conservé au journal." };
  const { supabase, ok } = await superviseurPermanent();
  if (!ok) return { erreur: REFUS_ACCES };
  const { data: moi } = await supabase.auth.getUser();
  if (moi.user?.id === accountId) return { erreur: "Ce geste ne s’applique pas à votre propre compte : passez par « Sécurité du compte »." };
  const { data: dossier, error: lecture } = await supabase.rpc("dossier_compte_supervision", { p_account: accountId });
  const fiche = Array.isArray(dossier) ? (dossier[0] as { est_super_admin?: boolean } | undefined) : undefined;
  if (lecture || !fiche) return { erreur: "Compte introuvable." };
  // Un superviseur ne se bloque pas depuis la console : le plan de continuité
  // et le relais d'absence règlent ce cas, sans risque de verrouiller la supervision.
  if (fiche.est_super_admin && geste !== "debloquer") return { erreur: "Un compte de supervision ne se bloque pas depuis la console." };
  const service = clientDeService();
  if (!service) return { erreur: "La clé de service n’est pas posée : ce geste est indisponible (voir Santé et connexions)." };

  // Journalisé AVANT l'appel : un geste sur un compte sans trace n'est pas acceptable.
  if (!(await journaliserSupervision(supabase, ACTION_COMPTE[geste], { compte: accountId, ...(motif ? { motif } : {}) }))) {
    return { erreur: "Le geste n’a pas pu être inscrit au journal d’audit : il n’a pas été appliqué. Réessayez." };
  }
  let echec: string | null = null;
  try {
    if (geste === "reinitialiser_mfa") {
      const { data, error } = await service.auth.admin.mfa.listFactors({ userId: accountId });
      if (error) echec = error.message;
      for (const facteur of data?.factors ?? []) {
        if (echec) break;
        const { error: e } = await service.auth.admin.mfa.deleteFactor({ id: facteur.id, userId: accountId });
        if (e) echec = e.message;
      }
    } else {
      const { error } = await service.auth.admin.updateUserById(accountId, { ban_duration: geste === "bloquer" ? "876000h" : "none" });
      if (error) echec = error.message;
    }
  } catch (e) {
    echec = e instanceof Error ? e.message : "inconnu";
  }
  if (echec) {
    await journaliserSupervision(supabase, "controle_compte_echec", { compte: accountId, geste });
    return { erreur: `Le geste n’a pas abouti : ${sansJargon(echec)}` };
  }
  revalidatePath(`/admin/comptes/${accountId}`);
  return {
    succes:
      geste === "bloquer" ? "Compte bloqué : il ne peut plus se connecter ni prolonger sa session."
        : geste === "debloquer" ? "Compte débloqué."
          : "Second facteur réinitialisé : le compte devra en enregistrer un nouveau à sa prochaine connexion.",
  };
}
