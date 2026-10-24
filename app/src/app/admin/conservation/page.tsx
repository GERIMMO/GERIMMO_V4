import { ConsoleSection } from "@/components/console-section";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formaterDateParis } from "@/lib/heure-paris";
import { dureeConservation, type RegleConservation } from "@/lib/conservation-reglages";
import { ReglagesConservation } from "./reglages";

export const metadata = { title: "Durées de conservation" };

export default async function ConservationAdmin() {
  const db = await createClient();
  const droit = await db.rpc("is_permanent_super_admin");
  if (droit.error || droit.data !== true) redirect("/admin/donnees");
  const [regles, historique] = await Promise.all([
    db.from("retention_rules").select("data_type,libelle,declencheur,duree_mois,duree_initiale_mois,minimum_mois,revision,actif,sort,updated_at").order("libelle"),
    db.from("audit_log").select("id,created_at,details").eq("action", "conservation_regle_modifiee").order("created_at", { ascending: false }).limit(30),
  ]);
  return <main className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-7">
    <Link href="/admin/parametres" className="lien-discret">← Paramètres généraux</Link>
    <header><h1>Durées de conservation</h1><p className="mt-2 text-muted-foreground">Choisissez une catégorie, ajustez sa durée et indiquez la raison du changement.</p></header>
    <div className="flex flex-wrap gap-4 text-sm"><Link className="lien-discret" href="/admin/donnees#conservation-contacts">Simuler le nettoyage sans supprimer</Link><Link className="lien-discret" href="/confidentialite#durees-actuelles">Voir les durées publiques</Link></div>
    {regles.error ? <p role="alert">Les réglages sont indisponibles. Aucune durée n’a été modifiée.</p> : <ReglagesConservation regles={(regles.data ?? []).map(r => ({ ...r, revision: Number(r.revision) })) as RegleConservation[]} />}
    <ConsoleSection titre="Historique des durées" description="Les 30 dernières modifications enregistrées." icone="historique" statut={historique.error ? "Lecture indisponible" : undefined}>

      {historique.error ? <p role="alert">Historique indisponible.</p> : !historique.data?.length ? <p className="text-muted-foreground">Les durées validées à la publication sont conservées. Aucun changement enregistré ici.</p> : <ol className="divide-y">{historique.data.map(h => {
        const d = h.details as { libelle: string; ancienne_duree_mois: number; nouvelle_duree_mois: number; motif: string };
        return <li key={h.id} className="py-3"><p className="font-medium">{d.libelle} · {dureeConservation(d.ancienne_duree_mois)} → {dureeConservation(d.nouvelle_duree_mois)}</p><p className="text-sm">{d.motif}</p><time className="text-xs text-muted-foreground">{formaterDateParis(h.created_at)}</time></li>;
      })}</ol>}
      <Link href="/admin/journaux?type=conservation_regle_modifiee" className="lien-discret text-sm">Consulter tout l’historique →</Link>
    </ConsoleSection>
  </main>;
}
