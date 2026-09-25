import Link from "next/link";
import { verifierAccesEspace } from "@/lib/espace";
import { chargerSyntheseAlertes } from "@/lib/alertes";
import { compterActionsDuJour } from "@/lib/actions-du-jour";
import { totalMessagesNonLus } from "@/lib/messagerie";
import { lotsDuPortefeuille } from "@/lib/portefeuille";
import { ROLES_RESPONSABLES, aujourdhuiParis } from "@/lib/ged";
import { navigationEspace, type RoleEspace } from "@/lib/navigation-espace";
import { BarreBasse, BarreLaterale } from "@/components/barre-laterale";
import { MarqueOrganisation } from "@/components/marque-organisation";
import { styleMarque } from "@/lib/marque-organisation";
import { MenuCompte } from "@/components/menu-compte";
import { SyntheseAlertes } from "@/components/synthese-alertes";
import { RechercheEspace } from "@/components/recherche-espace";
import { LienAssistance } from "@/components/bouton-assistance";
import { IconeTrait } from "@/components/icone-trait";
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

/**
 * LA COQUILLE DE L'ESPACE AGENCE — v4 (refonte d'interface, 19/09).
 *
 * Une seule coquille pour les trois rôles qui partagent ces écrans (admin
 * d'agence, agent, propriétaire direct) : la même barre latérale, le même
 * en-tête, la même barre basse sur téléphone. Ce qui change d'un rôle à
 * l'autre — les entrées du menu, leurs noms, leurs badges — est calculé par
 * `navigationEspace()`, qui préserve exactement les accès d'avant.
 *
 * Ce que le layout LIT n'a pas bougé : alertes confiées, incidents du
 * portefeuille, gérants pour « Confier à », messages non lus. Seul le chrome
 * change ; les pages gardent leur <main> et leurs marges.
 *
 * Une lecture de plus depuis le 24/09 : le plan du jour (lib/actions-du-jour),
 * pour que la pastille « Alertes » dise le chiffre de la tuile « À faire ».
 */
