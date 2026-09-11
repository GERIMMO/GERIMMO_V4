import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FormulaireOuverture } from "./formulaire-ouverture";

export const metadata = { title: "Ouvrir une organisation — Gerimmo" };

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
    const { data } = await supabase
      .from("demandes_devis")
      .select("id, nom, email, agence")
      .eq("id", idDemande)
      .maybeSingle();
    const d = data as { id: string; nom: string; email: string; agence: string | null } | null;
    if (d) prefill = { nom: d.agence ?? d.nom, email: d.email, demandeId: d.id };
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-4 sm:p-7">
      <Link href="/admin" className="lien-discret text-[13px]">
        ← Supervision
      </Link>
      <div className="entete-page mb-6 mt-2">
        <h1>Ouvrir une organisation</h1>
      </div>

      <p className="mesure-lecture mb-5 text-sm text-muted-foreground">
        Crée l&apos;organisation, le compte de son premier responsable et
        l&apos;adhésion qui les relie, puis lui envoie le lien pour définir son
        mot de passe. Il arrive sur un espace vide, avec le chemin à suivre
        affiché sur son accueil.
      </p>

      {prefill?.demandeId && (
        <div className="loc-carte mb-5 border-l-4 border-l-[var(--or)]">
          <p className="text-sm">
            Ouverture depuis une demande de devis. Elle sera marquée traitée.
          </p>
        </div>
      )}

      <FormulaireOuverture prefill={prefill} />
    </main>
  );
}
