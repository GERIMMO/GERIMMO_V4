import { createClient } from "@/lib/supabase/server";
import { formaterDateHeureParis } from "@/lib/heure-paris";
import { ETATS_EXPORT, MESSAGE_IDENTITE_EXPORT } from "@/lib/export-complet";

const MESSAGES: Record<string, { texte: string; erreur?: true }> = {
  demandee: { texte: "Votre archive est en préparation. Revenez sur cette page dans quelques minutes pour la télécharger." },
  identite: { texte: MESSAGE_IDENTITE_EXPORT, erreur: true },
  en_cours: { texte: "Une archive de cet espace est déjà en préparation : patientez quelques minutes.", erreur: true },
  limite: { texte: "Trois archives au plus par jour et par espace : réessayez demain.", erreur: true },
  refusee: { texte: "L’archive complète est réservée au titulaire de l’espace.", erreur: true },
  introuvable: { texte: "Cette archive n’est pas disponible : demandez-en une nouvelle.", erreur: true },
  indisponible: { texte: "La demande n’a pas pu être enregistrée : réessayez dans un instant.", erreur: true },
};

type Espace = { organization_id: string; organizations: { name: string } | { name: string }[] | null };
type Export = { id: string; organisation_id_export: string; statut: string; demande_le: string; pret_le: string | null; expire_le: string | null; erreur: string | null };

/** « Archive complète de mes espaces » (R49) : réservée au titulaire de chaque espace. */
export async function ArchiveComplete({ etat }: { etat?: string }) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const [espaces, exports] = await Promise.all([
    db.from("memberships").select("organization_id, organizations(name)").eq("account_id", user.id).eq("status", "active")
      .in("role", ["admin_agence", "proprietaire_direct"]),
    db.from("exports_complets").select("id, organisation_id_export, statut, demande_le, pret_le, expire_le, erreur")
      .eq("demande_par", user.id).order("demande_le", { ascending: false }).limit(10),
  ]);
  const liste = ((espaces.data ?? []) as Espace[]).filter((e) => e.organization_id);
  if (liste.length === 0 && !(exports.data ?? []).length) return null;
  const nom = (e: Espace) => (Array.isArray(e.organizations) ? e.organizations[0]?.name : e.organizations?.name) ?? "Mon espace";
  const noms = new Map(liste.map((e) => [e.organization_id, nom(e)]));
  const message = etat ? MESSAGES[etat] : undefined;
  return <section id="archive" className="loc-carte space-y-4" aria-labelledby="titre-archive">
    <h2 id="titre-archive">Archive complète de mes espaces</h2>
    <p className="text-sm">Toutes les données de votre espace dans un seul fichier ZIP : un tableau (CSV) par catégorie de données, votre compte et vos acceptations des conditions, et tous vos fichiers, documents signés et certificats compris. Elle est réservée au titulaire de l’espace, qui confirme son identité (second facteur, ou connexion avec son mot de passe depuis moins de quinze minutes). Le lien de téléchargement vaut 24 heures ; l’archive est supprimée de nos serveurs sept jours après sa préparation.</p>
    {message && <p role={message.erreur ? "alert" : "status"} className={message.erreur ? "err" : "rounded-xl bg-success-soft p-3 text-sm"}>{message.texte}</p>}
    {liste.length > 0 && <ul className="space-y-2">{liste.map((e) => <li key={e.organization_id} className="flex flex-wrap items-center justify-between gap-2">
      <span>{nom(e)}</span>
      <form method="post" action={`/agence/${e.organization_id}/export-complet`}><button type="submit" className="btn-secondaire">Préparer l’archive complète</button></form>
    </li>)}</ul>}
    {exports.error ? <p role="alert" className="err">Le suivi des archives est indisponible.</p>
      : (exports.data ?? []).length > 0 && <ul className="divide-y text-sm">{((exports.data ?? []) as Export[]).map((x) => <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
        <span>{noms.get(x.organisation_id_export) ?? "Espace"} · demandée le {formaterDateHeureParis(x.demande_le)} · {ETATS_EXPORT[x.statut] ?? x.statut}{x.statut === "pret" && x.expire_le ? ` jusqu’au ${formaterDateHeureParis(x.expire_le)}` : ""}{x.statut === "echec" && x.erreur ? ` : ${x.erreur}` : ""}</span>
        {x.statut === "pret" && <a className="lien-texte" href={`/agence/${x.organisation_id_export}/export-complet?archive=${x.id}`}>Télécharger</a>}
      </li>)}</ul>}
  </section>;
}
