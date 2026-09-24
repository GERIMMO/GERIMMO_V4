import type { ReactNode } from "react";
import Link from "next/link";
import { verifierAccesEspace } from "@/lib/espace";
import { resumerBlocage } from "@/lib/echeances";
import { cibleBlocage } from "@/lib/parc";
import { chargerActionsDuJour, type ActionDuJour } from "@/lib/actions-du-jour";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";
import { lotsDuPortefeuille, PortefeuilleIndisponible } from "@/lib/portefeuille";
import { totalMessagesNonLus } from "@/lib/messagerie";
import { ROLES_RESPONSABLES, eur, aujourdhuiParis } from "@/lib/ged";
import { TraiterAlerte } from "./alertes/traiter-alerte";
import { GroupeActions, LienGeste, type RangDuJour } from "./alertes/groupe-actions";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { IndicateurLien } from "@/components/ui/indicateur-lien";
import { Donut, LegendeDonut, BarresDouble } from "@/components/graphes";
import { FilActivite } from "./fil-activite";
import { AccueilProprietaire } from "./accueil-proprietaire";
import { ParcoursDemarrage } from "@/components/parcours-demarrage";
import { envoisEteints as listerEnvoisEteints } from "@/lib/envois-automatiques";
import { IconeTrait } from "@/components/icone-trait";
import { PhotoDecor } from "@/components/photo-decor";
import { PHOTOS_ACCUEIL } from "@/lib/photos-decor";

export const metadata = { title: "Tableau de bord — Gerimmo" };

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

