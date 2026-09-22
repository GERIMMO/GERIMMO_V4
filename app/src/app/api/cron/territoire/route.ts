// Tâche mensuelle : la ronde du territoire — mesurer, noter, décider, consigner.
//
// C'est la boucle de l'expansion territoriale (wiki, 19/09), dans son premier
// état : elle CALCULE et CONSIGNE, elle n'agit pas encore. Le 1er de chaque
// mois, elle relève l'empreinte (où l'on est), le score des candidats (où
// aller), la décision (le prochain département, et s'il faut changer de
// région) et la porte de santé (peut-on ouvrir sans exporter des problèmes),
// puis écrit le tout, daté, dans `tech_log` sous `tache_territoire`. La page
// /admin/territoire montre l'instant ; cette passe fait l'historique — et
// c'est ici que les gestes d'ouverture (pages locales, campagne, parrainage)
// viendront se brancher, derrière la porte.
//
// Mêmes verrous que les autres tâches : CRON_SECRET à temps constant, clé de
// service qui ne sort pas d'ici, lecture seule sur ce que la ronde a besoin de
// lire. Rien n'est envoyé à personne.

import { actualiserMarchePublic } from "@/lib/sources-territoire";
import { timingSafeEqual } from "node:crypto";
import voisinsFichier from "@/data/departements-voisins.json";
import marcheFichier from "@/data/territoires-marche.json";
import { evaluerPorte } from "@/lib/porte-sante";
import { decider, noterCandidats, prioriteTerritoriale, type Marche, type Voisinage } from "@/lib/score-territoire";
import { clientDeService } from "@/lib/supabase/service";
import { consignerTache, dernieresTaches, type PasseConsignee } from "@/lib/tache";
import {
  empreinteParDepartement,
  empreinteParRegion,
  type LigneBail,
  type LigneBien,
  type LigneLot,
  type LigneOrganisation,
} from "@/lib/territoire";

