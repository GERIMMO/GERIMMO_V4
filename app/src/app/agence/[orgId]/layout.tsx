import Link from "next/link";
import { verifierAccesEspace } from "@/lib/espace";
import { chargerSyntheseAlertes } from "@/lib/alertes";
import { totalMessagesNonLus } from "@/lib/messagerie";
import { lotsDuPortefeuille } from "@/lib/portefeuille";
import { ROLES_RESPONSABLES, formaterDate, aujourdhuiParis } from "@/lib/ged";
import { SidebarAgence } from "@/components/nav-agence-premium";
import { SidebarProprietaire } from "@/components/nav-proprietaire";
import { MenuCompte } from "@/components/menu-compte";
import { SyntheseAlertes } from "@/components/synthese-alertes";
import { MarqueGerimmo } from "@/components/marque-gerimmo";
import { Toasteur } from "@/components/ui/toast";

// Jours entre aujourd'hui (Paris) et une date ISO — négatif si elle est passée.
//
// `slice(0, 10)` n'est pas de la superstition : la valeur arrive de la base
// tantôt en « 2026-09-25 », tantôt en « 2026-09-25T00:00:00.000Z » selon la
// couche qui la sert. Concaténer « T00:00:00 » sur la seconde forme donne une
// date invalide, et le bandeau annonçait « NaN jour restants » (relevé du
// 11/09). On ne garde donc que le jour, qui est tout ce que la question demande.
function joursRestants(iso: string): number {
  const jour = String(iso).slice(0, 10);
  const ms =
    new Date(`${jour}T00:00:00`).getTime() -
    new Date(`${aujourdhuiParis()}T00:00:00`).getTime();
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : 0;
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
  const [
    alertes,
    { data: incidentsOuverts },
    { data: donneesMembres },
    messagesNonLus,
    portefeuille,
  ] = await Promise.all([
    chargerSyntheseAlertes(supabase, { orgId }),
    // Badge maquette : les incidents encore ouverts (tout sauf clos).
    // Les lignes plutôt que le compte : le badge doit compter la MÊME chose
    // que la tuile du tableau de bord, à 200 px de là — c'est-à-dire les
    // incidents de MON portefeuille (RM-18.1.3). La RLS des incidents, elle,
    // n'est pas restreinte au portefeuille : le compte brut montrait à
    // l'agent des dossiers qu'aucun de ses écrans ne lui listait.
    supabase
      .from("incidents")
      .select("lot_id")
      .eq("organization_id", orgId)
      .neq("etat", "clos"),
    // « Traiter » depuis la synthèse ouvre la pop-up sur place (recette
    // 24/08) : il lui faut la liste des gérants pour « Confier à »
    supabase.rpc("org_membres_gerants", { org: orgId }),
    // Badge Messages — même appel (mis en cache) que le tableau de bord
    totalMessagesNonLus(supabase, orgId),
    lotsDuPortefeuille(supabase, orgId, role, user.id),
  ]);
  const badgeIncidents = ((incidentsOuverts ?? []) as { lot_id: string | null }[]).filter(
    (i) => !portefeuille || (i.lot_id != null && portefeuille.has(i.lot_id))
  ).length;
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
          </div>
          <SidebarProprietaire
            orgId={orgId}
            badgeIncidents={badgeIncidents}
            badgeAlertes={alertesOrg}
            badgeMessages={messagesNonLus}
            organisations={organisations}
          />
        </aside>
        <div className="min-w-0">
          <header className="loc-haut">
            <SyntheseAlertes
              alertes={alertes}
              membres={membres}
              estResponsable={estResponsable}
            />
            {/* Le pied de la barre latérale a rejoint ce menu (12/09) : ses
                liens se cherchaient en bas à gauche et disparaissaient sous
                860 px. Recette Tahir 09/09 : « Espace propriétaire » sans le
                nom du propriétaire — le sélecteur de la barre dit déjà où
                l'on est. */}
            <MenuCompte
              initiales={(organisation.name?.[0] ?? "◇").toUpperCase()}
              titre="Espace propriétaire"
              liens={[
                { href: `/agence/${orgId}/profil`, libelle: "Mon profil" },
                { href: "/espaces", libelle: "Mes espaces" },
              ]}
            />
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
          badgeIncidents={badgeIncidents}
          badgeAlertes={alertesOrg}
          badgeMessages={messagesNonLus}
        />
      </aside>
      <div className="min-w-0">
        <header className="loc-haut">
          <SyntheseAlertes
            alertes={alertes}
            membres={membres}
            estResponsable={estResponsable}
          />
          <MenuCompte
            initiales={(organisation.name?.[0] ?? "◇").toUpperCase()}
            titre={organisation.name}
            sousTitre={role === "admin_agence" ? "Admin d'agence" : "Agent"}
            liens={[
              { href: `/agence/${orgId}/profil`, libelle: "Profil de l'agence" },
              { href: "/espaces", libelle: "Mes espaces" },
            ]}
          />
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
