import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  actionsAttendues,
  sansAlertesDoublonnees,
  type ActionAttendue,
} from "@/lib/actions-attendues";
import { echeanceRapport } from "@/lib/echeances";
import { CRITICITES, ORDRE_CRITICITE, aujourdhuiParis, eur } from "@/lib/ged";
import { PortefeuilleIndisponible } from "@/lib/portefeuille";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";
import { nomComplet } from "@/lib/roles-personnes";

// CE QUI M'ATTEND AUJOURD'HUI — un seul calcul pour trois écrans (relevé du
// 24/09 : « on lit “2 à faire”, on clique, on n'en trouve qu'un »). La tuile
// « À faire » de l'accueil additionnait les actions attendues sur les baux,
// mes alertes ouvertes dédoublonnées et les rapports de gestion à valider ; la
// pastille « Alertes » de la barre et la page /alertes ne comptaient que la
// table des alertes — trois chiffres pour la même question. Le calcul vit ici,
// et chaque écran le lit :
//   - `regrouperActionsDuJour` : pure, sans base — les rangs, leurs groupes,
//     leur ordre ; c'est elle que les tests exercent ;
//   - `chargerActionsDuJour` : les lectures, mémorisées par requête, pour que
//     le layout (la pastille) et la page n'interrogent la base qu'une fois.

