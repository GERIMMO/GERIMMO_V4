import { purgerDepotsTemporaires } from "@/lib/depot-direct-purge";
import { verifierAvantEffet } from "@/lib/controle-effets";
import { traiterSuitesComptes } from "@/lib/comptes-fermeture-serveur";
import { clientStripe, configurationStripe } from "@/lib/stripe";
// La suppression physique des fichiers purgés — chaque nuit, sans clic.
//
// POURQUOI (audit sécurité du 27/09). pg_cron applique chaque nuit les règles
// de conservation (`appliquer_retention`) : les fiches sont vidées et leurs
// chemins mis en file (`purge_fichiers`). Mais le SQL ne peut pas supprimer un
// objet du Storage : seul le bouton Super Admin « Lancer la purge » le faisait.
// Tant que personne ne cliquait, pièces d'identité, photos et baux purgés
// restaient dans le compartiment — et partaient dans chaque sauvegarde.
//
// Cette tâche vide la file par l'API Storage (client de service), ne marque
// « supprimé » que ce que l'API a réellement supprimé, et consigne son bilan
// sous `tache_purge` comme les autres tâches : la page Santé la suit. Un
// fichier resté en file plus de 48 h compte comme un échec (la file vieillit :
// quelque chose empêche la suppression).

import { clientDeService } from "@/lib/supabase/service";
import { consignerTache, porteurDuSecret } from "@/lib/tache";


/** Au-delà, un chemin en file est considéré comme bloqué. */
const FILE_BLOQUEE_HEURES = 48;
/** Une passe traite au plus ce nombre de chemins (l'API Storage accepte des lots). */
const LOT = 500;

export async function traiterPurge(request: Request) {
  if (!porteurDuSecret(request, process.env.CRON_SECRET)) {
    return Response.json({ erreur: "Non autorisé." }, { status: 401 });
  }
  const db = clientDeService();
  if (!db) return Response.json({ erreur: "Connexion du traitement indisponible." }, { status: 503 });

  const { data: enAttente, error } = await db
    .from("purge_fichiers")
    .select("id, storage_path, queued_at")
    .is("deleted_at", null)
    .order("queued_at", { ascending: true })
    .limit(LOT);
  if (error) {
    await consignerTache(db, "purge", { erreur: "lecture impossible" });
    return Response.json({ erreur: "File de suppression illisible." }, { status: 500 });
  }

  const lignes = (enAttente ?? []) as { id: string; storage_path: string; queued_at: string }[];
  let traites = 0;
  let echecs = 0;
  if (lignes.length > 0) {
    await verifierAvantEffet(db, "purge");
    const { data: supprimes, error: erreurSuppression } = await db.storage
      .from("documents")
      .remove(lignes.map((l) => l.storage_path));
    // L'API ne rend que les objets qu'elle a trouvés et supprimés. Un chemin
    // déjà absent du compartiment n'a plus rien à supprimer : il est soldé
    // aussi, sinon il resterait en file pour toujours.
    const trouves = new Set((supprimes ?? []).map((o) => o.name));
    const soldes = lignes.filter((l) => trouves.has(l.storage_path)).map((l) => l.id);
    if (!erreurSuppression) {
      // Vérifié un par un (et au plus 50 par passe) : seule une réponse sans
      // erreur et sans l'objet vaut « déjà absent ». Dans le doute, on garde.
      const restants = lignes.filter((l) => !trouves.has(l.storage_path)).slice(0, 50);
      for (const l of restants) {
        const coupe = l.storage_path.lastIndexOf("/");
        const dossier = coupe > 0 ? l.storage_path.slice(0, coupe) : "";
        const nom = l.storage_path.slice(coupe + 1);
        const { data: vus, error: erreurListe } = await db.storage
          .from("documents")
          .list(dossier, { search: nom, limit: 100 });
        if (!erreurListe && !(vus ?? []).some((o) => o.name === nom)) soldes.push(l.id);
      }
    }
    if (soldes.length > 0) {
      const { error: erreurMarque } = await db
        .from("purge_fichiers")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", soldes);
      if (!erreurMarque) traites = soldes.length;
    }
    echecs = lignes.length - traites;
  }

  // La file vieillit-elle ? Un chemin ancien encore en attente est un échec.
  const limite = new Date(Date.now() - FILE_BLOQUEE_HEURES * 3_600_000).toISOString();
  const { count: bloques } = await db
    .from("purge_fichiers")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .lt("queued_at", limite);

  // `echecs` compte aussi les chemins bloqués : Santé et Équipes lisent ce
  // compteur pour passer la tâche au rouge.
  const transit = await purgerDepotsTemporaires(db);
  // 24/10 (plan de conformité, lot 1E) : les suites des fermetures exécutées par pg_cron à 3 h 20 (fichiers hors du
  // compartiment `documents`, remboursement au prorata, courriel de fin), les avertissements d'inactivité et le ménage
  // des archives d'export. Après la suppression des fichiers mis en file par ces fermetures.
  const reglages = configurationStripe();
  // Finitions du 24/10 (relecture transverse, M1) : les gestes chez Stripe (remboursements, suppression des clients)
  // s'arrêtent aussi avec l'arrêt « Abonnements », comme toute écriture de facturation.
  const comptes = await traiterSuitesComptes(db, {
    stripe: reglages.pret ? clientStripe(reglages.config) : null,
    avantEffet: () => verifierAvantEffet(db, "purge"),
    avantEffetStripe: () => verifierAvantEffet(db, "abonnements"),
  });
  const bilan = { ...transit, ...comptes, traites, echecs: echecs + (bloques ?? 0) + transit.echecs_transferts + (transit.transferts_bloques ?? 0) + comptes.echecs, bloques: bloques ?? 0, en_attente: lignes.length - traites };
  await consignerTache(db, "purge", bilan);
  return Response.json(bilan);
}
