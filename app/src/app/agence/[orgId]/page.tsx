import type { ReactNode } from "react";
import Link from "next/link";
import { verifierAccesEspace } from "@/lib/espace";
import {
  afficherEcheance,
  echeanceRapport,
  resumerBlocage,
} from "@/lib/echeances";
import { cibleBlocage } from "@/lib/parc";
import { actionsAttendues, sansAlertesDoublonnees } from "@/lib/actions-attendues";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";
import { lotsDuPortefeuille } from "@/lib/portefeuille";
import { totalMessagesNonLus } from "@/lib/messagerie";
import { CRITICITES, ORDRE_CRITICITE, ROLES_RESPONSABLES, eur, aujourdhuiParis } from "@/lib/ged";
import { TraiterAlerte } from "./alertes/traiter-alerte";
import { nomComplet } from "@/lib/roles-personnes";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { IndicateurLien } from "@/components/ui/indicateur-lien";
import { Donut, LegendeDonut, BarresDouble } from "@/components/graphes";
import { FilActivite } from "./fil-activite";
import { AccueilProprietaire } from "./accueil-proprietaire";

export const metadata = { title: "Tableau de bord — Gerimmo" };

type Alerte = {
  id: string;
  type: string;
  criticite: string;
  titre: string;
  echeance: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  assignee_account_id: string | null;
  assigned_all: boolean;
  escalades: unknown;
};

// Une lecture qui échoue ne doit JAMAIS ressembler à du vide : un parc sans
// biens rassure, une connexion perdue non. Chaque bloc dit lequel des deux
// il montre (correctif transverse du relevé 11/09).
function LectureImpossible({ quoi }: { quoi: string }) {
  return (
    <p className="err mb-0" role="alert">
      Impossible de lire {quoi} — ce n&apos;est pas un écran vide, c&apos;est une
      lecture qui a échoué. Rechargez dans un instant.
    </p>
  );
}

// Les rangées du plan du jour : une seule et même rangée de la charte
// (.rang-alerte), quelle que soit la source de l'action.
type ActionDuJour = {
  cle: string;
  nature: string;
  criticite: "critique" | "normale" | "informative";
  titre: string;
  detail: string | null;
  echeance: string | null;
  action: ReactNode;
};

