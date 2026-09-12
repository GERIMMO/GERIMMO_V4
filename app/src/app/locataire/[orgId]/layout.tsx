import Link from "next/link";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { MarqueGerimmo } from "@/components/marque-gerimmo";
import { SidebarLocataire } from "@/components/nav-locataire";
import { MenuCompte } from "@/components/menu-compte";
import { nomComplet } from "@/lib/roles-personnes";
import { estARenouveler } from "@/lib/ged";
import { aEchoue } from "./panne-lecture";

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
    { data: pieces, error: ePieces },
    { data: incidents, error: eIncidents },
    { data: nonLus, error: eNonLus },
    { data: demandes, error: eDemandes },
    { data: baux, error: eBaux },
    { data: signatures, error: eSignatures },
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
  // Le badge se déclenche à J-30, pas à l'expiration : c'est le seuil que
  // RM-0b.5.1 rend dû AU LOCATAIRE, et celui que l'accueil et la page
  // Documents affichent désormais (revue 11/09 — le menu restait muet
  // pendant que « Ce qui vous attend » réclamait le renouvellement).
  const assuranceOk = !bailActif || Boolean(derniere && !estARenouveler(derniere.expire_le));
  const demandesEnCours = ((incidents ?? []) as { etat: string }[]).filter(
    (i) => i.etat !== "clos"
  ).length;
  // Une lecture tombée éteint silencieusement un badge : le locataire ne voit
  // plus la pièce qu'on lui réclame et croit être en règle. On ne peut pas
  // corriger le compte, on peut dire qu'il n'est pas fiable (relevé 11/09).
  const comptesIncertains = aEchoue(
    ePieces,
    eIncidents,
    eNonLus,
    eDemandes,
    eBaux,
    eSignatures
  );

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
          declarationOuverte={adhesionActive}
        />
      </aside>
      <div className="min-w-0">
        <header className="loc-haut">
          <MenuCompte
            initiales={
              personne
                ? `${(personne.prenom?.[0] ?? "").toUpperCase()}${(personne.nom?.[0] ?? "").toUpperCase()}`
                : "◇"
            }
            titre={personne ? nomComplet(personne) : organisation.name}
            sousTitre="Locataire"
            liens={[{ href: "/espaces", libelle: "Mes espaces" }]}
          />
        </header>
        {comptesIncertains && (
          <p
            role="alert"
            className="border-b border-border bg-[var(--destructive-soft)] px-4 py-1.5 text-center text-xs text-destructive-soft-foreground"
          >
            Connexion instable : les compteurs du menu peuvent être incomplets.
            Rechargez la page dans un instant.
          </p>
        )}
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
