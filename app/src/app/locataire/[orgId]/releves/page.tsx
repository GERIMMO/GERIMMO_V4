import Link from "next/link";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { aujourdhuiParis } from "@/lib/ged";
import { RelevesLocataire } from "@/components/releves-locataire";
import type { MonReleveConsommation } from "@/lib/consommations";
import { lireToutesLesPages } from "@/lib/lecture-complete";
import { TitreEcran } from "@/components/titre-ecran";
import { PanneLecture } from "../panne-lecture";
import { lireIdentiteContact } from "../identite-contact";
import { interlocuteurDeLIdentite } from "@/lib/identite-contact-locataire";

export const metadata = { title: "Mes relevés" };
export default async function PageReleves({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { supabase } = await verifierAccesEspaceLocataire(orgId);
  // Lot 47 : « votre gestionnaire » seulement dans un espace d'agence ; chez un propriétaire, « votre bailleur ».
  const qui = interlocuteurDeLIdentite(await lireIdentiteContact(orgId));
  const demandes = await lireToutesLesPages<MonReleveConsommation>((debut, fin) => supabase.rpc("mes_releves_consommation", { p_org: orgId }, { count: "exact" }).order("demande_id").range(debut, fin), r => r.demande_id);
  // Même gabarit que les autres pages de l'espace (20/11) : la page posait son propre <main> dans celui de la
  // coquille (deux repères principaux, double gouttière), un h1 nu et un retour « ← Mon logement » qui menait à
  // l'accueil. On y arrive par « Ce qui vous attend » : le retour nomme l'accueil, et y mène.
  return <div className="space-y-4">
    <Link href={`/locataire/${orgId}`} className="lien-discret inline-flex min-h-11 items-center text-sm">← Accueil</Link>
    <div className="entete-page">
      <TitreEcran rubrique="releves">Mes relevés</TitreEcran>
    </div>
    <p className="text-sm text-muted-foreground">Renseignez l’index. Une photo peut vous aider à le préremplir.</p>
    {demandes.echec ? <PanneLecture quoi="vos demandes de relevés" interlocuteur={qui} /> : <RelevesLocataire orgId={orgId} demandes={demandes.lignes.sort((a, b) => b.echeance.localeCompare(a.echeance))} aujourdHui={aujourdhuiParis()} />}
  </div>;
}
