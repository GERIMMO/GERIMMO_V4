import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formaterDateHeure } from "@/lib/ged";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BoutonPurge } from "./bouton-purge";
import { libelleAccesDocument, libelleActionAudit, libelleEvenement } from "@/lib/libelles-journaux";
import { resumerBilan } from "@/lib/sante-service";

export const metadata = { title: "Journaux et conservation — Gerimmo" };

const SORTS: Record<string, string> = {
  suppression: "Suppression",
  anonymisation: "Anonymisation",
  conservation: "Conservation justifiée",
};

type Regle = {
  id: string;
  data_type: string;
  libelle: string;
  finalite: string;
  declencheur: string;
  duree_mois: number;
  sort: string;
};

function duree(mois: number): string {
  if (mois === 0) return "Immédiate";
  if (mois % 12 === 0) return `${mois / 12} an${mois / 12 > 1 ? "s" : ""}`;
  return `${mois} mois`;
}

// Ce qu'une ligne d'audit peut dire en clair, sans identifiant interne
// (24/09) : le motif, le mois rouvert, la fin d'essai.
function detailsAudit(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const d = details as Record<string, unknown>;
  const morceaux: string[] = [];
  if (typeof d.mois === "string" && Number.isFinite(Date.parse(d.mois))) {
    morceaux.push(`mois de ${new Date(d.mois).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" })}`);
  }
  if (typeof d.essai_fin === "string" && Number.isFinite(Date.parse(d.essai_fin))) {
    morceaux.push(`essai jusqu'au ${new Date(d.essai_fin).toLocaleDateString("fr-FR", { timeZone: "UTC" })}`);
  }
  if (typeof d.motif === "string" && d.motif.trim()) morceaux.push(`motif : ${d.motif.trim()}`);
  return morceaux.length > 0 ? morceaux.join(" · ") : null;
}

const nomDe = (lien: unknown, champ: "name" | "email"): string | null => {
  const valeur = (lien as Record<string, unknown> | null)?.[champ];
  return typeof valeur === "string" && valeur ? valeur : null;
};

