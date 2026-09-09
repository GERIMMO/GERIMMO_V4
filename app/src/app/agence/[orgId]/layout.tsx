import Link from "next/link";
import { verifierAccesEspace } from "@/lib/espace";
import { chargerSyntheseAlertes } from "@/lib/alertes";
import { totalMessagesNonLus } from "@/lib/messagerie";
import { ROLES_RESPONSABLES, formaterDate, aujourdhuiParis } from "@/lib/ged";
import { seDeconnecter } from "@/app/actions/auth";
import { SidebarAgence } from "@/components/nav-agence-premium";
import { SidebarProprietaire } from "@/components/nav-proprietaire";
import { SortieMobile } from "@/components/sortie-mobile";
import { SyntheseAlertes } from "@/components/synthese-alertes";
import { MarqueGerimmo } from "@/components/marque-gerimmo";
import { Toasteur } from "@/components/ui/toast";

// Jours entre aujourd'hui (Paris) et une date ISO — négatif si elle est passée
function joursRestants(iso: string): number {
  const ms = new Date(`${iso}T00:00:00`).getTime() - new Date(`${aujourdhuiParis()}T00:00:00`).getTime();
  return Math.round(ms / 86_400_000);
}

// Layout de l'espace agence — charte : marque à gauche, contexte d'agence
// séparé d'un filet, actions à droite ; navigation en onglets sous l'en-tête,
// liseré or sur l'onglet actif. Partagé avec le propriétaire direct.
export default async function LayoutAgence({
  children,
  params,
}: LayoutProps<"/agence/[orgId]">) {
  const { orgId } = await params;
  const { supabase, user, organisation, role, estProprietaire } =
    await verifierAccesEspace(orgId);

  // Revue recette 08/08 : la pop-up de connexion et le badge du menu ne
  // montrent que les alertes qui me sont confiées, dans l'agence où je me
  // trouve — l'acteur multi-agences navigue d'une agence à l'autre.
  const [alertes, { count: incidentsOuverts }, { data: donneesMembres }, messagesNonLus] =
    await Promise.all([
      chargerSyntheseAlertes(supabase, { orgId }),
      // Badge maquette : les incidents encore ouverts (tout sauf clos)
      supabase
        .from("incidents")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .neq("etat", "clos"),
      // « Traiter » depuis la synthèse ouvre la pop-up sur place (recette
      // 24/08) : il lui faut la liste des gérants pour « Confier à »
      supabase.rpc("org_membres_gerants", { org: orgId }),
      // Badge Messages — même appel (mis en cache) que le tableau de bord
      totalMessagesNonLus(supabase, orgId),
    ]);
  const alertesOrg = alertes.length;
  const membres = (donneesMembres ?? []) as {
    account_id: string;
    email: string;
    role: string;
  }[];
  const estResponsable = ROLES_RESPONSABLES.includes(role);

  // Espace propriétaire — montée en gamme (maquette PC v1 du 05/09) : le
  // propriétaire direct est chez lui — barre latérale premium (même langage
  // que l'espace locataire), sélecteur d'organisation (nom propre / SCI) si
  // plusieurs, pages inchangées derrière.
  if (estProprietaire) {
    const { data: adhesions } = await supabase
      .from("memberships")
      .select("organization_id, organisation:organizations(id, name, type)")
      .eq("account_id", user.id)
      .eq("role", "proprietaire_direct")
      .eq("status", "active");
    const organisations = ((adhesions ?? []) as {
      organization_id: string;
      organisation:
        | { id: string; name: string; type: string }
        | { id: string; name: string; type: string }[]
        | null;
    }[])
      .map((a) => {
        const o = Array.isArray(a.organisation) ? a.organisation[0] : a.organisation;
        return o ? { id: o.id, nom: o.name } : null;
      })
      .filter((o): o is { id: string; nom: string } => o !== null);

    return (
      <div className="loc-app">
        <aside className="loc-late">
          <div className="loc-logo">
            <Link href={`/agence/${orgId}`} aria-label="Accueil de mon espace">
              <MarqueGerimmo surEncre />
            </Link>
            <span className="loc-logo-texte eyebrow text-[var(--sur-encre)]/55">
              Espace propriétaire
            </span>
          </div>
          <SidebarProprietaire
            orgId={orgId}
            badgeIncidents={incidentsOuverts ?? 0}
            badgeAlertes={alertesOrg}
            badgeMessages={messagesNonLus}
            organisations={organisations}
          />
          <div className="loc-late-bas">
            <Link href={`/agence/${orgId}/profil`}>Mon profil</Link>
            <Link href="/espaces">Mes espaces</Link>
            <form action={seDeconnecter}>
              <button type="submit">Se déconnecter</button>
            </form>
          </div>
        </aside>
        <div className="min-w-0">
          <header className="loc-haut">
            <SyntheseAlertes
              alertes={alertes}
              membres={membres}
              estResponsable={estResponsable}
            />
            <span className="min-w-0 truncate text-[13px] text-muted-foreground">
              {organisation.name}
              <span className="text-[var(--libelle)]"> · Propriétaire bailleur</span>
            </span>
            <SortieMobile profilHref={`/agence/${orgId}/profil`} />
            <span className="loc-avat" aria-hidden>
              {(organisation.name?.[0] ?? "◇").toUpperCase()}
            </span>
          </header>
          {organisation.status === "essai" && organisation.essai_fin && (
            <p className="border-b border-border bg-[var(--or-clair)]/30 px-4 py-1.5 text-center text-xs text-muted-foreground">
              Essai gratuit jusqu&apos;au {formaterDate(organisation.essai_fin)}
              {joursRestants(organisation.essai_fin) < 0
                ? " — période d'essai terminée, l'abonnement arrive prochainement"
                : ` (${joursRestants(organisation.essai_fin)} jour${joursRestants(organisation.essai_fin) > 1 ? "s" : ""} restants)`}
            </p>
          )}
          {/* Les pages gardent leur <main> et leurs marges : seul le chrome change */}
          <div className="min-w-0">{children}</div>
        </div>
        <Toasteur />
      </div>
    );
  }

  // Espace agence — montée en gamme (maquette v6 du 08/09) : agent et admin
  // passent sur la barre latérale premium (même langage que les espaces
  // locataire et propriétaire). L'agent voit « Mon portefeuille », l'admin
  // « Parc de l'agence » + Mandats & rapports + Administration. Les pages
  // gardent leur <main> : seul le chrome change.
  return (
    <div className="loc-app">
      <aside className="loc-late">
        <div className="loc-logo">
          <Link href={`/agence/${orgId}`} aria-label="Accueil de l'agence">
            <MarqueGerimmo surEncre />
          </Link>
          <span className="loc-logo-texte eyebrow text-[var(--sur-encre)]/55">
            Espace agence
          </span>
        </div>
        <SidebarAgence
          orgId={orgId}
          admin={role === "admin_agence"}
          badgeIncidents={incidentsOuverts ?? 0}
          badgeAlertes={alertesOrg}
          badgeMessages={messagesNonLus}
        />
        <div className="loc-late-bas">
          <Link href={`/agence/${orgId}/profil`}>Profil de l&apos;agence</Link>
          <Link href="/espaces">Mes espaces</Link>
          <form action={seDeconnecter}>
            <button type="submit">Se déconnecter</button>
          </form>
          <span>{organisation.name}</span>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="loc-haut">
          <SyntheseAlertes
            alertes={alertes}
            membres={membres}
            estResponsable={estResponsable}
          />
          <span className="min-w-0 truncate text-[13px] text-muted-foreground">
            {organisation.name}
            <span className="text-[var(--libelle)]">
              {" "}
              · {role === "admin_agence" ? "Admin d'agence" : "Agent"}
            </span>
          </span>
          <SortieMobile profilHref={`/agence/${orgId}/profil`} />
          <span className="loc-avat" aria-hidden>
            {(organisation.name?.[0] ?? "◇").toUpperCase()}
          </span>
        </header>
        {organisation.status === "essai" && organisation.essai_fin && (
          <p className="border-b border-border bg-[var(--or-clair)]/30 px-4 py-1.5 text-center text-xs text-muted-foreground">
            Essai gratuit jusqu&apos;au {formaterDate(organisation.essai_fin)}
            {joursRestants(organisation.essai_fin) < 0
              ? " — période d'essai terminée, l'abonnement arrive prochainement"
              : ` (${joursRestants(organisation.essai_fin)} jour${joursRestants(organisation.essai_fin) > 1 ? "s" : ""} restants)`}
          </p>
        )}
        <div className="min-w-0">{children}</div>
      </div>
      <Toasteur />
    </div>
  );
}