import { artisansVerifiesParDepartement, fusionnerMarche, lireTerritoire, moisPrecedent, publiciteParDepartement, type ArtisanTerritorial, type LigneMarche, type MesurePublicitaire } from "@/lib/mesures-territoire";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Comparaison à temps constant, sans fuir la longueur du secret. */
function memeSecret(fourni: string, attendu: string): boolean {
  const a = Buffer.from(fourni);
  const b = Buffer.from(attendu);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Les signalements encore ouverts : ceux que le tri n'a pas clos.
const ETATS_OUVERTS = ["nouveau", "en_examen", "en_cours"];
// N1 est la gravité la plus haute du module 20 (bloquant / majeur / mineur).
const GRAVITE_BLOQUANTE = "N1";

export async function GET(request: Request) {
  const attendu = process.env.CRON_SECRET;
  if (!attendu) {
    return Response.json(
      { erreur: "CRON_SECRET absente : la ronde du territoire est désactivée." },
      { status: 503 }
    );
  }
  const entete = request.headers.get("authorization") ?? "";
  if (!memeSecret(entete, `Bearer ${attendu}`)) {
    return Response.json({ erreur: "Non autorisé." }, { status: 401 });
  }
  const supabase = clientDeService();
  if (!supabase) {
    return Response.json(
      { erreur: "SUPABASE_SERVICE_ROLE_KEY absente : la ronde ne peut pas lire." },
      { status: 503 }
    );
  }

  const depuis24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [orgs, biens, lots, baux, passes, erreurs, bugs, zones, artisans, mesures, marcheBase] = await Promise.all([
    lireTerritoire(supabase, "organizations", "id, type, status, postal_code, created_at"),
    lireTerritoire(supabase, "biens", "id, organization_id, postal_code"),
    lireTerritoire(supabase, "lots", "id, bien_id, etat"),
    lireTerritoire(supabase, "baux", "id, lot_id, etat"),
    supabase
      .from("tech_log")
      .select("evenement, details, created_at")
      .like("evenement", "tache_%")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("tech_log")
      .select("id", { count: "exact", head: true })
      .eq("evenement", "erreur_ecran")
      .gte("created_at", depuis24h),
    supabase
      .from("retours_utilisateurs")
      .select("id", { count: "exact", head: true })
      .eq("nature", "bug")
      .eq("gravite", GRAVITE_BLOQUANTE)
      .in("etat", ETATS_OUVERTS),
    lireTerritoire(supabase, "artisan_zones", "artisan_id, code_postal", ["artisan_id", "code_postal"]),
    lireTerritoire(supabase, "artisans", "id,statut_plateforme,siret_etat,blacklist_globale_le,visibilite"),
    lireTerritoire(supabase, "marketing_mesures", "id,campagne_id,meta_ad_id,clics,depense_cents,prospects,details,mesure_le"),
    supabase.from("territory_market_data").select("departement,logements_locatifs,agences_locales,tension_marche,concurrence,artisans_disponibles,cout_publicitaire_cents,clics_publicitaires,prospects,clients_gagnes,cout_acquisition_cents,cout_prospect_cents,periode_publicite_debut,periode_publicite_fin,observations,mesure_le"),
  ]);

  // Sans l'empreinte, la ronde n'a rien à dire : elle le consigne et s'arrête.
  const lecturesEnEchec = [
    ["organisations", orgs.error],
    ["biens", biens.error],
    ["lots", lots.error],
    ["baux", baux.error],
  ]
    .filter(([, e]) => e)
    .map(([nom]) => nom as string);
  if (lecturesEnEchec.length > 0) {
    await consignerTache(supabase, "territoire", { erreur: "lecture impossible", lectures: lecturesEnEchec });
    return Response.json({ erreur: "Lecture impossible.", lectures: lecturesEnEchec }, { status: 500 });
  }

  const empreinte = empreinteParDepartement({
    organisations: (orgs.data ?? []) as LigneOrganisation[],
    biens: (biens.data ?? []) as LigneBien[],
    lots: (lots.data ?? []) as LigneLot[],
    baux: (baux.data ?? []) as LigneBail[],
  });
  const regions = empreinteParRegion(empreinte.lignes);
  // Une panne ne transforme ni les artisans ni les résultats commerciaux en zéros.
  if (marcheBase.error) {
    await consignerTache(supabase, "territoire", { erreur: "données territoriales indisponibles", agi: false });
    return Response.json({ erreur: "Les données territoriales ne sont pas disponibles." }, { status: 503 });
  }
  const anciennes = new Map(((marcheBase.data ?? []) as LigneMarche[]).map(l => [l.departement, l]));
  const reseau = zones.error || artisans.error ? null : artisansVerifiesParDepartement((artisans.data ?? []) as ArtisanTerritorial[], (zones.data ?? []) as { artisan_id: string; code_postal: string }[]);
  const periode = moisPrecedent();
  const publicite = mesures.error ? null : publiciteParDepartement((mesures.data ?? []) as MesurePublicitaire[], periode.debut, periode.fin);
  const maintenant = new Date().toISOString();
  const actualisation = await actualiserMarchePublic(fusionnerMarche(marcheFichier as Marche, [...anciennes.values()]));
  const donneesMarche = Object.entries(actualisation.marche.departements).map(([code, m]) => {
    const ancienne = anciennes.get(code);
    const ligne = { logements_locatifs: null, agences_locales: null, tension_marche: null, concurrence: null,
      artisans_disponibles: null, cout_publicitaire_cents: null, clics_publicitaires: null, prospects: null, clients_gagnes: null,
      cout_acquisition_cents: null, cout_prospect_cents: null, periode_publicite_debut: null, periode_publicite_fin: null,
      ...ancienne, departement: code, observations: { ...(ancienne?.observations ?? {}) }, mesure_le: maintenant } as LigneMarche;
    for (const [cle, colonne] of [["logements_loues_prive", "logements_locatifs"], ["agences", "agences_locales"], ["communes_zone_tendue", "tension_marche"]] as const) {
      const observation = m.observations?.[cle];
      if (m[cle] != null && observation && (!ligne.observations[cle] || Date.parse(observation.recupere_le) > Date.parse(ligne.observations[cle].recupere_le))) {
        ligne[colonne] = m[cle]; ligne.observations[cle] = observation;
      }
    }
    if (reseau) {
      ligne.artisans_disponibles = reseau.get(code) ?? 0;
      ligne.observations.artisans_disponibles = { source: "Artisans Gerimmo vérifiés et publics", observe_le: maintenant.slice(0,10), recupere_le: maintenant, definition: "Artisans validés, SIRET vérifié, sans exclusion globale, avec une zone déclarée dans ce département. La disponibilité et les assurances restent à vérifier pour chaque mission." };
    }
    if (publicite) {
      const pub = publicite.departements.get(code);
      ligne.cout_publicitaire_cents = pub?.depense ?? null; ligne.clics_publicitaires = pub?.clics ?? null;
      ligne.prospects = pub?.prospects ?? null; ligne.clients_gagnes = pub?.clients ?? null;
      ligne.cout_acquisition_cents = pub?.coutClient ?? null; ligne.cout_prospect_cents = pub?.coutProspect ?? null;
      ligne.periode_publicite_debut = periode.debut; ligne.periode_publicite_fin = periode.fin;
      delete ligne.observations.cout_acquisition_cents;
      if (pub) ligne.observations.cout_acquisition_cents = { source: "Résultats de campagnes avec attribution vérifiée", observe_le: periode.fin, recupere_le: pub.mesureLe, definition: "Dépense divisée par les clients réellement attribués à la campagne sur la même période et le même département." };
    }
    return ligne;
  });
  const sauvegarde = await supabase.from("territory_market_data").upsert(donneesMarche, { onConflict: "departement" });
  if (sauvegarde.error) {
    await consignerTache(supabase, "territoire", { erreur: "enregistrement territorial impossible", agi: false });
    return Response.json({ erreur: "Les résultats territoriaux n’ont pas pu être enregistrés." }, { status: 500 });
  }
  const marche = fusionnerMarche(actualisation.marche, donneesMarche);
  const candidats = noterCandidats({
    empreinte: empreinte.lignes,
    marche,
    voisinage: voisinsFichier.voisins as Voisinage,
  });
  const decision = decider(empreinte.lignes, candidats);
  const porte = evaluerPorte({
    passes: dernieresTaches((passes.data ?? []) as PasseConsignee[]),
    erreursEcran24h: erreurs.error ? null : (erreurs.count ?? 0),
    bugsBloquantsOuverts: bugs.error ? null : (bugs.count ?? 0),
  });

  const bilan = {
    porte,
    decision: {
      regionCourante: decision.regionCourante,
      prochain: decision.prochain
        ? { code: decision.prochain.code, nom: decision.prochain.nom, region: decision.prochain.region, score: decision.prochain.score, manquants: decision.prochain.manquants }
        : null,
      changementDeRegion: decision.changementDeRegion,
      raison: decision.raison,
    },
    candidats: candidats.slice(0, 5).map((c) => ({ code: c.code, score: c.score, manquants: c.manquants })),
    empreinte: {
      departements: empreinte.lignes.length,
      regions: regions.length,
      organisations: empreinte.lignes.reduce((n, l) => n + l.agences + l.proprietairesDirects, 0),
      bauxEnCours: empreinte.lignes.reduce((n, l) => n + l.bauxEnCours, 0),
      nonPlaces: empreinte.sansCodePostal.organisations + empreinte.sansCodePostal.biens + empreinte.horsReferentiel,
    },
    priorite: decision.prochain ? prioriteTerritoriale(marche.departements[decision.prochain.code]) : null,
    donnees: { sourcesPubliques: actualisation.bilan, lecturesIndisponibles: [zones.error && "zones artisanales", artisans.error && "artisans", mesures.error && "résultats publicitaires"].filter(Boolean), mesuresPublicitairesIgnorees: publicite?.ignorees ?? null, periode },
    autorisationDepense: false,
    marcheManquant: marche.sources.filter((s) => !s.recupere_le).map((s) => s.cle),
    // Ce que la ronde FERAIT si la porte est ouverte — rien encore : les gestes
    // d'ouverture sont les briques suivantes. Le dire évite qu'on croie à une
    // ouverture faite.
    agi: false,
  };

  await consignerTache(supabase, "territoire", bilan);
  return Response.json(bilan);
}
