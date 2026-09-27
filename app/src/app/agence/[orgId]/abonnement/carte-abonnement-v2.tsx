import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dateAbonnement, statutAbonnementV2, type EtatAbonnementV2 } from "@/lib/abonnement-v2";
import { formaterCentimes, GRILLE_PARTICULIERS } from "@/lib/tarification";

export async function CarteAbonnementV2({ supabase, orgId }: { supabase: SupabaseClient; orgId: string }) {
  const { data, error } = await supabase.rpc("lire_abonnement_v2", { p_org: orgId });
  const etat = error ? null : data as EtatAbonnementV2 | null;
  const nom = etat?.formule === "agence" ? "Agence" : GRILLE_PARTICULIERS.find(f => f.formule === etat?.formule)?.libelle;
  return <Link href={`/agence/${orgId}/abonnement`} className="loc-carte block transition-colors hover:border-[var(--marque)]">
    <div className="entete-carte !mb-2"><h2 className="text-[length:var(--pas-sous-titre)]">Mon abonnement</h2>
      {etat && <span className="puce puce-grise">{statutAbonnementV2(etat)}</span>}</div>
    {!etat ? <p className="text-sm text-muted-foreground">L’état de l’abonnement n’a pas pu être lu. Consultez le détail pour réessayer.</p> : <>
      <div className="ligne-info"><span>Portefeuille compté</span><b>{etat.volume_actuel} {etat.public_tarif === "agence" ? "lots" : "biens"}</b></div>
      {etat.stripe_subscription_id ? <>
        <div className="ligne-info"><span>{nom ?? "Formule"} · {etat.periodicite === "annuel" ? "annuel" : "mensuel"}</span><b>{etat.montant_centimes == null ? "À vérifier" : `${formaterCentimes(etat.montant_centimes)} ${etat.public_tarif === "agence" ? "HT" : "TTC"}`}</b></div>
        <div className="ligne-info"><span>{etat.annulation_demandee ? "Accès payé jusqu’au" : "Échéance"}</span><span>{dateAbonnement(etat.periode_fin)}</span></div>
        <div className="ligne-info"><span>Capacité confirmée</span><span>{etat.capacite} {etat.public_tarif === "agence" ? "lots" : "biens"}</span></div>
      </> : <p className="mt-2 text-sm text-muted-foreground">{etat.essai_fin && etat.ecriture_ouverte ? `Essai gratuit jusqu’au ${dateAbonnement(etat.essai_fin)}.` : "Souscription requise pour reprendre la gestion."} Aucun prélèvement sans votre accord.</p>}
      {etat.changement_programme && <p className="mt-2 text-sm text-muted-foreground">Changement programmé le {dateAbonnement(etat.changement_programme.date_effet)}. Consultez le récapitulatif.</p>}
    </>}
    <span className="lien-discret mt-3 block text-sm">Voir la formule, les paiements et les changements →</span>
  </Link>;
}
