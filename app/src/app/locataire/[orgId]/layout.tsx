import Link from "next/link";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { seDeconnecter } from "@/app/actions/auth";
import { MarqueGerimmo } from "@/components/marque-gerimmo";
import { SidebarLocataire } from "@/components/nav-locataire";
import { SortieMobile } from "@/components/sortie-mobile";
import { nomComplet } from "@/lib/roles-personnes";
import { estExpiree } from "@/lib/ged";

// Espace locataire — montée en gamme (maquette v10 du 05/09) : navigation
// latérale encre (le locataire est chez lui), fil de pages sur fond crème,
// cartes adoucies. Les badges du menu disent ce qui l'attend : une assurance
// à déposer ou expirée, des signalements en cours.
export default async function LayoutLocataire({
  children,
  params,
}: LayoutProps<"/locataire/[orgId]">) {
  const { orgId } = await params;
  const { supabase, organisation, personne, adhesionActive } = await verifierAccesEspaceLocataire(orgId);

  const [
    { data: pieces },
    { data: incidents },
    { data: nonLus },
    { data: demandes },
    { data: baux },
    { data: signatures },
  ] =
    await Promise.all([
      supabase.rpc("mes_pieces_locataire", { p_org: orgId }),
      supabase.rpc("mes_incidents_locataire", { p_org: orgId }),
      supabase.rpc("messages_non_lus_locataire", { p_org: orgId }),
      supabase.rpc("mes_pieces_demandees", { p_org: orgId }),
      supabase.rpc("mon_bail_locataire", { p_org: orgId }),
      supabase.rpc("mes_demandes_signature", { p_org: orgId }),
    ]);
  const attestations = ((pieces ?? []) as {
    type: string;
    depose_le: string;
    expire_le: string | null;
    verifie_le: string | null;
  }[])
    .filter((p) => p.type === "attestation_assurance")
    .sort((a, b) => b.depose_le.localeCompare(a.depose_le));
  const derniere = attestations[0];
  // L'assurance n'est réclamée qu'à un locataire en place : sans bail actif,
  // le badge ne réclame rien (audit 06/09 — badge figé à 1 pour un sortant).
  const bailActif = ((baux ?? []) as unknown[]).length > 0;
  const assuranceOk = !bailActif || Boolean(derniere && !estExpiree(derniere.expire_le));
  const demandesEnCours = ((incidents ?? []) as { etat: string }[]).filter(
    (i) => i.etat !== "clos"
  ).length;

  return (
    <div className="loc-app">
      <aside className="loc-late">
        <div className="loc-logo">
          <Link href={`/locataire/${orgId}`} aria-label="Accueil de mon espace">
            <MarqueGerimmo surEncre />
          </Link>
          <span className="loc-logo-texte eyebrow text-[var(--sur-encre)]/55">
            Espace locataire
          </span>
        </div>
        <SidebarLocataire
          orgId={orgId}
          badgeDocuments={
            (assuranceOk ? 0 : 1) +
            ((demandes ?? []) as unknown[]).length +
            ((signatures ?? []) as unknown[]).length
          }
          badgeDemandes={demandesEnCours}
          badgeMessages={Number(nonLus ?? 0)}
        />
        <div className="loc-late-bas">
          <Link href="/espaces">Mes espaces</Link>
          <form action={seDeconnecter}>
            <button type="submit">Se déconnecter</button>
          </form>
          <span>{organisation.name}</span>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="loc-haut">
          <span className="min-w-0 truncate text-[13px] text-muted-foreground">
            {personne ? nomComplet(personne) : organisation.name}
            <span className="text-[var(--libelle)]"> · Locataire</span>
          </span>
          <SortieMobile />
          <span className="loc-avat" aria-hidden>
            {personne
              ? `${(personne.prenom?.[0] ?? "").toUpperCase()}${(personne.nom?.[0] ?? "").toUpperCase()}` || "◇"
              : "◇"}
          </span>
        </header>
        {!adhesionActive && (
          <p className="border-b border-border bg-[var(--or-clair)]/30 px-4 py-1.5 text-center text-xs text-muted-foreground">
            Votre bail est terminé — cet espace reste consultable : quittances,
            documents et décompte de restitution.
          </p>
        )}
        <main className="loc-corps mx-auto">{children}</main>
      </div>
    </div>
  );
}
