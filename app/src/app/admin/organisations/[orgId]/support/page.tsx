import Link from "next/link";
import { deElide } from "@/lib/elision";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { chargerQuittancementDuMois } from "@/lib/quittancement-du-mois";
import { eur, moisEnFrancais } from "@/lib/ged";
import { FormulaireSupport } from "./formulaire-support";

export const metadata = { title: "Geste de support" };

export default async function PageSupport({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const supabase = await createClient();
  const { data: sa, error: acces } = await supabase.rpc("is_permanent_super_admin");
  if (acces || sa !== true) redirect("/espaces");
  const { data: org } = await supabase.from("organizations").select("id,name").eq("id", orgId).maybeSingle();
  if (!org) notFound();
  const { lignes, mois, error } = await chargerQuittancementDuMois(supabase, orgId, () => true);
  return <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-7">
    <Link href={`/admin/organisations/${orgId}`} className="underline">Retour à la fiche du client</Link>
    <h1>Support — {org.name}</h1>
    <p>L’espace client reste en lecture seule. Ici, vous pouvez enregistrer un virement déjà reçu pour un appel de loyer précis. Chaque geste exige un motif, expire après cinq minutes et conserve votre identité au journal. Les autres modifications de gestion restent fermées.</p>
    <h2>Appels {deElide(moisEnFrancais(mois))}</h2>
    {error ? <p role="alert" className="err">Les soldes n’ont pas pu être relus. Réessayez.</p> : lignes.filter((l) => Number(l.montant_du) > Number(l.montant_couvert)).map((l) => {
      const reste = Math.round((Number(l.montant_du) - Number(l.montant_couvert)) * 100) / 100;
      return <details key={l.appel_id} className="rounded-xl border p-4">
        <summary className="cursor-pointer font-semibold">{l.lot_nom} — {l.locataire || "Locataire"} — reste {eur(reste)}</summary>
        <div className="mt-4"><FormulaireSupport orgId={orgId} bailId={l.bail_id} appelId={l.appel_id} reste={reste} anterieure={Number(l.dette_anterieure_reste || 0)} /></div>
      </details>;
    })}
    {!error && !lignes.some((l) => Number(l.montant_du) > Number(l.montant_couvert)) && <p>Aucun reste à encaisser sur cette période.</p>}
  </main>;
}
