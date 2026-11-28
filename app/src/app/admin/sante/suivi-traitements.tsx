import Link from "next/link";
import { formaterDateHeureParis } from "@/lib/heure-paris";
import { chargerCycleMensuel, chargerEtatTaches, TACHES } from "@/lib/sante-service";
import type { createClient } from "@/lib/supabase/server";
import vercel from "../../../../vercel.json";

type Client = Awaited<ReturnType<typeof createClient>>;
type Traitement = {
  nom: string;
  passage: string | null;
  bilan: string;
  suspendu: boolean;
};

const SAUVEGARDE = "https://github.com/GERIMMO/GERIMMO_V4/actions/workflows/sauvegarde.yml";
const COURRIELS = new Set(["rappels", "quittances", "appels", "relances"]);

export function echeanceTraitement(nom: string, maintenant: Date): string | null {
  const cycle = nom === "cycle-mensuel";
  const plan = vercel.crons.find(c => c.path.endsWith(`?mission=${nom}`) || c.path === `/api/cron/${nom}`);
  // Sauvegarde GitHub (sauvegarde.yml) et cycle pg_cron (D07), tous deux en UTC.
  const horaire = cycle ? "0 5 1 * *" : nom === "sauvegarde" ? "20 1 * * *" : plan?.schedule;
  const [minute, heure] = horaire?.split(" ") ?? [];
  if (!minute || !heure || !/^\d+$/.test(minute) || !/^\d+$/.test(heure)) return null;
  const date = new Date(maintenant);
  if (cycle) date.setUTCDate(1);
  date.setUTCHours(Number(heure), Number(minute), 0, 0);
  if (date <= maintenant) {
    if (cycle) date.setUTCMonth(date.getUTCMonth() + 1);
    else date.setUTCDate(date.getUTCDate() + 1);
  }
  return date.toISOString();
}

export async function lireSuccesTraitements(db: Client) {
  return Object.fromEntries(await Promise.all([...TACHES.map(t => t.nom), "cycle-mensuel"].map(async nom => {
    try {
      if (!["orchestrateur", "sauvegarde", "cycle-mensuel"].includes(nom)) {
        const { data, error } = await db.from("agent_passages").select("fin")
          .eq("mission", nom).eq("etat", "reussi").not("fin", "is", null)
          .order("fin", { ascending: false }).limit(1).maybeSingle();
        return [nom, error ? undefined : data?.fin ?? null] as const;
      }
      const evenement = nom === "cycle-mensuel" ? "cycle_mensuel" : `tache_${nom}`;
      const journal = db.from("tech_log").select("created_at").eq("evenement", evenement).is("account_id", null);
      const succes = nom === "orchestrateur"
        ? journal.not("details->>dossiers", "is", null).is("details->>erreur", null).is("details->>preparation_erreur", null)
        : journal.eq("details->>echecs", "0");
      const { data, error } = await succes.order("created_at", { ascending: false }).limit(1).maybeSingle();
      return [nom, error ? undefined : data?.created_at ?? null] as const;
    } catch {
      return [nom, undefined] as const;
    }
  })));
}

function dateLue(le: string | null | undefined) {
  if (le === undefined) return "Lecture indisponible";
  return le ? <time dateTime={le}>{formaterDateHeureParis(le)}</time> : "Aucun résultat consigné";
}

export function ReperesTraitement({ traitement, succes, maintenant }: {
  traitement: Traitement | null; succes: string | null | undefined; maintenant: Date;
}) {
  if (!traitement) return <p role="alert">Les repères du traitement sont indisponibles.</p>;
  const { nom, passage, bilan, suspendu } = traitement;
  const echeance = echeanceTraitement(nom, maintenant);
  return <dl className="my-2 grid gap-2 text-sm sm:grid-cols-2">
    <div><dt className="font-semibold">Dernier passage</dt><dd>{passage ? <>{dateLue(passage)} · {bilan}</> : "Aucun passage enregistré"}</dd></div>
    <div><dt className="font-semibold">Dernier succès</dt><dd>{dateLue(succes)}</dd></div>
    <div><dt className="font-semibold">Preuve de livraison</dt><dd>{
      COURRIELS.has(nom) ? <Link className="lien-discret" href="/admin/sante#traitements-durables">Vérifier le suivi des courriels</Link> :
        nom === "sauvegarde" ? <a className="lien-discret" href={SAUVEGARDE}>Vérifier le dépôt dans GitHub</a> :
          nom === "abonnements" ? <Link className="lien-discret" href="/admin/sante#traitements-durables">Vérifier le suivi des factures</Link> :
            "Aucune preuve de livraison suivie ici"
    }</dd></div>
    <div><dt className="font-semibold">Échéance suivante</dt><dd>{
      suspendu ? "Traitement suspendu" : echeance ? <>{dateLue(echeance)} · selon le planning</> : "Horaire à vérifier"
    }</dd></div>
  </dl>;
}

export async function SuiviTraitements({ db }: { db: Client }) {
  const maintenant = new Date();
  const [taches, cycle, succes] = await Promise.all([
    chargerEtatTaches(db, maintenant), chargerCycleMensuel(db, maintenant), lireSuccesTraitements(db),
  ]);
  return <details className="loc-carte">
    <summary className="cursor-pointer font-semibold">Suivi des traitements</summary>
    {!taches && <p role="alert">Le dernier passage des tâches automatiques est indisponible.</p>}
    <ul className="divide-y">
      {TACHES.map(t => {
        const passage = taches?.find(p => p.nom === t.nom);
        return <li key={t.nom} className="py-3">
          <h3 className="font-semibold">{t.libelle}</h3>
          <ReperesTraitement traitement={passage && { ...passage, passage: passage.le, suspendu: passage.etat === "pause" } || null} succes={succes[t.nom]} maintenant={maintenant} />
          <Link className="lien-discret" href={`/admin/sante#${t.nom === "sauvegarde" ? "sauvegarde" : `tache-${t.nom}`}`}>Contrôler {t.libelle.toLowerCase()} dans Santé</Link>
        </li>;
      })}
      <li className="py-3">
        <h3 className="font-semibold">Cycle mensuel des loyers</h3>
        <ReperesTraitement traitement={cycle && { nom: "cycle-mensuel", passage: cycle.le, bilan: cycle.bilan, suspendu: cycle.arretEnCours }} succes={succes["cycle-mensuel"]} maintenant={maintenant} />
        <Link className="lien-discret" href="/admin/sante#tache-cycle-mensuel">Contrôler le cycle mensuel dans Santé</Link>
      </li>
    </ul>
  </details>;
}
