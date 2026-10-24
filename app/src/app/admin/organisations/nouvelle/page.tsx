import { LectureIndisponible } from "../../lecture-indisponible";
import { TitreEcran } from "@/components/titre-ecran";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FormulaireOuverture } from "./formulaire-ouverture";

export const metadata = { title: "Ouvrir une organisation" };

/**
 * L'ouverture d'une organisation, réservée au super admin (RM-16.1.1 : la
 * création d'agence suit la signature du contrat commercial).
 *
 * Elle s'ouvre aussi depuis une demande de devis : `?demande=<id>` préremplit
 * le nom et l'adresse, et marque la demande traitée une fois l'organisation
 * créée — sans quoi la file garde une ligne dont la suite a déjà eu lieu.
 */
export default async function PageOuvrirOrganisation(
  props: PageProps<"/admin/organisations/nouvelle">
) {
  const { demande } = await props.searchParams;
  const idDemande = typeof demande === "string" ? demande : undefined;

  let prefill: { nom?: string; email?: string; demandeId?: string } | undefined;
  if (idDemande) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("demandes_devis")
      .select("id, nom, email, agence, traitee_le")
      .eq("id", idDemande)
      .maybeSingle();
    if (error) return <main className="p-4 sm:p-7"><LectureIndisponible sujet="Demande de contact" retour={`/admin/organisations/nouvelle?demande=${encodeURIComponent(idDemande)}`} /></main>;
    if (!data || data.traitee_le) return <main className="p-4 sm:p-7"><p>Cette demande est introuvable ou déjà traitée.</p><Link className="lien-discret" href="/admin/devis">Revenir aux demandes</Link></main>;
    const d = data as { id: string; nom: string; email: string; agence: string | null } | null;
    if (d) prefill = { nom: d.agence ?? d.nom, email: d.email, demandeId: d.id };
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-4 sm:p-7">
      <Link href="/admin/clients" className="lien-discret text-[13px]">
        ← Utilisateurs
      </Link>
      <div className="entete-page mb-6 mt-2">
        <TitreEcran rubrique="entreprise">Ouvrir une organisation</TitreEcran>
      </div>

      <p className="mesure-lecture mb-5 text-sm text-muted-foreground">
        Le responsable recevra une invitation pour accéder à son nouvel espace et choisir son mot de passe.
      </p>

      {prefill?.demandeId && (
        <div className="loc-carte mb-5 border-l-4 border-l-[var(--or)]">
          <p className="text-sm">
            Ouverture depuis une demande de contact, à confirmer comme commerciale. Elle sera marquée traitée.
          </p>
        </div>
      )}

      <FormulaireOuverture prefill={prefill} />
    </main>
  );
}