// (Les rangées du plan du jour — `GroupeActions`, une seule et même rangée de
//  la charte quelle que soit la source — vivent dans ./alertes/groupe-actions
//  depuis le 24/09 : la page Alertes les affiche aussi.)

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
  // L'assistant propose l'automatisation au bon moment (audit du 20/09) : dès
  // qu'un lot est loué et qu'un des trois envois automatiques est éteint, il
  // le dit — une fois par écran, un lien, jamais un geste à la place du
  // responsable. Les réglages se lisent ici parce que `verifierAccesEspace`
  // ne les porte pas.
  const { data: reglagesEnvoi } = estResponsable
    ? await supabase
        .from("organizations")
        .select("quittances_envoi_auto, appels_envoi_auto, relances_envoi_auto")
        .eq("id", orgId)
        .maybeSingle()
    : { data: null };
  const envoisEteints = listerEnvoisEteints(reglagesEnvoi);
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
    { data: appelsMois, error: erreurAppels },
    { data: encaissementsMois, error: erreurEncaissements },
    { data: ecrituresSixMois, error: erreurEcritures },
    { data: blocagesParc, error: erreurBlocages },
    { data: incidentsEnCours, error: erreurIncidents },
    { data: donneesMembres, error: erreurMembres },
    messagesNonLus,
    // Le plan du jour — baux bloqués (même source que la fiche du bail, audit
    // 09/09), mes alertes, rapports à valider — vient du calcul que la
    // pastille « Alertes » et /alertes lisent aussi (24/09) : trois écrans, un
    // seul chiffre. Mémorisé par requête : le layout l'a déjà demandé, la
    // base n'est pas interrogée deux fois.
    { plan, erreurs: { alertes: erreurAlertes, rapports: erreurRapports } },
    { data: etapesDemarrage },
  ] = await Promise.all([
    supabase.from("lots").select("id, nom, etat, bien_id").eq("organization_id", orgId),
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
    chargerActionsDuJour(supabase, orgId, { userId: user.id, portefeuille }),
    // Où en est le démarrage : décide de la PLACE du parcours (24/09) — en
    // tête tant que le premier bail n'est pas en cours, une ligne après
    // l'assistant ensuite. Même fonction que le composant du parcours.
    estResponsable
      ? supabase.rpc("parcours_demarrage", { p_org: orgId })
      : Promise.resolve({ data: null, error: null }),
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
    portefeuille instanceof PortefeuilleIndisponible && "votre portefeuille",
    messagesNonLus === null && "les messages non lus",
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

  // Tuile Incidents : l'imputation décide de qui paie (module 7) —
  // « pas encore tranché » est la file d'attente de qualification.
  const dossiersIncidents = (
    (incidentsEnCours ?? []) as { imputation: string | null; lot_id: string }[]
  ).filter((i) => dansPortefeuille(i.lot_id));
  const aQualifier = dossiersIncidents.filter((i) => !i.imputation).length;
  // (La jauge par payeur a quitté la tuile Incidents avec la v4 : le détail
  //  de l'imputation se lit sur l'écran Incidents, pas sur l'accueil.)

  const lotsActifs = (lots ?? []).filter(
    (l) => l.etat !== "archive" && dansPortefeuille(l.id)
  );
  const nomsLots = new Map(lotsActifs.map((l) => [l.id, { nom: l.nom, bienId: l.bien_id }]));
  const nbLoues = lotsActifs.filter((l) => l.etat === "loue" || l.etat === "preavis").length;
  // L'assistant propose l'automatique dès qu'un lot est loué ; le parcours de
  // démarrage ne le redit pas sur le même écran.
  const assistantProposeAutomatique = estResponsable && nbLoues > 0 && envoisEteints.length > 0;
  const enPreparation = lotsActifs.filter((l) => l.etat === "brouillon");
  // Vide, la carte « Lots en préparation » ne s'affiche pas ; un échec de
  // lecture, lui, se dit toujours (voir LectureImpossible).
  const carteLotsEnPreparation = Boolean(erreurLots) || enPreparation.length > 0;
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
  // et la même alerte s'y lisait deux fois, rendue de deux façons. Une seule
  // liste, une seule rangée, l'urgence en tête. Le calcul (lib/actions-du-jour,
  // 24/09) est celui de la pastille « Alertes » et de /alertes ; ici, chaque
  // rang reçoit son geste.
  const aujourdhui = aujourdhuiParis();

  // Le nom du lot devant le contexte que l'alerte transporte : seul cet écran
  // connaît le parc.
  const detailAvecLot = (a: ActionDuJour): string | null => {
    if (a.source !== "alerte") return a.detail;
    const lotId = a.alerte.details?.lot_id;
    const lot = typeof lotId === "string" ? nomsLots.get(lotId) : undefined;
    return [lot?.nom, a.detail].filter(Boolean).join(" · ") || null;
  };

  // Le geste d'un rang : un lien vers l'écran qui résout (bail, rapport,
  // alerte incident) ou — recette 24/08 — la pop-up « Traiter » ouverte SUR le
  // tableau de bord.
  const geste = (a: ActionDuJour): ReactNode => {
    if (a.source === "bail") {
      return (
        <LienGeste href={a.href} critique={a.criticite === "critique"}>
          Résoudre
        </LienGeste>
      );
    }
    if (a.source === "rapport") return <LienGeste href={a.href}>Valider</LienGeste>;
    if (a.href) {
      return (
        <LienGeste href={a.href} critique={a.criticite === "critique"}>
          Traiter
        </LienGeste>
      );
    }
    return (
      <TraiterAlerte
        orgId={orgId}
        alerte={a.alerte}
        membres={membres}
        estResponsable={estResponsable}
        aujourdhui={aujourdhui}
        className={buttonVariants({
          size: "sm",
          variant: a.criticite === "critique" ? "destructive" : "outline",
        })}
      >
        Traiter
      </TraiterAlerte>
    );
  };
  const rangs = (liste: ActionDuJour[]): RangDuJour[] =>
    liste.map((a) => ({ ...a, detail: detailAvecLot(a), action: geste(a) }));

  const surLesBaux = rangs(plan.surLesBaux);
  const enRetard = rangs(plan.enRetard);
  const aVenir = rangs(plan.aVenir);
  const nbActions = plan.total;
  // Le repli du 12/09 visait un mur de quinze rangées ; jusqu'à cinq actions,
  // le plan tient à l'écran et s'ouvre à l'arrivée (24/09).
  const SEUIL_PLAN_OUVERT = 5;
  const ouvrirPlan = nbActions <= SEUIL_PLAN_OUVERT;
  // « À venir » se coupe à six rangs — et le dit, avec l'endroit où voir le reste.
  const PLAFOND_A_VENIR = 6;
  // … sauf l'incident à qualifier. Relevé du 11/09 : `incident_creer` insère son
  // alerte SANS échéance (migration 20260821093624, l.174-183), les rangées sans
  // date passent après les datées (`parUrgence`, ci-dessus), et la coupe à six
  // faisait disparaître de l'accueil la déclaration la plus fraîche : il fallait
  // « Tout voir → » puis re-cliquer « Traiter », deux clics au lieu d'un.
  // Ne remonter que les CRITIQUES sans date ne suffirait pas : l'alerte n'est
  // critique que si l'urgence l'est (même migration, l.176-179) — une
  // déclaration normale, le cas courant, resterait au fond de la liste.
  // Elle reste visible, elle ne prend pas de date : aucune page de
  // wiki/regles-metier/ ne fixe de délai de qualification, et lui en inventer un
  // en base créerait un délai opposable que personne n'a tranché (RM-7.2.7 dit
  // que rien ne part sans imputation, pas sous combien de temps).
  const TYPES_HORS_PLAFOND = new Set(["incident_a_qualifier"]);
  const aVenirVisibles = aVenir.filter(
    (a, rang) => rang < PLAFOND_A_VENIR || TYPES_HORS_PLAFOND.has(a.type ?? "")
  );
  // Rien à montrer ET une lecture en échec : c'est l'échec qu'on dit, jamais
  // « rien ne vous attend » — le mensonge le plus tranquille du produit.
  const planVide = nbActions === 0 && messagesNonLus === 0;
  const planIllisible = planVide && Boolean(erreurAlertes || erreurRapports);

  // ---------------------------------------------------------------- Accueil v4
  // « Montre-moi ce qui est important maintenant. » Une phrase dit si tout va
  // bien ; quatre chiffres disent où l'on en est ; l'assistant liste ce qui
  // attend un geste ; le reste — activité, préparation, statistiques — vient
  // après, et les statistiques sont repliées.
  const elementsEnAttente = nbActions + (messagesNonLus && messagesNonLus > 0 ? 1 : 0);
  const toutEnOrdre = !planIllisible && elementsEnAttente === 0 && aQualifier === 0;
  const tauxQuittancement =
    !erreurAppels && !erreurEncaissements && totalAppele > 0
      ? Math.round((totalEncaisse / totalAppele) * 100)
      : null;
  // Au-delà de SEUIL_PLAN_OUVERT, les groupes restent REPLIÉS à l'arrivée
  // (demande du 12/09 : « des listes déroulantes par défaut repliées ») : la
  // phrase d'accueil et l'en-tête de l'assistant disent déjà combien.

  // Le démarrage (24/09) : une fois le premier bail en cours, le parcours en
  // cinq étapes n'a plus rien à apprendre — il occupait tout le premier écran
  // pour une seule étape restante, sous un titre (« Mettre votre premier lot
  // en location ») que l'état démentait. Il se réduit à UNE ligne, après les
  // chiffres et l'assistant.
  const etapes = (etapesDemarrage ?? []) as { etape: string; faite: boolean }[];
  const premierBailEnCours = etapes.some((e) => e.etape === "bail" && e.faite);
  const etapesRestantes = premierBailEnCours ? etapes.filter((e) => !e.faite) : [];
  const FIN_DE_MISE_EN_PLACE: Record<string, { quoi: string; geste: string; href: string }> = {
    identite: {
      quoi: "complétez l'identité de l'agence",
      geste: "Compléter le profil",
      href: `/agence/${orgId}/profil`,
    },
    bien: { quoi: "ajoutez un premier bien", geste: "Ajouter un bien", href: `/agence/${orgId}/parc/nouveau` },
    lot_pret: {
      quoi: "levez ce qui bloque la mise en location de vos lots",
      geste: "Lever ce qui bloque",
      href: `/agence/${orgId}/parc`,
    },
    locataire: {
      quoi: "créez la fiche d'un locataire et invitez-le dans son espace",
      geste: "Créer sa fiche",
      href: `/agence/${orgId}/personnes#creer-fiche`,
    },
  };
  const finDeMiseEnPlace = etapesRestantes.length
    ? FIN_DE_MISE_EN_PLACE[etapesRestantes[0].etape]
    : undefined;

  return (
    // max-w-5xl : la même largeur que le parc, les personnes, les loyers —
    // le bord du contenu ne saute plus d'un écran à l'autre (tour du 24/09).
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-7 sm:py-7">
      {/* 0. L'accueil humain */}
      <div className="entete-page accueil-bandeau items-end">
        <PhotoDecor sources={PHOTOS_ACCUEIL} sizes="(max-width: 640px) 100vw, 60vw" priority className="accueil-photo" />
        <div>
          <p className="text-[12.5px] text-[var(--texte-3)]">
            {portefeuille ? "Mon portefeuille · " : ""}
            {new Date().toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              timeZone: "Europe/Paris",
            })}
          </p>
          <h1 className="mt-0.5">Bonjour{prenom ? ` ${prenom}` : ""}</h1>
          <p className={`accueil-phrase${toutEnOrdre ? " ok" : ""}`}>
            {planIllisible ? (
              "Une partie de vos informations n'a pas pu être lue."
            ) : toutEnOrdre ? (
              "Aucune alerte en attente."
            ) : (
              <>
                <b>{elementsEnAttente}</b> élément{elementsEnAttente > 1 ? "s" : ""}{" "}
                {elementsEnAttente > 1 ? "nécessitent" : "nécessite"} votre attention.
              </>
            )}
          </p>
        </div>
      </div>

      {lecturesEnEchec.length > 0 && (
        <div className="err mt-4" role="alert">
          Une partie de cet écran n&apos;a pas pu être lue —{" "}
          {lecturesEnEchec.join(", ")}. Ce qui manque ici n&apos;est pas
          forcément absent de votre agence : rechargez dans un instant.
        </div>
      )}

      {/* Le chemin du démarrage — AVANT tout le reste tant que le premier
          bail n'est pas en cours. Une agence qui vient d'ouvrir n'a ni
          action ni chiffre : ce qu'elle attend, c'est de savoir par où
          commencer. Ensuite, une ligne après l'assistant (voir plus bas). */}
      {estResponsable && !premierBailEnCours && (
        <div className="mt-6">
          <ParcoursDemarrage
            supabase={supabase}
            orgId={orgId}
            automatiqueProposeAilleurs={assistantProposeAutomatique}
          />
        </div>
      )}

      {/* 1. Quatre chiffres — une ligne chacun, un point de couleur pour l'état. */}
      <section className="tuiles mt-6" aria-label="Les chiffres du jour">
        <Link
          href={`/agence/${orgId}/parc`}
          className={`tuile ${erreurLots ? "" : lotsActifs.length > 0 && nbLoues === lotsActifs.length ? "ok" : "neutre"}`}
        >
          <span className="ico"><IconeTrait nom="cle" /></span>
          <span className="lib">Lots loués</span>
          <span className="val">
            {erreurLots ? "—" : `${nbLoues}`}
            {!erreurLots && lotsActifs.length > 0 && (
              <span className="text-[0.62em] font-medium text-[var(--texte-3)]"> / {lotsActifs.length}</span>
            )}
          </span>
          <span className="sous">
            {erreurLots
              ? "Lecture impossible"
              : lotsActifs.length === 0
                ? "Aucun lot suivi"
                : `${tauxOccupation} % d'occupation`}
          </span>
        </Link>

        <Link
          href={`/agence/${orgId}/loyers`}
          className={`tuile ${
            erreurAppels || erreurEncaissements
              ? ""
              : tauxQuittancement === null
                ? "neutre"
                : tauxQuittancement >= 100
                  ? "ok"
                  : "attention"
          }`}
        >
          <span className="ico"><IconeTrait nom="euro" /></span>
          <span className="lib">Loyers de {nomMois}</span>
          <span className="val montant whitespace-nowrap">
            {erreurEncaissements ? "—" : eur(totalEncaisse)}
          </span>
          <span className="sous">
            {erreurAppels || erreurEncaissements
              ? "Lecture impossible"
              : tauxQuittancement === null
                ? "Aucun appel émis ce mois"
                : `${tauxQuittancement} % des ${eur(totalAppele)} appelés`}
          </span>
        </Link>

        <Link
          href={`/agence/${orgId}/incidents${aQualifier > 0 ? "?vue=a-traiter" : ""}`}
          className={`tuile ${erreurIncidents ? "" : aQualifier > 0 ? "probleme" : dossiersIncidents.length > 0 ? "attention" : "ok"}`}
        >
          <span className="ico"><IconeTrait nom="outil" /></span>
          <span className="lib">Incidents en cours</span>
          <span className="val">{erreurIncidents ? "—" : dossiersIncidents.length}</span>
          <span className="sous">
            {erreurIncidents
              ? "Lecture impossible"
              : aQualifier > 0
                ? `${aQualifier} à qualifier — votre décision lance la suite`
                : dossiersIncidents.length > 0
                  ? "Tous qualifiés"
                  : "Aucun dossier ouvert"}
          </span>
        </Link>

        <Link
          href={`/agence/${orgId}/alertes`}
          className={`tuile ${planIllisible ? "" : enRetard.length > 0 ? "probleme" : nbActions > 0 ? "attention" : "ok"}`}
        >
          <span className="ico"><IconeTrait nom="eclair" /></span>
          <span className="lib">À faire</span>
          <span className="val">{planIllisible ? "—" : nbActions}</span>
          <span className="sous">
            {planIllisible
              ? "Lecture impossible"
              : enRetard.length > 0
                ? `${enRetard.length} en retard`
                : nbActions > 0
                  ? "Rien en retard"
                  : "Rien ne vous attend"}
          </span>
        </Link>
      </section>

      {/* 2. L'assistant : ce que Gerimmo a repéré, et le geste pour chaque
          chose. Il explique, il propose, il ne décide pas. */}
      <section className="assistant mt-6" aria-labelledby="assistant-titre">
        {/* UN TITRE DE CARTE, PLUS UNE PHRASE (24/09). La tête de l'assistant
            redisait, sur un second fond teinté, la phrase du bandeau
            (« 2 éléments nécessitent votre attention ») : deux bandeaux, la
            même information deux fois. La phrase reste au seul bandeau ; ici,
            le titre et le compte, comme toute carte de l'accueil. */}
        <div className="assistant-tete">
          <h2 id="assistant-titre" className="text-[length:var(--pas-sous-titre)]">
            À traiter aujourd&apos;hui
            {!planIllisible && !planVide && (
              <span className="font-normal text-[var(--texte-3)]"> · {elementsEnAttente}</span>
            )}
          </h2>
          <Link href={`/agence/${orgId}/alertes`} className="lien-discret">
            Tout voir&nbsp;→
          </Link>
        </div>

        {assistantProposeAutomatique && (
          <div className="assistant-suggestion">
            <p>
              <b>Gerimmo peut faire seul</b> : envoyer {envoisEteints.join(", ")}. Rien ne
              part sans votre accord — il se donne une fois, dans les réglages.
            </p>
            <Link
              href={`/agence/${orgId}/profil#relances`}
              className={buttonVariants({ variant: "outline", size: "sm", className: "pointer-coarse:min-h-10" })}
            >
              Activer
              <IndicateurLien />
            </Link>
          </div>
        )}

        {planIllisible ? (
          <div className="p-4">
            <LectureImpossible quoi="ce que vous avez à traiter" />
          </div>
        ) : planVide ? (
          <div className="p-4">
            <div className="vide-guide">
              <p className="titre">Aucune action signalée pour ce matin</p>
              <p className="explication">
                Aucun bail bloqué, aucune alerte confiée, aucun rapport à valider dans cette liste.
                {/* La phrase ne renvoie « ci-dessous » que s'il y a des lots à y trouver. */}
                {enPreparation.length > 0 && " Les lots en préparation restent à compléter ci-dessous."}{" "}
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
              </span>
            </div>
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
              ouvert={ouvrirPlan}
            />
            <GroupeActions
              titre="En retard"
              actions={enRetard}
              total={enRetard.length}
              ouvert={ouvrirPlan}
            />
            <GroupeActions
              titre="À venir"
              actions={aVenirVisibles}
              total={aVenir.length}
              ouvert={ouvrirPlan}
              reste={
                aVenir.length > aVenirVisibles.length ? (
                  <Link href={`/agence/${orgId}/alertes`} className="rang">
                    <span className="min-w-0 flex-1 text-sm">
                      {aVenir.length - aVenirVisibles.length} autre
                      {aVenir.length - aVenirVisibles.length > 1 ? "s" : ""} à venir
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
            {messagesNonLus !== null && messagesNonLus > 0 && (
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

      {finDeMiseEnPlace && (
        <div className="colonne-liste mt-6">
          <Link href={finDeMiseEnPlace.href} className="rang">
            <span className="min-w-0 flex-1 text-sm">
              <b>Finir la mise en place</b> : {finDeMiseEnPlace.quoi}
              {etapesRestantes.length > 1 &&
                ` (et ${etapesRestantes.length - 1} autre étape${etapesRestantes.length > 2 ? "s" : ""})`}
              .
            </span>
            <span className="lien-discret">
              {finDeMiseEnPlace.geste}&nbsp;→
              <IndicateurLien />
            </span>
          </Link>
        </div>
      )}

      {/* 3. Ce qui s'est passé, et ce qui se prépare. La carte des lots en
          préparation ne s'affiche que si elle a quelque chose à dire (24/09) :
          vide, elle occupait une colonne pour une phrase — le fil d'activité
          voisin, lui, disparaît déjà quand il est vide. */}
      <section
        className={`mt-6 grid gap-[var(--rythme-4)] ${carteLotsEnPreparation ? "lg:grid-cols-[1.6fr_1fr]" : ""}`}
      >
        <FilActivite
          supabase={supabase}
          orgId={orgId}
          portefeuille={portefeuille}
          agentId={user.id}
        />
        {carteLotsEnPreparation && (
        <Card>
          <CardContent>
            <div className="entete-carte">
              <h2 className="text-[length:var(--pas-sous-titre)]">Lots en préparation</h2>
              {enPreparation.length > 6 && (
                <Link href={`/agence/${orgId}/parc`} className="lien-discret">
                  Voir les {enPreparation.length}
                  <IndicateurLien />
                </Link>
              )}
            </div>
            {erreurLots ? (
              <LectureImpossible quoi="les lots en préparation" />
            ) : (
              <ul className="divide-y divide-border">
                {enPreparation.slice(0, 6).map((l) => {
                  const motif = blocages.get(l.id);
                  const cible = motif
                    ? cibleBlocage(motif, { orgId, bienId: l.bien_id, lotId: l.id })
                    : null;
                  return (
                    <li key={l.id}>
                      {/* TOUT LE RANG SE CLIQUE (24/09) : la pastille du lot
                          était hors du lien, et seul le texte du motif
                          menait à la fiche. */}
                      <Link
                        href={cible?.href ?? `/agence/${orgId}/parc/${l.bien_id}/lots/${l.id}`}
                        className="rang px-2 py-2.5"
                      >
                        <span className="puce puce-grise shrink-0">{l.nom}</span>
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {erreurBlocages
                            ? "Blocages illisibles — ouvrir la fiche du lot"
                            : motif
                              ? resumerBlocage(motif)
                              : "Prêt à publier"}
                        </span>
                        <IndicateurLien />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
        )}
      </section>

      {/* 4. Les statistiques, repliées : elles racontent, elles ne demandent
          rien. Répartition du parc et six mois d'écritures, comme avant. */}
      <details className="details-calme mt-6">
        <summary>
          <span className="chevron" aria-hidden>
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="whitespace-nowrap">Statistiques du mois</span>
          {/* Sur téléphone, le sous-titre forme sa propre ligne, sans le « · »
              orphelin qui l'ouvrait (24/09) ; en ligne, le séparateur revient. */}
          <span className="basis-full pl-[22px] text-[12.5px] font-normal text-[var(--texte-3)] sm:basis-auto sm:pl-0">
            <span className="hidden sm:inline">· </span>répartition du parc, encaissements et dépenses sur 6 mois
          </span>
        </summary>
        <div className="mt-3 grid gap-[var(--rythme-4)] md:grid-cols-2">
          <Card>
            <CardContent>
              <div className="entete-carte">
                <h2 className="text-[length:var(--pas-sous-titre)]">Répartition du parc</h2>
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
                <h2 className="text-[length:var(--pas-sous-titre)]">Encaissements et dépenses</h2>
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
        </div>
      </details>
    </main>
  );
}
