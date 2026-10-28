import { lireToutesLesPages } from "@/lib/lecture-complete";
import { SelecteurPatrimoine } from "@/components/selecteur-patrimoine";
import Link from "next/link";
import { verifierAccesEspace } from "@/lib/espace";
import { identiteDuCompte, initialesDe } from "@/lib/identite-compte";
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
import { baseEspace, racineEspace } from "@/lib/racine-espace";
import { FournisseurRacineEspace } from "@/components/racine-espace-contexte";
import { joursJusquaParis } from "@/lib/heure-paris-calcul";
import { NouvelleVersionConditions } from "@/components/nouvelle-version-conditions";
import { LienContenu } from "@/components/lien-contenu";
import { bandeauLectureSeule, causeFermeture } from "@/lib/lecture-seule";

// Jours entre aujourd'hui (Paris) et une date ISO — négatif si elle est passée.
//
// `slice(0, 10)` n'est pas de la superstition : la valeur arrive de la base
// tantôt en « 2026-09-25 », tantôt en « 2026-09-25T00:00:00.000Z » selon la
// couche qui la sert. Concaténer « T00:00:00 » sur la seconde forme donne une
// date invalide, et le bandeau annonçait « NaN jour restants » (relevé du
// 11/09). On ne garde donc que le jour, qui est tout ce que la question demande.
function joursRestants(iso: string): number {
  return joursJusquaParis(iso);
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
  const { supabase, user, organisation, role, estProprietaire, traverseeLectureSeule } =
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
    traverseeLectureSeule ? Promise.resolve([]) : chargerSyntheseAlertes(supabase, { orgId }),
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
    // suit le relit sans nouvel aller-retour. Le menu du propriétaire direct n'a
    // pas d'entrée « Alertes » : rien à compter pour lui à chaque page (audit du
    // 27/10, LAT-08) ; l'accueil et « À faire » calculent leurs vérifications.
    estProprietaire
      ? Promise.resolve({ total: 0, critiques: 0 })
      : compterActionsDuJour(supabase, orgId, { userId: user.id, portefeuille, racine: racineEspace(estProprietaire) }),
    // Lu pour TOUTE organisation (audit 29/09) : l'écriture se ferme aussi
    // hors essai — souscription résiliée, prélèvement en défaut —, et l'écran
    // doit le dire au lieu de laisser chaque bouton échouer un à un.
    supabase.rpc("etat_abonnement", { p_org: orgId }),
  ]);
  const etatAbonnement =
    ((etatAbonnementBrut ?? []) as { ecriture_ouverte: boolean; unites_facturees: number }[])[0] ??
    null;
  // Fermée seulement si la base le dit : une lecture en échec ne ferme rien à
  // l'écran (la base, elle, refuse déjà les écritures si c'est le cas).
  const ecritureFermee = etatAbonnement?.ecriture_ouverte === false;
  // Audit final du 27/10 (DRT-04) : « suspendue » vient de l'impayé OU de la supervision ; seule la seconde se lève
  // en nous écrivant, pas en souscrivant. Lu seulement quand la question se pose.
  const suspendueParSupervision =
    ecritureFermee && !traverseeLectureSeule && ["suspendue", "archivee"].includes(organisation.status)
      ? (await supabase.rpc("org_suspendue_par_supervision", { p_org: orgId })).data === true
      : false;
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
  let organisationsIndisponibles = false;
  if (estProprietaire) {
    type Adhesion = { organization_id: string; organisation: { id: string; name: string; type: string } | { id: string; name: string; type: string }[] | null };
    const adhesions = await lireToutesLesPages<Adhesion>((debut, fin) => supabase
      .from("memberships")
      .select("organization_id, organisation:organizations(id, name, type)", { count: "exact" })
      .eq("account_id", user.id)
      .eq("role", "proprietaire_direct")
      .eq("status", "active")
      .order("organization_id")
      .range(debut, fin), a => a.organization_id);
    organisationsIndisponibles = Boolean(adhesions.echec);
    organisations = (adhesions.lignes ?? [])
      .map((a) => {
        const o = Array.isArray(a.organisation) ? a.organisation[0] : a.organisation;
        return o ? { id: o.id, nom: o.name } : null;
      })
      .filter((o): o is { id: string; nom: string } => o !== null);
  }

  // Décision D27 : les écrans du propriétaire direct vivent sous /espace/<id>, ceux des agences sous /agence/<id>.
  const racine = racineEspace(estProprietaire);
  const base = baseEspace(orgId, estProprietaire);
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
  // Grille du 28/09 : plus rien d'offert après l'essai — la phrase « rien à
  // régler » ne vaut plus que pour une organisation restée sur l'ancienne
  // grille (quantité nulle).
  const rienARegler =
    essaiEchu && etatAbonnement && etatAbonnement.ecriture_ouverte && etatAbonnement.unites_facturees === 0
      ? "Rien à régler pour l'instant"
      : null;
  const essai =
    !traverseeLectureSeule && estResponsable && organisation.status === "essai" && organisation.essai_fin
      ? {
          jours: joursRestants(organisation.essai_fin),
          href: `${base}/abonnement`,
          ecritureFermee,
          rienARegler,
        }
      : null;

  const liensCompte = traverseeLectureSeule ? [
    { href: "/admin/brief", libelle: "Revenir au superadmin" },
    { href: `/admin/organisations/${orgId}`, libelle: "Fiche du client" },
    { href: "/compte", libelle: "Sécurité de mon compte" },
  ] : estProprietaire
    ? [
        { href: `${base}/profil`, libelle: "Mon profil" },
        { href: "/compte", libelle: "Sécurité du compte" },
        { href: "/espaces", libelle: "Mes espaces" },
      ]
    : [
        { href: `${base}/profil`, libelle: "Profil de l'agence" },
        { href: "/compte", libelle: "Sécurité du compte" },
        { href: "/espaces", libelle: "Mes espaces" },
      ];

  return (
    <FournisseurRacineEspace racine={racine}>
    <div className={`coquille gerimmo-prestige${estProprietaire ? " espace-proprietaire" : ""}`} style={estProprietaire ? undefined : styleMarque(organisation)}>
      {estProprietaire && <LienContenu />}
      <aside className="coquille-late">
        <BarreLaterale
          orgId={orgId}
          racine={racine}
          espace={espace}
          navigation={navigation}
          organisations={estProprietaire ? [] : organisations}
          essai={essai}
          marque={estProprietaire ? undefined : { nom: organisation.nom_portail || organisation.name, logoUrl: organisation.logo_url }}
        />
      </aside>
      <div className="coquille-corps">
        <header className="coquille-haut">
          {/* Sur téléphone la colonne n'existe plus : la marque monte ici. */}
          <span className="coquille-marque-mobile min-w-0 max-w-[160px]">
            {/* En-tête clair : sans marque propre, le logo Gerimmo se pose dans la tuile bleu nuit (D28 A, DES-A-10). */}
            <MarqueOrganisation marque={estProprietaire ? undefined : organisation} tuile />
          </span>
          <RechercheEspace orgId={orgId} racine={racine} />
          <span className="ambiance-repere" aria-hidden="true" />
          {!traverseeLectureSeule && <SyntheseAlertes
            alertes={alertes}
            membres={membres}
            estResponsable={estResponsable}
            aujourdhui={aujourdhuiParis()}
          />}
          {/* Le propriétaire dispose d'une seule entrée Aide dans son menu. */}
          {!estProprietaire && <LienAssistance title="Aide et retours" className="lien-bandeau justify-center pointer-coarse:min-w-11 max-[641px]:!hidden">
            <IconeTrait nom="quest" className="size-4 shrink-0" />
            <span className="hidden lg:inline">Aide et retours</span>
          </LienAssistance>}
          <MenuCompte
            // Le propriétaire, c'est une personne (27/09) : ses initiales, pas
            // celle de son « Parc ».
            initiales={
              (traverseeLectureSeule ? "SA" : estProprietaire ? initialesDe(await identiteDuCompte(supabase, orgId, user)) : null) ??
              (organisation.name?.[0] ?? "◇").toUpperCase()
            }
            titre={traverseeLectureSeule ? "Superadmin · consultation" : estProprietaire ? "Espace propriétaire" : organisation.name}
            sousTitre={
              traverseeLectureSeule ? undefined : estProprietaire ? undefined : role === "admin_agence" ? "Admin d'agence" : "Agent"
            }
            liens={liensCompte}
            compteId={user.id}
          />
        </header>
        {estProprietaire && <SelecteurPatrimoine orgId={orgId} nom={organisation.name} organisations={organisations} indisponible={organisationsIndisponibles} />}
        {/* L'essai terminé se dit en clair, une fois, en tête — mais seulement
            s'il FERME l'écriture (25/09 : le propriétaire d'un seul bien lisait
            « la saisie est suspendue » alors qu'il pouvait saisir). À TOUS les
            rôles : un agent qui ne peut plus écrire doit savoir pourquoi, et à
            qui s'adresser. Le responsable, lui, a le lien. */}
        {traverseeLectureSeule && (
          <p role="status" className="flex flex-wrap items-center gap-x-3 border-b border-[var(--trait)] bg-[var(--filet-leger)] px-4 py-2 text-sm">
            <span><strong>Consultation superadmin · lecture seule</strong> · {organisation.name}</span>{" "}
            <Link href="/admin/brief" className="font-semibold underline">Revenir au superadmin</Link>
            <Link href={`/admin/organisations/${orgId}/support`} className="font-semibold underline">Ouvrir le support</Link>
          </p>
        )}
        {ecritureFermee && !traverseeLectureSeule && (() => {
          const bandeau = bandeauLectureSeule({
            cause: causeFermeture(organisation.status, suspendueParSupervision),
            status: organisation.status,
            estResponsable,
            base,
          });
          return (
            <p role="status" className="border-b border-[var(--trait)] bg-[var(--warning-soft)] px-4 py-1.5 text-center text-xs text-[var(--warning-soft-foreground)]">
              {bandeau.etat} — {bandeau.suite}
              {bandeau.lien && (
                <>
                  {" "}
                  <Link href={bandeau.lien.href} className="font-semibold underline underline-offset-2">
                    {bandeau.lien.libelle}
                  </Link>
                </>
              )}
            </p>
          );
        })()}
        {/* Plan de conformité du 23/10 (R19) : « Nos conditions générales évoluent », pour le seul responsable, hors
            traversée de supervision ; rien ne s'affiche tant que sa dernière acceptation porte la version en vigueur. */}
        {estResponsable && !traverseeLectureSeule && (
          <NouvelleVersionConditions supabase={supabase} orgId={orgId} compteId={user.id} derniereConnexion={user.last_sign_in_at ?? null} />
        )}
        {messagesNonLus === null && (
          <p role="alert" className="err mx-4 mt-4">
            Le nombre de messages non lus est indisponible. Consultez votre messagerie
            pour vérifier les échanges en attente.
          </p>
        )}
        {estProprietaire && <span id="contenu-espace" tabIndex={-1} className="sr-only" />}
        {children}
        <BarreBasse espace={espace} navigation={navigation} orgId={orgId} racine={racine} organisations={estProprietaire ? [] : organisations} />
      </div>
      <Toasteur />
    </div>
    </FournisseurRacineEspace>
  );
}