export default async function PageJournaux() {
  const supabase = await createClient();
  const { data: estSuperAdmin } = await supabase.rpc("is_super_admin");
  if (!estSuperAdmin) redirect("/espaces");

  // Qui a agi, et sur quelle organisation (24/09) : deux consultations
  // identiques ne se distinguaient pas, et `organization_id` était lu sans
  // être affiché.
  const [
    { data: regles, error: e1 },
    { data: audit, error: e2 },
    { data: technique, error: e3 },
    { data: acces, error: e4 },
    { count: enAttente, error: e5 },
  ] = await Promise.all([
    supabase.from("retention_rules").select("*").order("data_type"),
    supabase
      .from("audit_log")
      .select("action, details, created_at, organisation:organizations(name), compte:accounts(email)")
      .order("created_at", { ascending: false })
      .limit(15),
    supabase
      .from("tech_log")
      .select("evenement, details, created_at")
      .order("created_at", { ascending: false })
      .limit(15),
    supabase
      .from("acces_pieces_log")
      .select("action, account_id, created_at, document:documents(type, titre), organisation:organizations(name)")
      .order("created_at", { ascending: false })
      .limit(15),
    supabase
      .from("purge_fichiers")
      .select("*", { count: "exact", head: true })
      .is("deleted_at", null),
  ]);
  // Écran de conformité RGPD : un échec de lecture ne doit pas se déguiser en
  // journaux vides (audit 09/09)
  if (e1 || e2 || e3 || e4 || e5) {
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 p-4 sm:p-7">
        <h1>Journaux et conservation</h1>
        <div className="vide mt-4">
          Impossible de charger la page pour l&apos;instant — rechargez dans un
          instant.
        </div>
      </main>
    );
  }

  // L'auteur d'un accès aux pièces : la table ne porte pas de lien vers les
  // comptes, on lit leurs adresses à part. Une lecture en échec laisse la
  // ligne sans auteur plutôt que de bloquer la page.
  const idsComptes = [...new Set((acces ?? []).map((l) => l.account_id).filter(Boolean))] as string[];
  const { data: comptes } = idsComptes.length
    ? await supabase.from("accounts").select("id, email").in("id", idsComptes)
    : { data: [] as { id: string; email: string }[] };
  const courriels = new Map((comptes ?? []).map((c) => [c.id, c.email]));

  // Le regroupement du tableau devient visible (24/09) : l'ordre suivait la
  // clé interne (`document:…` puis le reste) et semblait alphabétique avant
  // de se rompre.
  const toutes = (regles ?? []) as Regle[];
  const parLibelle = (a: Regle, b: Regle) => a.libelle.localeCompare(b.libelle, "fr");
  const groupes: [string, Regle[]][] = [
    ["Documents", toutes.filter((r) => r.data_type.startsWith("document:")).sort(parLibelle)],
    ["Journaux et alertes", toutes.filter((r) => !r.data_type.startsWith("document:")).sort(parLibelle)],
  ].filter(([, liste]) => (liste as Regle[]).length > 0) as [string, Regle[]][];

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-4 sm:p-7">
      {/* Un seul en-tête, comme les autres pages de la console (24/09) : le
          fil d'Ariane répétait le bandeau et l'onglet allumé. */}
      <BoutonPurge fichiersEnAttente={enAttente ?? 0}>
        <h1>Journaux et conservation</h1>
      </BoutonPurge>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              Règles de conservation ({toutes.length})
            </CardTitle>
            <CardDescription>
              Chaque catégorie possède une durée justifiée et une action prévue
              à la fin. Gerimmo applique ces règles chaque nuit et lorsque vous
              lancez le nettoyage ci-dessus.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Sur téléphone, une règle par carte : sans largeur minimale, le
                tableau écrasait ses colonnes mot par mot (24/09). */}
            <div className="space-y-4 sm:hidden">
              {groupes.map(([groupe, liste]) => (
                <div key={groupe}>
                  <p className="libelle-champ mb-1">{groupe}</p>
                  <ul className="divide-y">
                    {liste.map((r) => (
                      <li key={r.id} className="py-2.5 text-sm">
                        <p className="font-medium">{r.libelle}</p>
                        <p className="mt-0.5 text-muted-foreground">{r.finalite}</p>
                        <p className="mt-1 text-[13px]">
                          {r.declencheur} · {duree(r.duree_mois)} · {SORTS[r.sort] ?? r.sort}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="libelle-champ py-2 pr-4 font-normal">Type de donnée</th>
                    <th className="libelle-champ py-2 pr-4 font-normal">Finalité</th>
                    <th className="libelle-champ py-2 pr-4 font-normal">Déclencheur</th>
                    <th className="libelle-champ py-2 pr-4 font-normal">Durée</th>
                    <th className="libelle-champ py-2 font-normal">Sort final</th>
                  </tr>
                </thead>
                {groupes.map(([groupe, liste]) => (
                  <tbody key={groupe}>
                    <tr className="border-b bg-[var(--filet-leger)]">
                      <th colSpan={5} scope="colgroup" className="py-1.5 pl-2 text-left text-[13px] font-semibold text-[var(--encre)]">
                        {groupe}
                      </th>
                    </tr>
                    {liste.map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium">{r.libelle}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{r.finalite}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{r.declencheur}</td>
                        <td className="py-2 pr-4">{duree(r.duree_mois)}</td>
                        <td className="py-2">{SORTS[r.sort] ?? r.sort}</td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Journal d&apos;audit</CardTitle>
            {/* La carte montre aussi les actions sensibles des agences
                (réouverture d'un mois, d'une détention…), pas seulement
                celles du super administrateur (24/09). */}
            <CardDescription>
              Actions sensibles journalisées (super administrateur et
              agences), conservées 3 ans.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(audit ?? []).length === 0 ? (
              <div className="vide">Aucune action sensible journalisée pour l&apos;instant.</div>
            ) : (
              <ul className="divide-y">
                {(audit ?? []).map((l, i) => {
                  const organisation = nomDe(l.organisation, "name");
                  const auteur = nomDe(l.compte, "email");
                  const precision = detailsAudit(l.details);
                  return (
                    <li key={i} className="py-2 text-sm">
                      <span className="font-medium">{libelleActionAudit(l.action)}</span>
                      {organisation && <span className="text-muted-foreground"> · {organisation}</span>}
                      {auteur && <span className="text-muted-foreground [overflow-wrap:anywhere]"> · {auteur}</span>}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {formaterDateHeure(l.created_at)}
                      </span>
                      {precision && (
                        <span className="mt-0.5 block text-xs text-muted-foreground">{precision}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card id="historique-service" className="scroll-mt-6">
          <CardHeader>
            <CardTitle className="text-base">Historique du service</CardTitle>
            <CardDescription>
              Résultats du travail automatique, connexions et difficultés
              rencontrées, conservés 6 mois. Les actions à reprendre restent
              visibles même lorsqu’une partie du travail a réussi.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Un historique vide n'est pas un bon signe (24/09) : le travail
                de nuit doit y laisser une trace. L'état vide dit où vérifier. */}
            {(technique ?? []).length === 0 ? (
              <div className="vide-guide">
                <p className="titre">Aucun événement sur six mois</p>
                <p className="explication">
                  Le travail de nuit devrait en laisser une trace : vérifiez que
                  les tâches automatiques tournent.
                </p>
                <div className="geste">
                  <Link href="/admin/sante" className="btn-secondaire">
                    Vérifier la santé du service
                  </Link>
                </div>
              </div>
            ) : (
              <ul className="divide-y">
                {(technique ?? []).map((l, i) => (
                  <li key={i} className="py-2 text-sm">
                    <span className="font-medium">{libelleEvenement(l.evenement)}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {formaterDateHeure(l.created_at)}
                    </span>
                    {l.evenement?.startsWith("tache_") && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {resumerBilan(l.details, l.evenement.slice("tache_".length)) === "—"
                          ? "Aucun résultat détaillé enregistré pour ce passage."
                          : resumerBilan(l.details, l.evenement.slice("tache_".length))}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              Journal d&apos;accès aux pièces
            </CardTitle>
            <CardDescription>
              Toute consultation ou téléchargement d&apos;un document est
              tracé, conservé 1 an.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(acces ?? []).length === 0 ? (
              <div className="vide">Aucune consultation de pièce tracée pour l&apos;instant.</div>
            ) : (
              <ul className="divide-y">
                {(acces ?? []).map((l, i) => {
                  const doc = l.document as unknown as {
                    type: string;
                    titre: string | null;
                  } | null;
                  const organisation = nomDe(l.organisation, "name");
                  const auteur = l.account_id ? courriels.get(l.account_id) : null;
                  return (
                    <li key={i} className="py-2 text-sm">
                      <span className="font-medium">{libelleAccesDocument(l.action)}</span>
                      <span className="text-muted-foreground">
                        {" "}· {doc?.titre ?? "(document supprimé à échéance)"}
                      </span>
                      {organisation && <span className="text-muted-foreground"> · {organisation}</span>}
                      {auteur && <span className="text-muted-foreground [overflow-wrap:anywhere]"> · {auteur}</span>}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {formaterDateHeure(l.created_at)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