/** Une alerte ouverte telle que la table la rend (les champs que les écrans lisent). */
export type AlerteDuJour = {
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

/** Un rapport de gestion « à valider », avec le mandat qui fixe son jour de rendu. */
export type RapportAValider = {
  id: string;
  mois: string;
  mandat: UnOuPlusieurs<{
    date_rapport: number | null;
    agent_account_id: string | null;
    person: UnOuPlusieurs<{ nom: string; prenom: string | null }>;
  }>;
};

type RangCommun = {
  cle: string;
  /** L'étiquette du rang : « Bail bloqué », « Alerte normale », « Rapport de gestion »… */
  nature: string;
  criticite: "critique" | "normale" | "informative";
  titre: string;
  detail: string | null;
  echeance: string | null;
};

// Les rangs du plan du jour : une seule et même rangée de la charte
// (.rang-alerte), quelle que soit la source de l'action. La source décide du
// geste : un lien vers l'écran qui résout (bail, rapport, alerte incident) ou
// la pop-up « Traiter » ouverte sur place (les autres alertes).
export type ActionDuJour =
  | (RangCommun & { source: "bail"; href: string; type?: undefined; alerte?: undefined })
  | (RangCommun & { source: "rapport"; href: string; type?: undefined; alerte?: undefined })
  | (RangCommun & {
      source: "alerte";
      /** Le type de l'alerte : c'est lui qui décide de ce qui passe sous la coupe de « À venir ». */
      type: string;
      alerte: AlerteDuJour;
      /** L'écran qui traite, quand il y en a un (incident) ; null : la pop-up s'ouvre sur place. */
      href: string | null;
    });

/** Un rang du groupe « À débloquer sur les baux » : toujours un lien qui résout. */
export type ActionSurBail = Extract<ActionDuJour, { source: "bail" }>;

export type PlanDuJour = {
  /** Les blocages que la fiche de chaque bail affiche — sans échéance. */
  surLesBaux: ActionSurBail[];
  /** Alertes et rapports dont l'échéance est passée, les plus urgents d'abord. */
  enRetard: ActionDuJour[];
  /** Alertes et rapports à venir ou sans date, les plus urgents d'abord. */
  aVenir: ActionDuJour[];
  /** LE chiffre — celui que disent la tuile « À faire », la pastille « Alertes » et /alertes. */
  total: number;
  /** Rangs critiques, toutes sources confondues : la pastille passe au rouge. */
  critiques: number;
};

/** Un rapport de gestion entre dans le plan dès qu'il est dû sous ce délai (ou en retard). */
export const DELAI_RAPPORT_A_VENIR = 15;

const niveau = (c: string): RangCommun["criticite"] =>
  c === "critique" ? "critique" : c === "normale" ? "normale" : "informative";

// Jours entre deux dates « AAAA-MM-JJ », négatif si la première est passée.
// En UTC des deux côtés : la valeur ne dépend pas du fuseau de la machine.
const joursAvant = (echeance: string, aujourdhui: string): number =>
  Math.round(
    (new Date(`${echeance.slice(0, 10)}T00:00:00Z`).getTime() -
      new Date(`${aujourdhui}T00:00:00Z`).getTime()) /
      86_400_000
  );

// Contexte d'une alerte : ce qu'elle transporte dans son détail (libellé,
// montant en jeu). Le nom du lot, lui, s'ajoute à l'affichage par l'écran qui
// connaît le parc.
function detailAlerte(a: AlerteDuJour): string | null {
  const d = (a.details ?? {}) as Record<string, unknown>;
  const montant =
    typeof d.solde === "number"
      ? d.solde
      : typeof d.montant === "number"
        ? d.montant
        : typeof d.net === "number"
          ? d.net
          : null;
  const libelle = typeof d.libelle === "string" ? d.libelle : null;
  return [libelle, montant !== null ? eur(montant) : null].filter(Boolean).join(" · ") || null;
}

// Tri par urgence réelle : l'échéance d'abord (les sans-date en fin), puis la
// criticité, puis le titre pour que l'ordre ne bouge pas d'un rendu à l'autre.
function parUrgence(a: ActionDuJour, b: ActionDuJour): number {
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
}

/**
 * Le regroupement, sans base : à partir des trois sources déjà lues, les rangs
 * du plan et le compte. Pure et déterministe — `aujourdhui` se passe en test.
 */
export function regrouperActionsDuJour({
  orgId,
  userId,
  portefeuille,
  attendues,
  alertes,
  rapports,
  aujourdhui = aujourdhuiParis(),
}: {
  orgId: string;
  userId: string;
  /** Les lots de mon portefeuille (RM-18.1.3) ; null : je vois tout. */
  portefeuille: Set<string> | null;
  attendues: ActionAttendue[];
  /** Mes alertes ouvertes (confiées à moi ou à tout le monde), brutes. */
  alertes: AlerteDuJour[];
  rapports: RapportAValider[];
  /** « AAAA-MM-JJ », date de Paris. */
  aujourdhui?: string;
}): PlanDuJour {
  const surLesBaux: ActionSurBail[] = attendues.map((a) => ({
    cle: a.cle,
    source: "bail",
    nature: a.critique ? "Bail bloqué" : "Sur un bail",
    criticite: a.critique ? "critique" : "normale",
    titre: a.titre,
    detail: a.detail,
    echeance: null,
    href: a.href,
  }));

  // Une alerte qui répète un item calculé (EDL d'entrée posée à l'activation)
  // ne s'affiche pas deux fois : l'item calculé fait foi.
  const datees: ActionDuJour[] = sansAlertesDoublonnees(alertes, attendues).map((a) => ({
    cle: `a-${a.id}`,
    source: "alerte",
    type: a.type,
    nature: `Alerte ${(CRITICITES[a.criticite] ?? a.criticite).toLowerCase()}`,
    criticite: niveau(a.criticite),
    titre: a.titre,
    detail: detailAlerte(a),
    echeance: a.echeance,
    alerte: a,
    // Recette 24/08 : la pop-up s'ouvre SUR l'écran courant ; une alerte
    // incident, elle, emmène au dossier dans l'onglet Incidents.
    href:
      typeof a.details?.incident_id === "string"
        ? `/agence/${orgId}/incidents?sel=${a.details.incident_id}`
        : null,
  }));

  for (const r of rapports) {
    const m = premier(r.mandat);
    // Portefeuille : les rapports des mandats confiés à un autre agent sortent
    // du plan ; un mandat sans titulaire reste l'affaire de tous.
    if (portefeuille && m?.agent_account_id && m.agent_account_id !== userId) continue;
    const p = premier(m?.person);
    // Un rapport n'est pas dû le premier jour du mois qu'il couvre, mais le jour
    // convenu au mandat, le mois suivant. Prendre `mois` tel quel faisait
    // apparaître le rapport de juin dans « cette semaine » au mois d'août.
    const echeance = echeanceRapport(r.mois, m?.date_rapport ?? 10);
    // Les rapports en retard restent affichés : les masquer reviendrait à faire
    // disparaître du travail qui reste à faire.
    if (joursAvant(echeance, aujourdhui) > DELAI_RAPPORT_A_VENIR) continue;
    datees.push({
      cle: `r-${r.id}`,
      source: "rapport",
      nature: "Rapport de gestion",
      // Le retard se lit à l'échéance et au groupe, pas au fond de la rangée :
      // le rouge reste réservé à ce qui est critique, sinon il n'alerte plus.
      criticite: "normale",
      titre: `Rapport de ${new Date(r.mois).toLocaleDateString("fr-FR", { month: "long", timeZone: "UTC" })}`,
      detail: `${p ? nomComplet(p) : "Mandant"} · à valider avant envoi`,
      echeance,
      href: `/agence/${orgId}/comptabilite`,
    });
  }

  const enRetard = datees.filter((x) => x.echeance && x.echeance < aujourdhui).sort(parUrgence);
  const aVenir = datees.filter((x) => !x.echeance || x.echeance >= aujourdhui).sort(parUrgence);
  const tous = [...surLesBaux, ...enRetard, ...aVenir];
  return {
    surLesBaux,
    enRetard,
    aVenir,
    total: tous.length,
    critiques: tous.filter((x) => x.criticite === "critique").length,
  };
}

export type LectureActionsDuJour = {
  plan: PlanDuJour;
  /** Les actions attendues sur les baux — /alertes s'en sert pour dédoublonner sa table. */
  attendues: ActionAttendue[];
  /** Une lecture en échec ne doit jamais ressembler à du vide : chaque écran le dit. */
  erreurs: { alertes: boolean; rapports: boolean };
};

// `cache()` compare ses arguments par référence : le layout et la page
// tiennent chacun leur propre Set du portefeuille (même RPC, même contenu), et
// deux Sets ne sont jamais égaux. La clé passe donc par les identifiants
// triés — et se relit en Set de l'autre côté.
export function cleDuPortefeuille(portefeuille: Set<string> | null): string {
  if (portefeuille === null) return "*";
  if (portefeuille instanceof PortefeuilleIndisponible) return "!";
  return [...portefeuille].sort().join(",");
}

export function portefeuilleDepuisCle(cle: string): Set<string> | null {
  if (cle === "*") return null;
  if (cle === "!") return new PortefeuilleIndisponible();
  return new Set(cle ? cle.split(",") : []);
}

const lire = cache(
  async (
    supabase: SupabaseClient,
    orgId: string,
    userId: string,
    clePortefeuille: string
  ): Promise<LectureActionsDuJour> => {
    const portefeuille = portefeuilleDepuisCle(clePortefeuille);
    const [
      // Ce que la fiche de chaque bail affiche comme blocage (audit 09/09) :
      // impayés, EDL d'entrée non signé, diagnostics obligatoires, pièces
      // expirées — même source que la fiche, pour que l'accueil ne dise jamais
      // « tout est à jour » quand un bail est bloqué.
      attendues,
      { data: alertes, error: erreurAlertes },
      { data: rapports, error: erreurRapports },
    ] = await Promise.all([
      actionsAttendues(supabase, orgId, { portefeuille }),
      // « À traiter » se calcule sur MES alertes (revue recette 08/08) : celles
      // qui me sont confiées nominativement, plus celles à tout le monde.
      supabase
        .from("alerts")
        .select(
          "id, type, criticite, titre, echeance, details, created_at, assignee_account_id, assigned_all, escalades"
        )
        .eq("organization_id", orgId)
        .eq("statut", "ouverte")
        .or(`assigned_all.eq.true,assignee_account_id.eq.${userId}`),
      supabase
        .from("rapports_gestion")
        .select(
          "id, mois, statut, mandat:mandats(date_rapport, agent_account_id, person:persons(nom, prenom))"
        )
        .eq("organization_id", orgId)
        .eq("statut", "a_valider")
        .order("mois"),
    ]);
    const plan = regrouperActionsDuJour({
      orgId,
      userId,
      portefeuille,
      attendues,
      alertes: (alertes ?? []) as AlerteDuJour[],
      rapports: (rapports ?? []) as unknown as RapportAValider[],
    });
    return {
      plan,
      attendues,
      erreurs: { alertes: Boolean(erreurAlertes), rapports: Boolean(erreurRapports) },
    };
  }
);

/**
 * Les lectures du plan du jour, mémorisées par requête : le layout (pastille),
 * l'accueil et /alertes l'appellent pour le même compte et le même
 * portefeuille — un seul aller-retour par page.
 */
export function chargerActionsDuJour(
  supabase: SupabaseClient,
  orgId: string,
  { userId, portefeuille }: { userId: string; portefeuille: Set<string> | null }
): Promise<LectureActionsDuJour> {
  return lire(supabase, orgId, userId, cleDuPortefeuille(portefeuille));
}

/** Le seul chiffre, pour la pastille : combien attendent un geste, dont combien de critiques. */
export async function compterActionsDuJour(
  supabase: SupabaseClient,
  orgId: string,
  options: { userId: string; portefeuille: Set<string> | null }
): Promise<{ total: number; critiques: number }> {
  const { plan } = await chargerActionsDuJour(supabase, orgId, options);
  return { total: plan.total, critiques: plan.critiques };
}
