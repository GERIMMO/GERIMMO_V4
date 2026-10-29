import Link from "next/link";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { aujourdhuiParis } from "@/lib/ged";
import { RelevesLocataire } from "@/components/releves-locataire";
import type { MonReleveConsommation } from "@/lib/consommations";
import { lireToutesLesPages } from "@/lib/lecture-complete";

export const metadata = { title: "Mes relevés" };
export default async function PageReleves({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { supabase } = await verifierAccesEspaceLocataire(orgId);
  const demandes = await lireToutesLesPages<MonReleveConsommation>((debut, fin) => supabase.rpc("mes_releves_consommation", { p_org: orgId }, { count: "exact" }).order("demande_id").range(debut, fin), r => r.demande_id);
  return <main className="mx-auto max-w-3xl space-y-5 p-4 sm:p-7"><Link href={`/locataire/${orgId}`} className="inline-flex min-h-11 items-center text-sm">← Mon logement</Link><header><h1>Mes relevés</h1><p className="mt-2 text-sm text-muted-foreground">Renseignez l’index. Une photo peut vous aider à le préremplir.</p></header>
    {demandes.echec ? <p role="alert">Vos demandes n’ont pas pu être chargées entièrement. Rechargez la page.</p> : <RelevesLocataire orgId={orgId} demandes={demandes.lignes.sort((a, b) => b.echeance.localeCompare(a.echeance))} aujourdHui={aujourdhuiParis()} />}
  </main>;
}
