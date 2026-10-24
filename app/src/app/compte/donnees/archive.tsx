import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formaterDateHeureParis } from "@/lib/heure-paris";
import { ETATS_EXPORT, MESSAGE_IDENTITE_EXPORT } from "@/lib/export-complet";
import { baseEspace } from "@/lib/racine-espace";
import { seReconnecterPourArchive } from "@/app/actions/archive-identite";
import { MessageArchive } from "./message-archive";

// Relectures du 24/10 (R2-7, R2-8) : une demande déjà en préparation (double clic) est un état, pas une erreur ;
// l'identité à confirmer vient avec ses deux gestes ; le message est annoncé au chargement (MessageArchive).
const MESSAGES: Record<string, { texte: string; erreur?: true }> = {
  demandee: { texte: "Votre archive est en préparation. Revenez sur cette page dans quelques minutes pour la télécharger." },
  relancee: { texte: "La préparation interrompue reprend. Revenez sur cette page dans quelques minutes pour télécharger l’archive." },
  identite: { texte: MESSAGE_IDENTITE_EXPORT, erreur: true },
  en_cours: { texte: "Votre archive est déjà en préparation : revenez sur cette page dans quelques minutes pour la télécharger." },
  limite: { texte: "Trois archives au plus par jour et par espace : réessayez demain.", erreur: true },
  refusee: { texte: "L’archive complète est réservée au titulaire de l’espace.", erreur: true },
  introuvable: { texte: "Cette archive n’est pas disponible : demandez-en une nouvelle.", erreur: true },
  indisponible: { texte: "La demande n’a pas pu être enregistrée : réessayez dans un instant.", erreur: true },
};

/** Une préparation en plan depuis plus d'un quart d'heure : un nouveau clic la reprend. */
const QUART_D_HEURE = 15 * 60_000;
function enPlan(x: { statut: string; demande_le: string }): boolean {
  return (x.statut === "demande" || x.statut === "en_cours") && Date.now() - new Date(x.demande_le).getTime() > QUART_D_HEURE;
}

type Organisation = { name: string; type: string };
type Espace = { organization_id: string; organizations: Organisation | Organisation[] | null };
type Export = { id: string; organisation_id_export: string; statut: string; demande_le: string; pret_le: string | null; expire_le: string | null; erreur: string | null };

/** « Archive complète de mes espaces » (R49) : réservée au titulaire de chaque espace. */
export async function ArchiveComplete({ etat }: { etat?: string }) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const [espaces, exports] = await Promise.all([
    db.from("memberships").select("organization_id, organizations(name, type)").eq("account_id", user.id).eq("status", "active")
      .in("role", ["admin_agence", "proprietaire_direct"]),
    db.from("exports_complets").select("id, organisation_id_export, statut, demande_le, pret_le, expire_le, erreur")
      .eq("demande_par", user.id).order("demande_le", { ascending: false }).limit(10),
  ]);
  const liste = ((espaces.data ?? []) as Espace[]).filter((e) => e.organization_id);
  if (liste.length === 0 && !(exports.data ?? []).length) return null;
  const organisation = (e: Espace) => (Array.isArray(e.organizations) ? e.organizations[0] : e.organizations) ?? null;
  const nom = (e: Espace) => organisation(e)?.name ?? "Mon espace";
  const noms = new Map(liste.map((e) => [e.organization_id, nom(e)]));
  // L'adresse de l'espace selon son type (/espace pour un propriétaire direct, /agence sinon, décision D27).
  const bases = new Map(liste.map((e) => [e.organization_id, baseEspace(e.organization_id, organisation(e)?.type === "proprietaire_direct")]));
  const route = (org: string) => `${bases.get(org) ?? baseEspace(org, false)}/export-complet`;
  const message = etat ? MESSAGES[etat] : undefined;
  return <section id="archive" className="loc-carte space-y-4" aria-labelledby="titre-archive">
    <h2 id="titre-archive">Archive complète de mes espaces</h2>
    <p className="text-sm">Toutes les données de votre espace dans un seul fichier ZIP : un tableau (CSV) par catégorie de données, votre compte et vos acceptations des conditions, et tous vos fichiers, documents signés et certificats compris. Elle est réservée au titulaire de l’espace, qui confirme son identité (second facteur, ou connexion avec son mot de passe depuis moins de quinze minutes). Le lien de téléchargement vaut 24 heures ; l’archive est supprimée de nos serveurs sept jours après sa préparation.</p>
    {message && <MessageArchive erreur={Boolean(message.erreur)}>
      <p>{message.texte}</p>
      {etat === "identite" && <div className="flex flex-wrap gap-2">
        <form data-saisie-libre action={seReconnecterPourArchive}><button type="submit" className="btn-secondaire">Se reconnecter avec mon mot de passe</button></form>
        <Link className="btn-secondaire" href="/compte#second-facteur">Valider mon second facteur</Link>
      </div>}
    </MessageArchive>}
    {liste.length > 0 && <ul className="space-y-2">{liste.map((e) => <li key={e.organization_id} className="flex flex-wrap items-center justify-between gap-2">
      <span>{nom(e)}</span>
      <form data-saisie-libre method="post" action={route(e.organization_id)}><button type="submit" className="btn-secondaire">Préparer l’archive complète</button></form>
    </li>)}</ul>}
    {exports.error ? <p role="alert" className="err">Le suivi des archives est indisponible.</p>
      : (exports.data ?? []).length > 0 && <ul className="divide-y text-sm">{((exports.data ?? []) as Export[]).map((x) => <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
        <span>{noms.get(x.organisation_id_export) ?? "Espace"} · demandée le {formaterDateHeureParis(x.demande_le)} · {ETATS_EXPORT[x.statut] ?? x.statut}{x.statut === "pret" && x.expire_le ? ` jusqu’au ${formaterDateHeureParis(x.expire_le)}` : ""}{x.statut === "echec" && x.erreur ? ` : ${x.erreur}` : ""}{enPlan(x) ? " — toujours pas prête après un quart d’heure : cliquez de nouveau sur « Préparer l’archive complète », la préparation reprend." : ""}</span>
        {x.statut === "pret" && <a className="lien-texte" href={`${route(x.organisation_id_export)}?archive=${x.id}`}>Télécharger</a>}
      </li>)}</ul>}
  </section>;
}