function GroupeActions({
  titre,
  actions,
  total,
  reste,
}: {
  titre: string;
  actions: ActionDuJour[];
  total: number;
  // Ce qui n'est pas affiché se dit : une liste tronquée en silence ment.
  reste?: ReactNode;
}) {
  if (actions.length === 0) return null;
  return (
    <>
      <div className="tete-groupe">
        <span className="libelle-champ">{titre}</span>
        <span className="libelle-champ">{total}</span>
      </div>
      {actions.map((a) => {
        const ech = afficherEcheance(a.echeance);
        return (
          <div key={a.cle} className={`rang-alerte flex-wrap gap-y-2 ${a.criticite}`}>
            <div className="min-w-0 flex-1">
              <div className="niveau">{a.nature}</div>
              <div className="mt-0.5 text-sm">{a.titre}</div>
              {a.detail && (
                <div className="truncate text-[length:var(--pas-appui)] text-muted-foreground">
                  {a.detail}
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span
                className={`text-[length:var(--pas-appui)] ${ech ? ech.classe : "text-muted-foreground"}`}
              >
                {ech ? ech.texte : "Sans échéance"}
              </span>
              {a.action}
            </div>
          </div>
        );
      })}
      {reste}
    </>
  );
}

// Tableau de bord de l'espace agence. Il répond à une seule question : « que
// dois-je faire aujourd'hui ? » — d'où le plan du jour EN PREMIER (les quatre
// sources d'action fondues en une seule liste), les chiffres ensuite.
export default async function PageTableauDeBord(props: PageProps<"/agence/[orgId]">) {
  const { orgId } = await props.params;
  const { supabase, user, role, organisation, estProprietaire } =
    await verifierAccesEspace(orgId);
  // « Bonjour » nominatif (audit 09/09) : le prénom vit dans les métadonnées
  // du compte (inscription) — comme l'espace locataire salue par la fiche.
  // Sans prénom connu, la salutation reste sobre.
  const meta = user.user_metadata as { prenom?: unknown } | null;
  const prenom =
    typeof meta?.prenom === "string" && meta.prenom.trim() ? meta.prenom.trim() : null;
  // Le propriétaire direct a son propre accueil (maquette PC v1 du 05/09) :
  // patrimoine, à-faire, veille DPE, abonnement — pas les KPI d'agence.
  if (estProprietaire) {
    return (
      <AccueilProprietaire
        supabase={supabase}
        orgId={orgId}
        organisation={organisation}
        prenom={prenom}
      />
    );
  }
  const estResponsable = ROLES_RESPONSABLES.includes(role);
  // « Mon portefeuille » (maquette v3, RM-18.1.3) : l'agent ne lit que les
  // lots des mandats qui lui sont confiés — null : il voit tout.
  const portefeuille = await lotsDuPortefeuille(supabase, orgId, role, user.id);
  const dansPortefeuille = (lotId: string | null | undefined) =>
    !portefeuille || (lotId != null && portefeuille.has(lotId));

  // Mois courant (Europe/Paris) : les appels de loyer sont datés au 1er du mois
  const moisCourant = `${aujourdhuiParis().slice(0, 7)}-01`;
  const dateSixMois = new Date(`${moisCourant}T12:00:00`);
  dateSixMois.setMonth(dateSixMois.getMonth() - 5);
  const moisSixMoisAvant = `${dateSixMois.toISOString().slice(0, 7)}-01`;

  const [
    { data: lots, error: erreurLots },
    { data: alertesBrutes, error: erreurAlertes },
    { data: rapports, error: erreurRapports },
    { data: appelsMois, error: erreurAppels },
    { data: encaissementsMois, error: erreurEncaissements },
    { data: ecrituresSixMois, error: erreurEcritures },
    { data: blocagesParc, error: erreurBlocages },
    { data: incidentsEnCours, error: erreurIncidents },
    { data: donneesMembres, error: erreurMembres },
    messagesNonLus,
    // Ce que la fiche de chaque bail affiche comme blocage (audit 09/09) :
    // impayés, EDL d'entrée non signé, diagnostics obligatoires, pièces
    // expirées — même source que la fiche, pour que le tableau de bord ne
    // dise jamais « tout est à jour » quand un bail est bloqué.
    attendues,
  ] = await Promise.all([
    supabase.from("lots").select("id, nom, etat, bien_id").eq("organization_id", orgId),
    // « À traiter » se calcule sur MES alertes (revue recette 08/08) : celles
    // qui me sont confiées nominativement, plus celles à tout le monde.
    supabase
      .from("alerts")
      .select(
        "id, type, criticite, titre, echeance, details, created_at, assignee_account_id, assigned_all, escalades"
      )
      .eq("organization_id", orgId)
      .eq("statut", "ouverte")
      .or(`assigned_all.eq.true,assignee_account_id.eq.${user.id}`),
    supabase
      .from("rapports_gestion")
      .select(
        "id, mois, statut, mandat:mandats(date_rapport, agent_account_id, person:persons(nom, prenom))"
      )
      .eq("organization_id", orgId)
      .eq("statut", "a_valider")
      .order("mois"),
    // KPI « Encaissé » (maquette) : le quittancement du mois en cours —
    // le lot du bail embarqué pour le filtre « mon portefeuille »
    supabase
      .from("appels_loyer")
      .select("montant_du, bail:baux!appels_loyer_bail_id_fkey(lot_id)")
      .eq("organization_id", orgId)
      .eq("periode", moisCourant),
    supabase
      .from("encaissements")
      .select("montant, bail:baux!encaissements_bail_id_fkey(lot_id)")
      .eq("organization_id", orgId)
      .gte("date_paiement", moisCourant),
    // Carte « Encaissements et dépenses » (maquette) : 6 mois d'écritures
    supabase
      .from("ecritures")
      .select("sens, montant, date_imputation, lot_id")
      .eq("organization_id", orgId)
      .gte("date_imputation", moisSixMoisAvant),
    // Ce qui bloque chaque lot en préparation — un seul aller-retour (perf 30/08)
    supabase.rpc("lots_blocages_location", { p_org: orgId }),
    // Tuile Incidents : les dossiers en cours et leur imputation
    supabase
      .from("incidents")
      .select("imputation, lot_id")
      .eq("organization_id", orgId)
      .neq("etat", "clos"),
    // La pop-up « Traiter » s'ouvre sur place (recette 24/08) : il lui faut
    // la liste des gérants pour « Confier à »
    supabase.rpc("org_membres_gerants", { org: orgId }),
    // Même appel (mis en cache) que le badge du layout — un seul aller-retour
    totalMessagesNonLus(supabase, orgId),
    actionsAttendues(supabase, orgId, { portefeuille }),
  ]);
  const membres = (donneesMembres ?? []) as {
    account_id: string;
    email: string;
    role: string;
  }[];
  // Le bandeau nomme ce qui manque : un écran incomplet le dit en tête, puis
  // chaque bloc concerné le répète là où le vide se verrait.
  const lecturesEnEchec = [
    erreurLots && "le parc",
    erreurAlertes && "les alertes",
    erreurRapports && "les rapports de gestion",
    (erreurAppels || erreurEncaissements) && "le quittancement du mois",
    erreurEcritures && "les écritures des six derniers mois",
    erreurBlocages && "les blocages de mise en location",
    erreurIncidents && "les incidents",
    erreurMembres && "la liste des gérants",
  ].filter((x): x is string => typeof x === "string");

  // Tout se lit à travers le portefeuille : sans mandat confié, rien ne change
  type LigneAvecBail = { bail: UnOuPlusieurs<{ lot_id: string }> };
  const lotDuBail = (l: LigneAvecBail) => premier(l.bail)?.lot_id ?? null;
  const totalAppele = (appelsMois ?? [])
    .filter((a) => dansPortefeuille(lotDuBail(a as LigneAvecBail)))
    .reduce((s, a) => s + Number(a.montant_du), 0);
  const totalEncaisse = (encaissementsMois ?? [])
    .filter((e) => dansPortefeuille(lotDuBail(e as LigneAvecBail)))
    .reduce((s, e) => s + Number(e.montant), 0);
  const nomMois = new Date().toLocaleDateString("fr-FR", {
    month: "long",
    timeZone: "Europe/Paris",
  });

  // Six derniers mois : encaissé (crédits) et dépenses (débits) par mois.
  // Sur un portefeuille, seules les écritures rattachées à un de mes lots
  // comptent (une écriture sans lot reste une affaire d'agence).
  const ecrituresLues = (ecrituresSixMois ?? []).filter((e) =>
    dansPortefeuille(e.lot_id as string | null)
  );
  const historique: { libelle: string; a: number; b: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(`${moisCourant}T12:00:00`);
    d.setMonth(d.getMonth() - i);
    const prefixe = d.toISOString().slice(0, 7);
    const duMois = ecrituresLues.filter((e) =>
      String(e.date_imputation).startsWith(prefixe)
    );
    historique.push({
      libelle: d.toLocaleDateString("fr-FR", { month: "short", timeZone: "Europe/Paris" }),
      a: duMois.filter((e) => e.sens === "recette").reduce((s, e) => s + Number(e.montant), 0),
      b: duMois.filter((e) => e.sens === "depense").reduce((s, e) => s + Number(e.montant), 0),
    });
  }
  const historiqueVide = historique.every((m) => m.a === 0 && m.b === 0);

  // Une alerte qui répète un item calculé (EDL d'entrée posée à l'activation)
  // ne s'affiche pas deux fois : l'item calculé fait foi.
  const alertes = sansAlertesDoublonnees((alertesBrutes ?? []) as Alerte[], attendues);

  // Tuile Incidents : l'imputation décide de qui paie (module 7) —
  // « pas encore tranché » est la file d'attente de qualification.
  const dossiersIncidents = (
    (incidentsEnCours ?? []) as { imputation: string | null; lot_id: string }[]
  ).filter((i) => dansPortefeuille(i.lot_id));
  const aQualifier = dossiersIncidents.filter((i) => !i.imputation).length;
  const segmentsIncidents = [
    {
      libelle: "Charge propriétaire",
      valeur: dossiersIncidents.filter((i) => i.imputation === "proprietaire").length,
      couleur: "var(--encre)",
    },
    {
      libelle: "Charge locataire",
      valeur: dossiersIncidents.filter(
        (i) => i.imputation === "locataire" || i.imputation === "degradation_fautive"
      ).length,
      couleur: "var(--warning)",
    },
    {
      libelle: "Pas encore tranché",
      valeur: aQualifier,
      couleur: "var(--destructive)",
    },
  ];

  const lotsActifs = (lots ?? []).filter(
    (l) => l.etat !== "archive" && dansPortefeuille(l.id)
  );
  const nomsLots = new Map(lotsActifs.map((l) => [l.id, { nom: l.nom, bienId: l.bien_id }]));
  const nbLoues = lotsActifs.filter((l) => l.etat === "loue" || l.etat === "preavis").length;
  const enPreparation = lotsActifs.filter((l) => l.etat === "brouillon");
  const tauxOccupation = lotsActifs.length
    ? Math.round((nbLoues / lotsActifs.length) * 100)
    : 0;
  const segmentsParc = [
    { libelle: "Loués", valeur: nbLoues, couleur: "var(--success)" },
    {
      libelle: "Disponibles",
      valeur: lotsActifs.filter((l) => l.etat === "disponible").length,
      couleur: "var(--or)",
    },
    { libelle: "En préparation", valeur: enPreparation.length, couleur: "var(--warning)" },
  ];

  // Ce qui bloque chaque lot en préparation : on ne garde que le premier motif,
  // le détail vit sur la fiche du lot.
  const blocages = new Map(
    ((blocagesParc ?? []) as { lot_id: string; blocages: string[] | null }[]).map((b) => [
      b.lot_id,
      (b.blocages ?? [])[0] ?? null,
    ])
  );

  // ---------------------------------------------------------------- Plan du jour
  // Quatre sources d'action vivaient côte à côte sur cet écran — une tuile, une
  // liste « à traiter », un agenda « cette semaine », des puces de raccourci —
  // et la même alerte s'y lisait deux fois, rendue de deux façons. Elles sont
  // toutes calculées ici : une seule liste, une seule rangée, l'urgence en tête.
  const aujourdhui = aujourdhuiParis();
  const niveau = (c: string): ActionDuJour["criticite"] =>
    c === "critique" ? "critique" : c === "normale" ? "normale" : "informative";

  // Contexte d'une alerte : le lot concerné et le montant en jeu, tirés du
  // détail que chaque alerte transporte.
  const detailAlerte = (a: Alerte) => {
    const d = (a.details ?? {}) as Record<string, unknown>;
    const lot = typeof d.lot_id === "string" ? nomsLots.get(d.lot_id) : undefined;
    const montant =
      typeof d.solde === "number"
        ? d.solde
        : typeof d.montant === "number"
          ? d.montant
          : typeof d.net === "number"
            ? d.net
            : null;
    const libelle = typeof d.libelle === "string" ? d.libelle : null;
    return (
      [lot?.nom, libelle, montant !== null ? eur(montant) : null]
        .filter(Boolean)
        .join(" · ") || null
    );
  };

  const surLesBaux: ActionDuJour[] = attendues.map((a) => ({
    cle: a.cle,
    nature: a.critique ? "Bail bloqué" : "Sur un bail",
    criticite: a.critique ? "critique" : "normale",
    titre: a.titre,
    detail: a.detail,
    echeance: null,
    action: (
      <Link
        href={a.href}
        className={buttonVariants({
          size: "sm",
          variant: a.critique ? "destructive" : "outline",
          // Un <a> échappe au min-height tactile posé sur button/select
          className: "pointer-coarse:min-h-10",
        })}
      >
        Résoudre
        <IndicateurLien />
      </Link>
    ),
  }));

  const datees: ActionDuJour[] = alertes.map((a) => ({
    cle: `a-${a.id}`,
    nature: `Alerte ${(CRITICITES[a.criticite] ?? a.criticite).toLowerCase()}`,
    criticite: niveau(a.criticite),
    titre: a.titre,
    detail: detailAlerte(a),
    echeance: a.echeance,
    // Recette 24/08 : la pop-up s'ouvre SUR le tableau de bord ; une alerte
    // incident, elle, emmène au dossier dans l'onglet Incidents.
    action:
      typeof a.details?.incident_id === "string" ? (
        <Link
          href={`/agence/${orgId}/incidents?sel=${a.details.incident_id}`}
          className={buttonVariants({
            size: "sm",
            variant: a.criticite === "critique" ? "destructive" : "outline",
            className: "pointer-coarse:min-h-10",
          })}
        >
          Traiter
          <IndicateurLien />
        </Link>
      ) : (
        <TraiterAlerte
          orgId={orgId}
          alerte={a}
          membres={membres}
          estResponsable={estResponsable}
          className={buttonVariants({
            size: "sm",
            variant: a.criticite === "critique" ? "destructive" : "outline",
          })}
        >
          Traiter
        </TraiterAlerte>
      ),
  }));

  for (const r of (rapports ?? []) as unknown as {
    id: string;
    mois: string;
    mandat: UnOuPlusieurs<{
      date_rapport: number;
      agent_account_id: string | null;
      person: UnOuPlusieurs<{ nom: string; prenom: string | null }>;
    }>;
  }[]) {
    const m = premier(r.mandat);
    // Portefeuille : les rapports des mandats confiés à un autre agent sortent
    // du plan ; un mandat sans titulaire reste l'affaire de tous.
    if (portefeuille && m?.agent_account_id && m.agent_account_id !== user.id) continue;
    const p = premier(m?.person);
    // Un rapport n'est pas dû le premier jour du mois qu'il couvre, mais le jour
    // convenu au mandat, le mois suivant. Prendre `mois` tel quel faisait
    // apparaître le rapport de juin dans « cette semaine » au mois d'août.
    const echeance = echeanceRapport(r.mois, m?.date_rapport ?? 10);
    const e = afficherEcheance(echeance);
    // Les rapports en retard restent affichés : les masquer reviendrait à faire
    // disparaître du travail qui reste à faire.
    if (!e || (!e.depassee && e.jours > 15)) continue;
    datees.push({
      cle: `r-${r.id}`,
      nature: "Rapport de gestion",
      // Le retard se lit à l'échéance et au groupe, pas au fond de la rangée :
      // le rouge reste réservé à ce qui est critique, sinon il n'alerte plus.
      criticite: "normale",
      titre: `Rapport de ${new Date(r.mois).toLocaleDateString("fr-FR", { month: "long", timeZone: "UTC" })}`,
      detail: `${p ? nomComplet(p) : "Mandant"} · à valider avant envoi`,
      echeance,
      action: (
        <Link
          href={`/agence/${orgId}/comptabilite`}
          className={buttonVariants({
            size: "sm",
            variant: "outline",
            className: "pointer-coarse:min-h-10",
          })}
        >
          Valider
          <IndicateurLien />
        </Link>
      ),
    });
  }

  // Tri par urgence réelle : l'échéance d'abord (les sans-date en fin), puis la
  // criticité, puis le titre pour que l'ordre ne bouge pas d'un rendu à l'autre.
  const parUrgence = (a: ActionDuJour, b: ActionDuJour) => {
    if (a.echeance && b.echeance) {
      const parDate = a.echeance.localeCompare(b.echeance);
      if (parDate !== 0) return parDate;
    } else if (a.echeance !== b.echeance) {
      return a.echeance ? -1 : 1;
    }
    return (
      (ORDRE_CRITICITE[a.criticite] ?? 9) - (ORDRE_CRITICITE[b.criticite] ?? 9) ||
      a.titre.localeCompare(b.titre)
    );
  };
  const enRetard = datees
    .filter((x) => x.echeance && x.echeance < aujourdhui)
    .sort(parUrgence);
  const aVenir = datees
    .filter((x) => !x.echeance || x.echeance >= aujourdhui)
    .sort(parUrgence);
  const nbActions = surLesBaux.length + enRetard.length + aVenir.length;
  // « À venir » se coupe à six rangs — et le dit, avec l'endroit où voir le reste.
  const PLAFOND_A_VENIR = 6;
  // Rien à montrer ET une lecture en échec : c'est l'échec qu'on dit, jamais
  // « rien ne vous attend » — le mensonge le plus tranquille du produit.
  const planVide = nbActions === 0 && messagesNonLus === 0;
  const planIllisible = planVide && Boolean(erreurAlertes || erreurRapports);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-7 sm:py-7">
      <div className="entete-page">
        <div>
          <p className="mono-discret sans-majuscules">
            {portefeuille ? "Mon portefeuille · " : ""}
            {new Date().toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
              timeZone: "Europe/Paris",
            })}
          </p>
          <h1 className="mt-0.5">Bonjour{prenom ? ` ${prenom}` : ""},</h1>
          <p className="text-sm text-muted-foreground">
            {role === "agent"
              ? "Voici ce que votre portefeuille attend de vous."
              : "Voici ce que votre agence attend de vous."}
          </p>
        </div>
        <span className="mono-discret">
          {/* Un compte tiré d'une lecture en échec ne s'affiche pas : il
              vaudrait moins que rien, il rassurerait à tort. */}
          {erreurAlertes || erreurRapports
            ? "compte indisponible"
            : `${nbActions} action${nbActions > 1 ? "s" : ""}${
                enRetard.length > 0 ? ` · ${enRetard.length} en retard` : ""
              }`}
        </span>
      </div>

      {lecturesEnEchec.length > 0 && (
        <div className="err mt-4" role="alert">
          Une partie de cet écran n&apos;a pas pu être lue —{" "}
          {lecturesEnEchec.join(", ")}. Ce qui manque ici n&apos;est pas
          forcément absent de votre agence : rechargez dans un instant.
        </div>
      )}

      {/* 1. Ce qu'il y a à faire. L'écran du matin commence par là : les
          chiffres viennent après, ils racontent, ils ne demandent rien. */}
      <section className="section-ecran mt-6">
        <div className="entete-carte">
          <h2 className="text-[length:var(--pas-section)]">Votre plan du jour</h2>
          <Link href={`/agence/${orgId}/alertes`} className="lien-discret">
            Toutes les alertes&nbsp;→
          </Link>
        </div>

        {planIllisible ? (
          <LectureImpossible quoi="ce que vous avez à traiter" />
        ) : planVide ? (
          <div className="vide-guide">
            <p className="titre">Rien ne vous attend ce matin</p>
            <p className="explication">
              Aucun bail bloqué, aucune alerte confiée, aucun rapport à valider.
              Gerimmo pose les alertes tout seul — diagnostic périmé, état des
              lieux à faire, loyer impayé : elles arriveront ici.
            </p>
            <span className="geste">
              <Link
                href={`/agence/${orgId}/parc`}
                className={buttonVariants({ variant: "outline", size: "sm", className: "pointer-coarse:min-h-10" })}
              >
                Ouvrir le parc
                <IndicateurLien />
              </Link>
              <Link
                href={`/agence/${orgId}/alertes`}
                className={buttonVariants({ variant: "outline", size: "sm", className: "pointer-coarse:min-h-10" })}
              >
                Toutes les alertes
                <IndicateurLien />
              </Link>
            </span>
          </div>
        ) : (
          <div className="colonne-liste">
            {/* Les blocages que la fiche de chaque bail affiche (source
                commune, audit 09/09) : impayés, EDL d'entrée, diagnostics,
                pièces expirées — chaque ligne mène à l'écran qui résout. */}
            <GroupeActions
              titre="À débloquer sur les baux"
              actions={surLesBaux}
              total={surLesBaux.length}
            />
            <GroupeActions titre="En retard" actions={enRetard} total={enRetard.length} />
            <GroupeActions
              titre="À venir"
              actions={aVenir.slice(0, PLAFOND_A_VENIR)}
              total={aVenir.length}
              reste={
                aVenir.length > PLAFOND_A_VENIR ? (
                  <Link href={`/agence/${orgId}/alertes`} className="rang">
                    <span className="min-w-0 flex-1 text-sm">
                      {aVenir.length - PLAFOND_A_VENIR} autre
                      {aVenir.length - PLAFOND_A_VENIR > 1 ? "s" : ""} à venir
                    </span>
                    <span className="lien-discret">
                      Tout voir&nbsp;→
                      <IndicateurLien />
                    </span>
                  </Link>
                ) : undefined
              }
            />
            {erreurAlertes && !erreurRapports && (
              <div className="p-[var(--rythme-3)]">
                <LectureImpossible quoi="les alertes qui vous sont confiées" />
              </div>
            )}
            {erreurRapports && !erreurAlertes && (
              <div className="p-[var(--rythme-3)]">
                <LectureImpossible quoi="les rapports de gestion à valider" />
              </div>
            )}
            {/* Les messages non lus sont une action, pas un chiffre de plus :
                ils tiennent en un rang, au bas du plan. */}
            {messagesNonLus > 0 && (
              <Link href={`/agence/${orgId}/messages`} className="rang">
                <span className="min-w-0 flex-1 text-sm">
                  {messagesNonLus} message{messagesNonLus > 1 ? "s" : ""} non lu
                  {messagesNonLus > 1 ? "s" : ""} de vos locataires
                </span>
                <span className="lien-discret">
                  Lire&nbsp;→
                  <IndicateurLien />
                </span>
              </Link>
            )}
          </div>
        )}
      </section>

      {/* 2. Les chiffres du jour — ce qui se passe, pas ce qu'on doit faire. */}
      <section className="section-ecran grid gap-[var(--rythme-4)] sm:grid-cols-2">
        {/* Tuile Incidents de la maquette (conformité 24/08) : dossiers en
            cours, jauge par payeur, la file à qualifier en sous-ligne. */}
        <Link href={`/agence/${orgId}/incidents`} className="kpi or h-full">
          <span className="eyebrow">Incidents</span>
          <span className="mt-1 flex items-baseline gap-2">
            <span className="chiffre">{erreurIncidents ? "—" : dossiersIncidents.length}</span>
            <span className="text-sm text-muted-foreground">en cours</span>
          </span>
          {/* Pas de jauge sur une lecture en échec : une barre à zéro dessine
              une répartition qu'on n'a pas lue. */}
          {!erreurIncidents && (
            <span className="jauge" aria-hidden>
              {segmentsIncidents.map((s) => (
                <span
                  key={s.libelle}
                  style={{ flex: s.valeur || 0.01, background: s.couleur }}
                />
              ))}
            </span>
          )}
          <span className="block text-xs text-muted-foreground">
            {erreurIncidents ? (
              <span className="text-destructive">Lecture impossible — rechargez</span>
            ) : aQualifier > 0 ? (
              <span className="text-warning-soft-foreground">
                {aQualifier} à qualifier — votre décision lance la suite
              </span>
            ) : dossiersIncidents.length > 0 ? (
              "Tous qualifiés — rien à trancher"
            ) : (
              "Aucun dossier en cours"
            )}
          </span>
        </Link>

        {/* Maquette : l'encaissé du mois, jauge de quittancement */}
        <Link href={`/agence/${orgId}/comptabilite`} className="kpi bleu h-full">
          <span className="eyebrow">Encaissé en {nomMois}</span>
          <span className="mt-1 flex flex-wrap items-baseline gap-x-2">
            {/* Le montant ne casse jamais avant son « € » (conformité 24/08) */}
            <span className="chiffre montant whitespace-nowrap">
              {erreurEncaissements ? "—" : eur(totalEncaisse)}
            </span>
            {!erreurAppels && totalAppele > 0 && (
              <span className="montant text-sm whitespace-nowrap text-muted-foreground">
                / {eur(totalAppele)} appelés
              </span>
            )}
          </span>
          {!erreurAppels && !erreurEncaissements && (
            <span className="jauge" aria-hidden>
              <span
                style={{
                  flex: Math.min(totalEncaisse, totalAppele) || 0.01,
                  background: "var(--bleu)",
                }}
              />
              <span
                style={{
                  flex: Math.max(totalAppele - totalEncaisse, 0) || 0.01,
                  background: "var(--or-clair)",
                }}
              />
            </span>
          )}
          <span className="block text-xs text-muted-foreground">
            {erreurAppels || erreurEncaissements ? (
              <span className="text-destructive">Lecture impossible — rechargez</span>
            ) : totalAppele > 0 ? (
              `${Math.round((totalEncaisse / totalAppele) * 100)} % du quittancement du mois`
            ) : (
              "Aucun appel de loyer émis ce mois"
            )}
          </span>
        </Link>
      </section>

      {/* 3. Rangée graphique : répartition du parc, encaissements et dépenses
          sur 6 mois. « Incidents par payeur » retiré le 30/08 : un incident
          est une alerte, il vit déjà dans le plan du jour. */}
      <section className="section-ecran grid gap-[var(--rythme-4)] md:grid-cols-2">
        <Card>
          <CardContent>
            <div className="entete-carte">
              <h3 className="text-[length:var(--pas-sous-titre)]">Répartition du parc</h3>
              <span className="mono-discret">
                {erreurLots ? "—" : `${lotsActifs.length} lot${lotsActifs.length > 1 ? "s" : ""}`}
              </span>
            </div>
            {erreurLots ? (
              <LectureImpossible quoi="les lots du parc" />
            ) : lotsActifs.length === 0 ? (
              <p className="vide">
                Aucun lot suivi pour l&apos;instant — le parc se remplit depuis
                l&apos;onglet Parc.
              </p>
            ) : (
              <div className="bloc-graph">
                <Donut segments={segmentsParc} centre={`${tauxOccupation} %`} sous="LOUÉS" />
                <LegendeDonut segments={segmentsParc} />
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="entete-carte">
              <h3 className="text-[length:var(--pas-sous-titre)]">Encaissements et dépenses</h3>
              <span className="mono-discret">
                {portefeuille ? "Mon portefeuille · 6 mois" : "6 mois"}
              </span>
            </div>
            {erreurEcritures ? (
              <LectureImpossible quoi="les écritures des six derniers mois" />
            ) : historiqueVide ? (
              <p className="vide">
                Aucune écriture sur les six derniers mois — rien à comparer
                encore.
              </p>
            ) : (
              <>
                <BarresDouble donnees={historique} />
                <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden className="size-2.5" style={{ background: "var(--success)" }} />
                    Encaissé
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden className="size-2.5" style={{ background: "var(--warning)" }} />
                    Dépenses
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      {/* 4. Le pouls du portefeuille, et ce qui se prépare. */}
      <section className="section-ecran grid gap-[var(--rythme-4)] lg:grid-cols-[1.6fr_1fr]">
        <FilActivite
          supabase={supabase}
          orgId={orgId}
          portefeuille={portefeuille}
          agentId={user.id}
        />
        <Card>
          <CardContent>
            <div className="entete-carte">
              <h3 className="text-[length:var(--pas-sous-titre)]">Lots en préparation</h3>
              {enPreparation.length > 6 && (
                <Link href={`/agence/${orgId}/parc`} className="lien-discret">
                  Voir les {enPreparation.length}
                  <IndicateurLien />
                </Link>
              )}
            </div>
            {erreurLots ? (
              <LectureImpossible quoi="les lots en préparation" />
            ) : enPreparation.length === 0 ? (
              <p className="vide">Aucun lot en préparation.</p>
            ) : (
              <ul className="divide-y divide-border">
                {enPreparation.slice(0, 6).map((l) => {
                  const motif = blocages.get(l.id);
                  const cible = motif
                    ? cibleBlocage(motif, { orgId, bienId: l.bien_id, lotId: l.id })
                    : null;
                  return (
                    <li key={l.id} className="flex items-center gap-3 py-2.5">
                      <span className="puce puce-grise shrink-0">{l.nom}</span>
                      <Link
                        href={cible?.href ?? `/agence/${orgId}/parc/${l.bien_id}/lots/${l.id}`}
                        className="min-w-0 flex-1 truncate text-sm hover:underline"
                      >
                        {erreurBlocages
                          ? "Blocages illisibles — ouvrir la fiche du lot"
                          : motif
                            ? resumerBlocage(motif)
                            : "Prêt à publier"}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
