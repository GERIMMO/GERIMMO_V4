import Link from "next/link";
import { TitreEcran } from "@/components/titre-ecran";
import { deElide } from "@/lib/elision";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { chargerQuittancementDuMois } from "@/lib/quittancement-du-mois";
import { eur, moisEnFrancais } from "@/lib/ged";
import { FormulaireSupport } from "./formulaire-support";

// Le lien d'entrée, depuis l'espace du client, dit « Ouvrir le support » : l'onglet et le titre commencent par ce mot.
export const metadata = { title: "Support" };

export default async function PageSupport({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const supabase = await createClient();
  const { data: sa, error: acces } = await supabase.rpc("is_permanent_super_admin");
  if (acces || sa !== true) redirect("/espaces");
  const { data: org } = await supabase.from("organizations").select("id,name").eq("id", orgId).maybeSingle();
  if (!org) notFound();
  const { lignes, mois, error } = await chargerQuittancementDuMois(supabase, orgId, () => true);
  return <main>
    <Link href={`/admin/organisations/${orgId}`} className="lien-retour">← {org.name}</Link>
    <header className="entete-page"><div><TitreEcran rubrique="finances">Support — {org.name}</TitreEcran>
    <p className="mt-2 text-muted-foreground">L’espace client reste en lecture seule. Ici, vous pouvez enregistrer un virement déjà reçu pour un appel de loyer précis. Chaque geste exige un motif, expire après cinq minutes et conserve votre identité au journal. Les autres modifications de gestion restent fermées.</p></div></header>
    <div className="max-w-3xl space-y-4">
    <h2 className="text-[length:var(--titre-2)]">Appels de loyer {deElide(moisEnFrancais(mois))}</h2>
    {error ? <p role="alert" className="err">Les soldes n’ont pas pu être relus. Réessayez.</p> : lignes.filter((l) => Number(l.montant_du) > Number(l.montant_couvert)).map((l) => {
      const reste = Math.round((Number(l.montant_du) - Number(l.montant_couvert)) * 100) / 100;
      return <details key={l.appel_id} className="loc-carte">
        <summary className="min-h-11 cursor-pointer content-center font-semibold">{l.lot_nom} — {l.locataire || "Locataire"} — reste {eur(reste)}</summary>
        <div className="mt-4"><FormulaireSupport orgId={orgId} bailId={l.bail_id} appelId={l.appel_id} reste={reste} anterieure={Number(l.dette_anterieure_reste || 0)} /></div>
      </details>;
    })}
    {!error && !lignes.some((l) => Number(l.montant_du) > Number(l.montant_couvert)) && <div className="vide-guide"><p className="titre">Aucun reste à encaisser sur cette période.</p><p className="explication">Aucun appel de loyer de ce mois n’a de reste à payer : il n’y a pas de virement à enregistrer.</p><div className="geste"><Link className="btn-secondaire" href={`/admin/organisations/${orgId}`}>Revenir à la fiche du client</Link></div></div>}
    </div>
  </main>;
}