export default async function LayoutAgence({
  children,
  params,
}: LayoutProps<"/agence/[orgId]">) {
  const { orgId } = await params;
  const { supabase, user, organisation, role, estProprietaire } =
    await verifierAccesEspace(orgId);

  // « Mon portefeuille » (RM-18.1.3) d'abord : la pastille Incidents et le
  // plan du jour se lisent à travers lui — null : je vois tout.
  const portefeuille = await lotsDuPortefeuille(supabase, orgId, role, user.id);
  // Revue recette 08/08 : la pop-up de connexion ne montre que les alertes
  // qui me sont confiées, dans l'agence où je me trouve — l'acteur
  // multi-agences navigue d'une agence à l'autre.
  // L'essai est-il échu ? La date seule ne dit pas si l'écriture est fermée
  // (25/09) : depuis le 24/09, un essai fini sans rien à payer — propriétaire
  // d'un seul bien, agence sans mandat actif — laisse l'écriture ouverte
  // (`org_ecriture_ouverte`). On lit donc `etat_abonnement`, comme la page
  // Abonnement, mais seulement quand la question se pose.
  const essaiEchu =
    organisation.status === "essai" &&
    Boolean(organisation.essai_fin) &&
    joursRestants(organisation.essai_fin!) < 0;

  const [
    alertes,
    { data: incidentsOuverts },
    { data: donneesMembres },
    messagesNonLus,
    actionsDuJour,
    { data: etatAbonnementBrut },
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
    // La pastille « Alertes » compte ce que la tuile « À faire » compte, et ce
    // que /alertes montre (relevé du 24/09 : « on lit “2 à faire”, on clique,
    // on n'en trouve qu'un ») : baux bloqués, mes alertes dédoublonnées,
    // rapports à valider. Un seul calcul, mémorisé par requête — la page qui
    // suit le relit sans nouvel aller-retour.
    compterActionsDuJour(supabase, orgId, { userId: user.id, portefeuille }),
    essaiEchu
      ? supabase.rpc("etat_abonnement", { p_org: orgId })
      : Promise.resolve({ data: null }),
  ]);
  const etatAbonnement =
    ((etatAbonnementBrut ?? []) as { ecriture_ouverte: boolean; unites_facturees: number }[])[0] ??
    null;
  // Fermée seulement si la base le dit : une lecture en échec ne ferme rien à
  // l'écran (la base, elle, refuse déjà les écritures si c'est le cas).
  const ecritureFermee = essaiEchu && etatAbonnement?.ecriture_ouverte === false;
  const badgeIncidents = ((incidentsOuverts ?? []) as { lot_id: string | null }[]).filter(
    (i) => !portefeuille || (i.lot_id != null && portefeuille.has(i.lot_id))
  ).length;
  const membres = (donneesMembres ?? []) as {
    account_id: string;
    email: string;
    role: string;
  }[];
  const estResponsable = ROLES_RESPONSABLES.includes(role);

  // Le propriétaire direct qui a plusieurs organisations (SCI, nom propre)
  // choisit dans la barre : tout suit, lots, livre, fiscalité.
  let organisations: { id: string; nom: string }[] = [];
  if (estProprietaire) {
    const { data: adhesions } = await supabase
      .from("memberships")
      .select("organization_id, organisation:organizations(id, name, type)")
      .eq("account_id", user.id)
      .eq("role", "proprietaire_direct")
      .eq("status", "active");
    organisations = ((adhesions ?? []) as {
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
  }

  const roleNav: RoleEspace = estProprietaire
    ? "proprietaire_direct"
    : role === "admin_agence"
      ? "admin_agence"
      : "agent";
  const navigation = navigationEspace({
    orgId,
    role: roleNav,
    badges: {
      incidents: badgeIncidents,
      alertes: actionsDuJour.total,
      // Rouge dès qu'un rang est critique — un impayé sur un bail compris.
      alertesCritiques: actionsDuJour.critiques,
      messages: messagesNonLus ?? 0,
    },
  });
  const espace = estProprietaire ? "Mon espace" : "Espace agence";

  // L'essai, en une ligne au pied de la barre — plus de bandeau plein écran
  // au-dessus de chaque page. Réservé au responsable : un agent n'a pas à
  // connaître la facture de son agence.
  // Essai fini, écriture ouverte : rien à régler, et la barre le dit en ton
  // neutre plutôt qu'en rouge « terminé » (25/09). Sans lecture de l'état,
  // on n'affirme ni l'un ni l'autre.
  const rienARegler =
    essaiEchu && etatAbonnement && etatAbonnement.ecriture_ouverte
      ? organisation.type === "agence"
        ? "Rien à régler tant qu'aucun lot n'est sous mandat actif"
        : "Rien à régler tant que vous ne gérez qu'un bien"
      : null;
  const essai =
    estResponsable && organisation.status === "essai" && organisation.essai_fin
      ? {
          jours: joursRestants(organisation.essai_fin),
          href: `/agence/${orgId}/abonnement`,
          ecritureFermee,
          rienARegler,
        }
      : null;

  const liensCompte = estProprietaire
    ? [
        { href: `/agence/${orgId}/profil`, libelle: "Mon profil" },
        { href: "/compte", libelle: "Sécurité du compte" },
        { href: "/espaces", libelle: "Mes espaces" },
      ]
    : [
        { href: `/agence/${orgId}/profil`, libelle: "Profil de l'agence" },
        { href: "/compte", libelle: "Sécurité du compte" },
        { href: "/espaces", libelle: "Mes espaces" },
      ];

  return (
    <div className="coquille" style={estProprietaire ? undefined : styleMarque(organisation)}>
      <aside className="coquille-late">
        <BarreLaterale
          orgId={orgId}
          espace={espace}
          navigation={navigation}
          organisations={organisations}
          essai={essai}
          marque={estProprietaire ? undefined : { nom: organisation.nom_portail || organisation.name, logoUrl: organisation.logo_url }}
        />
      </aside>
      <div className="coquille-corps">
        <header className="coquille-haut">
          {/* Sur téléphone la colonne n'existe plus : la marque monte ici. */}
          <span className="coquille-marque-mobile min-w-0 max-w-[160px]">
            <MarqueOrganisation marque={estProprietaire ? undefined : organisation} />
          </span>
          <RechercheEspace orgId={orgId} />
          <SyntheseAlertes
            alertes={alertes}
            membres={membres}
            estResponsable={estResponsable}
            aujourdhui={aujourdhuiParis()}
          />
          {/* L'aide, dans la barre plutôt qu'en rond flottant sur le contenu
              (24/09) : icône seule sous 1 024 px, et sur téléphone
              (≤ 640 px) elle passe dans le tiroir « Menu » de la barre basse.
              `!` : `.lien-bandeau` (hors couche) l'emporterait sur `hidden`. */}
          <LienAssistance title="Aide et retours" className="lien-bandeau justify-center pointer-coarse:min-w-11 max-[641px]:!hidden">
            <IconeTrait nom="quest" className="size-4 shrink-0" />
            <span className="hidden lg:inline">Aide et retours</span>
          </LienAssistance>
          <MenuCompte
            initiales={(organisation.name?.[0] ?? "◇").toUpperCase()}
            titre={estProprietaire ? "Espace propriétaire" : organisation.name}
            sousTitre={
              estProprietaire ? undefined : role === "admin_agence" ? "Admin d'agence" : "Agent"
            }
            liens={liensCompte}
          />
        </header>
        {/* L'essai terminé se dit en clair, une fois, en tête — mais seulement
            s'il FERME l'écriture (25/09 : le propriétaire d'un seul bien lisait
            « la saisie est suspendue » alors qu'il pouvait saisir). À TOUS les
            rôles : un agent qui ne peut plus écrire doit savoir pourquoi, et à
            qui s'adresser. Le responsable, lui, a le lien. */}
        {ecritureFermee && (
          <p className="border-b border-[var(--trait)] bg-[var(--warning-soft)] px-4 py-1.5 text-center text-xs text-[var(--warning-soft-foreground)]">
            Période d&apos;essai terminée —{" "}
            {estResponsable ? (
              <>
                activez l&apos;abonnement pour continuer à saisir.{" "}
                <Link href={`/agence/${orgId}/abonnement`} className="font-semibold underline underline-offset-2">
                  Choisir ma formule →
                </Link>
              </>
            ) : (
              "votre administrateur doit activer l'abonnement pour que la saisie reprenne."
            )}
          </p>
        )}
        {messagesNonLus === null && (
          <p role="alert" className="err mx-4 mt-4">
            Le nombre de messages non lus est indisponible. Consultez votre messagerie
            pour vérifier les échanges en attente.
          </p>
        )}
        {children}
        <BarreBasse espace={espace} navigation={navigation} orgId={orgId} organisations={organisations} />
      </div>
      <Toasteur />
    </div>
  );
}
