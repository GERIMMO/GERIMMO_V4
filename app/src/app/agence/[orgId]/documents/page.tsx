import Link from "next/link";
import { verifierAccesEspace } from "@/lib/espace";
import {
  TYPES_DOCUMENT,
  dureeConservation,
  estARenouveler,
  formaterDate,
  limiteRenouvellement,
  motifLitteral,
} from "@/lib/ged";
import { formaterTaille } from "@/lib/file-type";
import { nomComplet } from "@/lib/roles-personnes";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { IndicateurLien } from "@/components/ui/indicateur-lien";
import { FormulaireDepot } from "./formulaire-depot";
import { PaneDocument } from "./pane-document";

export const metadata = { title: "Documents — Gerimmo" };

type LienRang = { entite: string; entite_id: string };

type DocRang = {
  id: string;
  type: string;
  titre: string | null;
  mime_type: string | null;
  taille_octets: number | null;
  expire_le: string | null;
  purged_at: string | null;
  created_at: string;
  liens: LienRang[];
};

type ARenouveler = { id: string; titre: string | null; expire_le: string };

// Couleurs de la barre « Par type » (maquette apercuDocs) — tokens charte
const COULEURS_TYPES = [
  "var(--encre)",
  "var(--bleu)",
  "var(--or)",
  "var(--success)",
  "var(--destructive)",
  "var(--texte-secondaire)",
];

