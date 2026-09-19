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

import { timingSafeEqual } from "node:crypto";
import voisinsFichier from "@/data/departements-voisins.json";
import marcheFichier from "@/data/territoires-marche.json";
import { evaluerPorte } from "@/lib/porte-sante";
import { decider, noterCandidats, type Marche, type Voisinage } from "@/lib/score-territoire";
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
  const [orgs, biens, lots, baux, passes, erreurs, bugs] = await Promise.all([
    supabase.from("organizations").select("id, type, status, postal_code, created_at"),
    supabase.from("biens").select("id, organization_id, postal_code"),
    supabase.from("lots").select("id, bien_id, etat"),
    supabase.from("baux").select("id, lot_id, etat"),
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
  const marche = marcheFichier as Marche;
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
    marcheManquant: marche.sources.filter((s) => !s.recupere_le).map((s) => s.cle),
    // Ce que la ronde FERAIT si la porte est ouverte — rien encore : les gestes
    // d'ouverture sont les briques suivantes. Le dire évite qu'on croie à une
    // ouverture faite.
    agi: false,
  };

  await consignerTache(supabase, "territoire", bilan);
  return Response.json(bilan);
}
