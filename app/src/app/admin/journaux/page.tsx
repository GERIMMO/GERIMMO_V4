import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { borneJourParis, formaterDateHeureParis, NOTE_FUSEAU } from "@/lib/heure-paris";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BoutonPurge } from "./bouton-purge";
import { codesConnusJournaux, detailsExpurges, libelleAccesDocument, libelleActionAudit, libelleEvenement } from "@/lib/libelles-journaux";
import { resumerBilan } from "@/lib/sante-service";
import { FiltresJournaux, PagesJournal } from "./filtres";

// Filtres et pagination (25/09) : quinze lignes par journal, sans filtre, ne
// permettaient pas de déboguer — une visite d'agence par la supervision suffit
// à faire disparaître les décisions du journal d'audit.
const PAR_PAGE = 50;
const PAGE_MAX = 1000;

type Filtres = { type: string; org: string; depuis: string; jusqu: string };
type Params = Partial<Filtres> & { p_audit?: string; p_technique?: string; p_acces?: string };

function pageDe(valeur: string | undefined): number {
  const n = Number(valeur);
  return Number.isInteger(n) && n >= 1 && n <= PAGE_MAX ? n : 1;
}

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

export default async function PageJournaux({ searchParams }: { searchParams: Promise<Params> }) {
  const supabase = await createClient();
  const { data: estSuperAdmin } = await supabase.rpc("is_super_admin");
  if (!estSuperAdmin) redirect("/espaces");

  const p = await searchParams;
  // Le type est un fragment de code (« tache_ », « traversee »…), borné et sans
  // caractère de motif ; l'organisation un identifiant ; les dates des jours de
  // Paris. Ce qui ne passe pas est ignoré, pas deviné.
  const filtres: Filtres = {
    type: String(p.type ?? "").trim().replace(/[%*,.()]/g, "").slice(0, 60),
    org: /^[0-9a-f-]{36}$/i.test(String(p.org ?? "")) ? String(p.org) : "",
    depuis: borneJourParis(String(p.depuis ?? "")) ? String(p.depuis) : "",
    jusqu: borneJourParis(String(p.jusqu ?? ""), true) ? String(p.jusqu) : "",
  };
  const pages = { audit: pageDe(p.p_audit), technique: pageDe(p.p_technique), acces: pageDe(p.p_acces) };
  const debutIso = filtres.depuis ? borneJourParis(filtres.depuis) : null;
  const finIso = filtres.jusqu ? borneJourParis(filtres.jusqu, true) : null;
  // PostgREST : `_` est un joker de `ilike`, on l'échappe.
  const motifType = filtres.type ? `%${filtres.type.replace(/_/g, "\\_")}%` : null;

  // Une page de 50 lignes lue avec une de plus : elle dit s'il y a une suite,
  // sans compter toute la table.
  // Le générateur de requêtes de Supabase est trop profond pour être typé au
  // travers d'un aide générique : la requête entre en `unknown`, les lignes
  // sortent dans le type annoncé par l'appelant.
  type Requete = {
    ilike: (c: string, v: string) => Requete;
    eq: (c: string, v: string) => Requete;
    gte: (c: string, v: string) => Requete;
    lte: (c: string, v: string) => Requete;
    range: (a: number, b: number) => PromiseLike<{ data: unknown; error: unknown }>;
  };
  const borner = <T,>(q: unknown, page: number, colonneType: string, avecOrg: boolean) => {
    let r = q as Requete;
    if (motifType) r = r.ilike(colonneType, motifType);
    if (avecOrg && filtres.org) r = r.eq("organization_id", filtres.org);
    if (debutIso) r = r.gte("created_at", debutIso);
    if (finIso) r = r.lte("created_at", finIso);
    return r.range((page - 1) * PAR_PAGE, page * PAR_PAGE) as PromiseLike<{ data: T[] | null; error: unknown }>;
  };
  type LigneAudit = { action: string; details: unknown; created_at: string; organisation: unknown; compte: unknown };
  type LigneTechnique = { evenement: string; details: unknown; created_at: string };
  type LigneAcces = { action: string; account_id: string | null; created_at: string; document: unknown; organisation: unknown };

  const [
    { data: regles, error: e1 },
    { data: auditBrut, error: e2 },
    { data: techniqueBrut, error: e3 },
    { data: accesBrut, error: e4 },
    { count: enAttente, error: e5 },
    { data: organisations },
  ] = await Promise.all([
    supabase.from("retention_rules").select("*").order("data_type"),
    borner<LigneAudit>(
      supabase
        .from("audit_log")
        .select("action, details, created_at, organisation:organizations(name), compte:accounts(email)")
        .order("created_at", { ascending: false }),
      pages.audit, "action", true
    ),
    borner<LigneTechnique>(
      supabase
        .from("tech_log")
        .select("evenement, details, created_at")
        .order("created_at", { ascending: false }),
      pages.technique, "evenement", false
    ),
    borner<LigneAcces>(
      supabase
        .from("acces_pieces_log")
        .select("action, account_id, created_at, document:documents(type, titre), organisation:organizations(name)")
        .order("created_at", { ascending: false }),
      pages.acces, "action", true
    ),
    supabase
      .from("purge_fichiers")
      .select("*", { count: "exact", head: true })
      .is("deleted_at", null),
    supabase.from("organizations").select("id, name").order("name").limit(500),
  ]);
  const audit = (auditBrut ?? []).slice(0, PAR_PAGE);
  const technique = (techniqueBrut ?? []).slice(0, PAR_PAGE);
  const acces = (accesBrut ?? []).slice(0, PAR_PAGE);
  const suite = {
    audit: (auditBrut ?? []).length > PAR_PAGE,
    technique: (techniqueBrut ?? []).length > PAR_PAGE,
    acces: (accesBrut ?? []).length > PAR_PAGE,
  };
  const filtreActif = Boolean(filtres.type || filtres.org || filtres.depuis || filtres.jusqu);
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
  const idsComptes = [...new Set(acces.map((l) => l.account_id).filter(Boolean))] as string[];
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

      <FiltresJournaux
        filtres={filtres}
        organisations={(organisations ?? []) as { id: string; name: string }[]}
        codes={codesConnusJournaux()}
      />

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
            {audit.length === 0 ? (
              <div className="vide">{filtreActif ? "Aucune action ne correspond à ces filtres." : "Aucune action sensible journalisée pour l'instant."}</div>
            ) : (
              <ul className="divide-y">
                {audit.map((l, i) => {
                  const organisation = nomDe(l.organisation, "name");
                  const auteur = nomDe(l.compte, "email");
                  const precision = detailsAudit(l.details);
                  return (
                    <li key={i} className="py-2 text-sm">
                      <span className="font-medium">{libelleActionAudit(l.action)}</span>
                      {organisation && <span className="text-muted-foreground"> · {organisation}</span>}
                      {auteur && <span className="text-muted-foreground [overflow-wrap:anywhere]"> · {auteur}</span>}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {formaterDateHeureParis(l.created_at)}
                      </span>
                      {precision && (
                        <span className="mt-0.5 block text-xs text-muted-foreground">{precision}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <PagesJournal cle="p_audit" page={pages.audit} suite={suite.audit} filtres={filtres} pages={pages} />
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
            {filtres.org && (
              <p className="mb-2 text-xs text-muted-foreground">
                L&apos;historique du service n&apos;est pas rattaché à une organisation : le filtre
                d&apos;organisation ne s&apos;y applique pas.
              </p>
            )}
            {technique.length === 0 && filtreActif ? (
              <div className="vide">Aucun événement ne correspond à ces filtres.</div>
            ) : technique.length === 0 ? (
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
                {technique.map((l, i) => {
                  const tache = l.evenement?.startsWith("tache_") ? l.evenement.slice("tache_".length) : null;
                  // Un événement hors tâche montre son détail expurgé (25/09) :
                  // compteurs, oui/non, codes courts — jamais un texte libre.
                  const detail = tache ? resumerBilan(l.details, tache) : detailsExpurges(l.details);
                  return (
                    <li key={i} className="py-2 text-sm">
                      <span className="font-medium">{libelleEvenement(l.evenement)}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {formaterDateHeureParis(l.created_at)}
                      </span>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {tache
                          ? detail === "—" ? "Aucun résultat détaillé enregistré pour ce passage." : detail
                          : detail ?? `Code interne : ${l.evenement}`}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
            <PagesJournal cle="p_technique" page={pages.technique} suite={suite.technique} filtres={filtres} pages={pages} />
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
            {acces.length === 0 ? (
              <div className="vide">{filtreActif ? "Aucune consultation ne correspond à ces filtres." : "Aucune consultation de pièce tracée pour l'instant."}</div>
            ) : (
              <ul className="divide-y">
                {acces.map((l, i) => {
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
                        {formaterDateHeureParis(l.created_at)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <PagesJournal cle="p_acces" page={pages.acces} suite={suite.acces} filtres={filtres} pages={pages} />
          </CardContent>
        </Card>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">{NOTE_FUSEAU}</p>
    </main>
  );
}