export default async function PageDocuments(
  props: PageProps<"/agence/[orgId]/documents">
) {
  const { orgId } = await props.params;
  // searchParams bornés : une valeur répétée (?type=a&type=b) arrive en
  // tableau — seule une chaîne simple est acceptée (même garde qu'incidents)
  const brut = (await props.searchParams) as Record<string, string | string[] | undefined>;
  const uneValeur = (v: string | string[] | undefined) =>
    typeof v === "string" && v ? v : undefined;
  const recherche = {
    type: uneValeur(brut.type),
    q: uneValeur(brut.q),
    du: uneValeur(brut.du),
    au: uneValeur(brut.au),
  };
  const sel = uneValeur(brut.sel) ?? null;
  const { supabase, organisation } = await verifierAccesEspace(orgId);

  const filtresActifs = Boolean(recherche.type || recherche.q || recherche.du || recherche.au);
  // Navigation par filtres, jamais par dossiers (RM-12.5.1). La fonction
  // documents_courants (security invoker : la RLS s'applique) écarte les
  // versions remplacées EN SQL — pas de fenêtre applicative faussée.
  let requete = supabase
    .rpc("documents_courants", { p_org: orgId })
    .select(
      "id, type, titre, mime_type, taille_octets, expire_le, purged_at, created_at, liens:document_liens(entite, entite_id)"
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (recherche.type) requete = requete.eq("type", recherche.type);
  if (recherche.q) requete = requete.ilike("titre", `%${motifLitteral(recherche.q)}%`);
  if (recherche.du) requete = requete.gte("created_at", recherche.du);
  if (recherche.au) requete = requete.lte("created_at", `${recherche.au}T23:59:59`);

  const [
    { data: documents },
    { data: statsTypes },
    { data: aRenouvelerBrut },
    { count: totalCourants },
    { data: personnes },
    { data: regles },
  ] = await Promise.all([
    requete,
    // La vue d'ensemble se calcule sur TOUTES les pièces courantes, agrégées
    // EN SQL — jamais sur une fenêtre plafonnée (revue 26/08, passes 1 et 2)
    supabase.rpc("documents_stats_par_type", { p_org: orgId }),
    supabase.rpc("documents_a_renouveler", {
      p_org: orgId,
      p_limite: limiteRenouvellement(),
    }),
    supabase.rpc("documents_courants", { p_org: orgId }, { count: "exact", head: true }),
    supabase
      .from("persons")
      .select("id, nom, prenom")
      .eq("organization_id", orgId)
      .is("archived_at", null)
      .order("nom"),
    supabase
      .from("retention_rules")
      .select("data_type, duree_mois")
      .like("data_type", "document:%"),
  ]);

  // Le typage de .rpc().select() hésite entre ligne et tableau : la fonction
  // renvoie toujours un setof, on fixe le tableau
  const docs = ((documents ?? []) as unknown as DocRang[]);
  const nomsPersonnes = new Map((personnes ?? []).map((p) => [p.id, nomComplet(p)]));
  const dureesParType = new Map(
    (regles ?? []).map((r) => [r.data_type.replace("document:", ""), r.duree_mois])
  );

  const aRenouveler = (aRenouvelerBrut ?? []) as ARenouveler[];
  const entreesTypes = ((statsTypes ?? []) as { type: string; total: number }[]).map(
    (s) => [s.type, Number(s.total)] as [string, number]
  );
  const totalVivants = entreesTypes.reduce((somme, [, n]) => somme + n, 0);

  // Les liens préservent filtres et sélection (même motif que les incidents) ;
  // typeCible permet aux types cliquables de garder les autres filtres
  const lien = (
    selCible: string | null,
    typeCible: string | undefined = recherche.type
  ) => {
    const params = new URLSearchParams();
    if (typeCible) params.set("type", typeCible);
    if (recherche.q) params.set("q", recherche.q);
    if (recherche.du) params.set("du", recherche.du);
    if (recherche.au) params.set("au", recherche.au);
    if (selCible) params.set("sel", selCible);
    const q = params.toString();
    return `/agence/${orgId}/documents${q ? `?${q}` : ""}`;
  };

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-7">
      <div className="entete-page mb-6">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href={`/agence/${orgId}`} className="hover:underline">
              {organisation.name}
            </Link>{" "}
            / Documents
          </p>
          <h1>Documents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pas de dossiers : une pièce est rattachée à plusieurs fiches et
            apparaît sur chacune.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="mono-discret">
            {totalCourants ?? docs.length} pièce{(totalCourants ?? docs.length) > 1 ? "s" : ""}
          </span>
          <Link href={lien("depot")} className="btn-or">
            + Déposer une pièce
          </Link>
        </div>
      </div>

      {/* Filtres — la recherche traite % et _ comme des caractères normaux */}
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="type" className="libelle-champ mb-1 block">
            Type
          </label>
          <select
            id="type"
            name="type"
            defaultValue={recherche.type ?? ""}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="">Tous</option>
            {Object.entries(TYPES_DOCUMENT).map(([valeur, libelle]) => (
              <option key={valeur} value={valeur}>
                {libelle}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="du" className="libelle-champ mb-1 block">
            Du
          </label>
          <input
            id="du"
            name="du"
            type="date"
            defaultValue={recherche.du ?? ""}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="au" className="libelle-champ mb-1 block">
            Au
          </label>
          <input
            id="au"
            name="au"
            type="date"
            defaultValue={recherche.au ?? ""}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          />
        </div>
        <div className="min-w-40 flex-1">
          <label htmlFor="q" className="libelle-champ mb-1 block">
            Recherche
          </label>
          <input
            id="q"
            name="q"
            type="search"
            placeholder="Titre…"
            defaultValue={recherche.q ?? ""}
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          />
        </div>
        {sel && <input type="hidden" name="sel" value={sel} />}
        <button
          type="submit"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Filtrer
        </button>
      </form>

      {/* Vue scindée maquette : les pièces à gauche, la fiche ou la vue
          d'ensemble à droite (?sel=…) */}
      <div className="split">
        <div className="colonne-liste-split">
          <div className="tete-liste">
            <span className="mono-discret">TOUTES LES PIÈCES</span>
            {sel && (
              <Link
                href={lien(null)}
                className="inline-flex items-center gap-1.5 text-xs text-[var(--bleu)] hover:underline"
              >
                Vue d&apos;ensemble
                <IndicateurLien />
              </Link>
            )}
          </div>
          {docs.length === 0 ? (
            <div className="vide space-y-2">
              {filtresActifs ? (
                <>
                  <p className="font-medium">Aucun document ne correspond</p>
                  <p>Élargissez la recherche ou repartez de la liste complète.</p>
                  <Link
                    href={`/agence/${orgId}/documents`}
                    className={`inline-flex items-center gap-1.5 ${buttonVariants({ variant: "outline", size: "sm" })}`}
                  >
                    Effacer les filtres
                    <IndicateurLien />
                  </Link>
                </>
              ) : (
                <>
                  <p className="font-medium">Aucun document pour l&apos;instant</p>
                  <p>
                    Baux, diagnostics et justificatifs déposés ailleurs dans
                    l&apos;application se retrouvent ici. Vous pouvez aussi en
                    déposer un directement.
                  </p>
                </>
              )}
            </div>
          ) : (
            docs.map((d) => {
              const actif = d.id === sel;
              if (d.purged_at) {
                // La fiche de traçabilité RGPD reste consultable (revue 26/08)
                return (
                  <Link
                    key={d.id}
                    href={lien(d.id)}
                    className="rang"
                    aria-current={actif ? "true" : undefined}
                    style={
                      actif
                        ? { background: "var(--ardoise)", borderLeftColor: "var(--encre)" }
                        : undefined
                    }
                  >
                    <small className="min-w-0 flex-1 italic">
                      Document purgé le {formaterDate(d.purged_at)} —{" "}
                      {TYPES_DOCUMENT[d.type] ?? d.type} (règle de conservation)
                    </small>
                    <IndicateurLien className="shrink-0" />
                  </Link>
                );
              }
              const rattachements = (d.liens ?? [])
                .filter((l) => l.entite === "personne")
                .map((l) => nomsPersonnes.get(l.entite_id) ?? "Personne")
                .join(", ");
              const renouveler = estARenouveler(d.expire_le);
              return (
                <Link
                  key={d.id}
                  href={lien(d.id)}
                  className="rang"
                  aria-current={actif ? "true" : undefined}
                  style={
                    actif
                      ? { background: "var(--ardoise)", borderLeftColor: "var(--encre)" }
                      : undefined
                  }
                >
                  <span className="min-w-0 flex-1">
                    <b className="block truncate">{d.titre ?? "Sans titre"}</b>
                    <small className="block truncate">
                      {TYPES_DOCUMENT[d.type] ?? d.type}
                      {" · "}
                      {formaterDate(d.created_at)}
                      {d.taille_octets ? ` · ${formaterTaille(d.taille_octets)}` : ""}
                      {rattachements && ` · ${rattachements}`}
                    </small>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {/* Ouvrir une fiche ne recharge pas la liste : l'anneau
                        sur la ligne cliquée confirme le geste */}
                    <IndicateurLien />
                    {/* La puce garde la durée, en rouge quand l'échéance
                        approche (maquette : d.cons, p-rouge si alerte) */}
                    <span className={`puce ${renouveler ? "puce-rouge" : "puce-grise"}`}>
                      {dureeConservation(dureesParType.get(d.type))}
                    </span>
                  </span>
                </Link>
              );
            })
          )}
        </div>

        {sel === "depot" ? (
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-base">Déposer une pièce</CardTitle>
              <CardDescription>
                PDF, JPEG ou PNG · 10 Mo max · contenu réel vérifié · doublons
                refusés. Le type pilote seul les droits d&apos;accès et la durée
                de conservation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormulaireDepot orgId={orgId} personnes={personnes ?? []} />
            </CardContent>
          </Card>
        ) : sel ? (
          <PaneDocument orgId={orgId} documentId={sel} lienFermer={lien(null)} />
        ) : (
          <div className="space-y-3.5">
            {aRenouveler.length > 0 && (
              <Card className="border-l-[3px] border-l-[var(--destructive)]">
                <CardContent className="pt-5">
                  <div className="entete-carte">
                    <h3 className="text-base font-medium">Pièces à renouveler</h3>
                    <span className="puce puce-rouge">{aRenouveler.length}</span>
                  </div>
                  <ul className="divide-y divide-border text-sm">
                    {aRenouveler.map((d) => (
                      <li key={d.id}>
                        <Link
                          href={lien(d.id)}
                          className="flex items-center justify-between gap-3 py-2 hover:underline"
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {d.titre ?? "Sans titre"}
                            <small className="ml-2 text-muted-foreground">
                              expire le {formaterDate(d.expire_le)}
                            </small>
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            <IndicateurLien />
                            <span className="puce puce-rouge">à renouveler</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="pt-5">
                <div className="entete-carte">
                  <h3 className="text-base font-medium">Par type</h3>
                </div>
                {entreesTypes.length === 0 ? (
                  <p className="vide">
                    Aucune pièce à répartir pour l&apos;instant — déposez la
                    première avec « + Déposer une pièce ».
                  </p>
                ) : (
                  <>
                    <div
                      className="mb-3 flex h-2.5 gap-1 overflow-hidden rounded-sm"
                      aria-hidden
                    >
                      {entreesTypes.map(([t, n], i) => (
                        <span
                          key={t}
                          style={{
                            flex: n,
                            background: COULEURS_TYPES[i % COULEURS_TYPES.length],
                          }}
                          title={`${TYPES_DOCUMENT[t] ?? t} : ${n}`}
                        />
                      ))}
                    </div>
                    <ul className="divide-y divide-border text-sm">
                      {entreesTypes.map(([t, n], i) => (
                        <li key={t}>
                          {/* Chaque type est un filtre cliquable (maquette) —
                              les autres filtres sont conservés */}
                          <Link
                            href={lien(null, t)}
                            className="flex items-center justify-between gap-3 py-1.5 hover:underline"
                          >
                            <span className="flex min-w-0 flex-1 items-center gap-2">
                              <span
                                aria-hidden
                                className="inline-block size-[9px] shrink-0"
                                style={{
                                  background: COULEURS_TYPES[i % COULEURS_TYPES.length],
                                }}
                              />
                              {TYPES_DOCUMENT[t] ?? t}
                            </span>
                            <span className="flex shrink-0 items-center gap-1.5">
                              <IndicateurLien />
                              <span className="mono-discret">{n}</span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Le type d&apos;une pièce pilote seul ses droits d&apos;accès
                      et sa durée de conservation. {totalVivants} pièce
                      {totalVivants > 1 ? "s" : ""} conservée
                      {totalVivants > 1 ? "s" : ""}, hors pièces purgées.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}
