import Link from "next/link";
import { verifierAccesEspace } from "@/lib/espace";
import {
  TYPES_DOCUMENT,
  estARenouveler,
  formaterDate,
  limiteRenouvellement,
  motifLitteral,
} from "@/lib/ged";
import { formaterTaille } from "@/lib/file-type";
import { lotsDuPortefeuille } from "@/lib/portefeuille";
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
import { EchecLecture } from "./echec-lecture";
import { PaneDocument, puceConservation } from "./pane-document";
import { titreAffiche } from "./titre-document";

export const metadata = { title: "Documents — Gerimmo" };

// La colonne ne descend pas indéfiniment : au-delà, c'est la recherche qui
// sert, pas le défilement. Le plafond est NOMMÉ et DIT à l'écran — annoncer
// 340 pièces et n'en montrer que 100 sans le signaler est un mensonge (relevé
// du 11/09).
const PLAFOND_LISTE = 100;

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
  const { supabase, role, user } = await verifierAccesEspace(orgId);
  // Périmètre portefeuille (RM-18.1.3, audit 09/09) : l'agent ne voit que les
  // pièces rattachées à ses lots, baux, incidents et locataires — les pièces
  // d'organisation (sans rattachement) restent visibles de tous. Le filtre
  // s'applique EN SQL, aux listes comme aux agrégats.
  const portefeuille = await lotsDuPortefeuille(supabase, orgId, role, user.id);
  const lotsPerimetre = portefeuille ? Array.from(portefeuille) : null;

  const filtresActifs = Boolean(recherche.type || recherche.q || recherche.du || recherche.au);
  // Navigation par filtres, jamais par dossiers (RM-12.5.1). La fonction
  // documents_courants (security invoker : la RLS s'applique) écarte les
  // versions remplacées EN SQL — pas de fenêtre applicative faussée.
  // `count: exact` sur la requête MÊME : le total rendu décrit exactement ce
  // que les filtres retiennent, plafond compris. Sans lui, la seule façon de
  // savoir combien de pièces la liste tait serait de ne pas le savoir.
  let requete = supabase
    .rpc("documents_courants", { p_org: orgId, p_lots: lotsPerimetre }, { count: "exact" })
    .select(
      "id, type, titre, mime_type, taille_octets, expire_le, purged_at, created_at, liens:document_liens(entite, entite_id)"
    )
    .order("created_at", { ascending: false })
    .limit(PLAFOND_LISTE);
  if (recherche.type) requete = requete.eq("type", recherche.type);
  if (recherche.q) {
    // Un titre de diagnostic déposé avant le 24/09 porte sa date en AAAA-MM-JJ
    // (« DPE — 2026-09-24 ») alors que l'écran l'affiche en français : une
    // recherche « 24/09/2026 » retrouve les deux écritures. La date seule est
    // faite de chiffres, donc sans risque pour la syntaxe du filtre `or`.
    const date = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(recherche.q.trim());
    requete = date
      ? requete.or(`titre.ilike.%${date[1]}/${date[2]}/${date[3]}%,titre.ilike.%${date[3]}-${date[2]}-${date[1]}%`)
      : requete.ilike("titre", `%${motifLitteral(recherche.q)}%`);
  }
  if (recherche.du) requete = requete.gte("created_at", recherche.du);
  if (recherche.au) requete = requete.lte("created_at", `${recherche.au}T23:59:59`);

  const [
    { data: documents, error: erreurDocuments, count: totalFiltre },
    { data: statsTypes, error: erreurStats },
    { data: aRenouvelerBrut, error: erreurRenouveler },
    { count: totalCourants, error: erreurTotal },
    { data: personnes, error: erreurPersonnes },
    { data: regles, error: erreurRegles },
  ] = await Promise.all([
    requete,
    // La vue d'ensemble se calcule sur TOUTES les pièces courantes, agrégées
    // EN SQL — jamais sur une fenêtre plafonnée (revue 26/08, passes 1 et 2)
    supabase.rpc("documents_stats_par_type", { p_org: orgId, p_lots: lotsPerimetre }),
    supabase.rpc("documents_a_renouveler", {
      p_org: orgId,
      p_limite: limiteRenouvellement(),
      p_lots: lotsPerimetre,
    }),
    // Le total du PARC, utile au seul cas où il diffère de la liste : sous
    // filtre. Sans filtre, le compte exact de la requête ci-dessus est déjà
    // celui-là — pas deux COUNT(*) pour le même nombre.
    // En HEAD, les arguments passent dans l'URL : un p_lots nul y devenait la
    // chaîne « null », illisible comme uuid[] (24/09). Hors portefeuille, on
    // l'omet — la fonction le prend nul par défaut.
    filtresActifs
      ? supabase.rpc(
          "documents_courants",
          lotsPerimetre ? { p_org: orgId, p_lots: lotsPerimetre } : { p_org: orgId },
          { count: "exact", head: true }
        )
      : Promise.resolve({ count: null, error: null }),
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

  // Les lectures d'appoint : si l'une échoue, la page reste utile mais elle le
  // DIT — sinon une répartition absente passerait pour un parc sans pièces et
  // un rattachement manquant pour une pièce sans personne.
  const lecturesManquees = [
    erreurStats && "la répartition par type",
    erreurRenouveler && "les documents à renouveler",
    erreurTotal && "le nombre total de documents",
    erreurPersonnes && "les personnes rattachées",
    erreurRegles && "les durées de conservation",
  ].filter((q): q is string => Boolean(q));

  // Ce que le compteur d'en-tête a le droit d'affirmer. Avec un filtre actif,
  // le total du parc et le total filtré ne sont PAS le même nombre : les deux
  // s'affichent, sinon l'en-tête décrit une liste qui n'est pas celle du dessous.
  // Le compte exact vient de l'en-tête Content-Range ; il peut manquer (24/09 :
  // l'émulateur local n'en pose pas sur une RPC, et la colonne n'affichait
  // jamais « · N »). Sous le plafond, la liste reçue EST le total : on le dit.
  // Au plafond sans compte, « 100+ » — jamais un chiffre plafonné qui se
  // lirait comme un total.
  const compteListe: number | null =
    totalFiltre ?? (docs.length < PLAFOND_LISTE ? docs.length : null);
  const libelleCompte =
    compteListe === null
      ? `${PLAFOND_LISTE}+`
      : String(compteListe);
  const totalTronque =
    !erreurDocuments &&
    docs.length >= PLAFOND_LISTE &&
    (compteListe === null || docs.length < compteListe);

  // L'état vide « propre » : aucun document, aucun filtre, aucune fiche
  // ouverte. Rien à filtrer ni à répartir : la page se réduit au guide et à
  // son seul geste de dépôt (24/09 — barre de filtres, deux cartes vides et
  // trois « Déposer » disaient la même chose).
  const parcVide = !erreurDocuments && !filtresActifs && docs.length === 0 && !sel;

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
      {/* L'en-tête standard de l'espace (tour du 24/09) : le titre, la
          mention, l'action — sans fil d'Ariane, Documents est une page de
          premier niveau et le menu dit déjà où l'on est. Même ordre
          qu'Incidents : le compteur, l'action secondaire en lien discret,
          puis le seul bouton principal (charte 04). La phrase d'aide passe
          sous le filet. */}
      <div className="mb-6">
        <div className="entete-page">
          <h1>Documents</h1>
          <div className="flex flex-wrap items-center gap-3">
            <span className="mono-discret">
              {portefeuille ? "Mon portefeuille · " : ""}
              {erreurDocuments ? (
                "nombre indisponible"
              ) : (
                <>
                  {libelleCompte} document
                  {compteListe === null || compteListe > 1 ? "s" : ""}
                  {filtresActifs && totalCourants != null && totalCourants !== compteListe
                    ? ` sur ${totalCourants}`
                    : ""}
                </>
              )}
            </span>
            <Link href={`/agence/${orgId}/documents/catalogue`} className="lien-discret">
              Préparer un document
            </Link>
            {/* Parc vide : le guide, dessous, porte le seul geste de dépôt */}
            {!parcVide && (
              <Link href={lien("depot")} className="btn-or">
                + Déposer un document
              </Link>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Baux, diagnostics, quittances et justificatifs de vos lots, au même
          endroit.
        </p>
      </div>

      <EchecLecture quoi={lecturesManquees} />

      {/* Filtres — la recherche traite % et _ comme des caractères normaux.
          Sous 640 px (audit 09/09), chaque champ prend sa propre ligne :
          aucun débordement horizontal au niveau page. Les deux dates, courtes,
          partagent la leur (24/09). Parc vide : rien à filtrer, pas de barre. */}
      {parcVide ? (
        <div className="vide-guide">
          <p className="titre">Aucun document pour l&apos;instant</p>
          <p className="explication">
            Baux, diagnostics et justificatifs déposés ailleurs dans
            l&apos;application se retrouvent ici tout seuls. Vous pouvez aussi
            en déposer un directement.
          </p>
          <span className="geste">
            <Link href={lien("depot")} className="btn-or">
              + Déposer un document
            </Link>
          </span>
        </div>
      ) : (
        <>
          <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
            <div className="w-full sm:w-auto">
              <label htmlFor="type" className="libelle-champ mb-1 block">
                Type
              </label>
              <select
                id="type"
                name="type"
                defaultValue={recherche.type ?? ""}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm sm:w-auto"
              >
                <option value="">Tous</option>
                {/* Le type de test (purge immédiate) est interne : il n'a rien à
                    faire dans un filtre d'utilisateur (24/09) */}
                {Object.entries(TYPES_DOCUMENT)
                  .filter(([valeur]) => valeur !== "document_test")
                  .map(([valeur, libelle]) => (
                    <option key={valeur} value={valeur}>
                      {libelle}
                    </option>
                  ))}
              </select>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:contents">
              <div className="w-full sm:w-auto">
                <label htmlFor="du" className="libelle-champ mb-1 block">
                  Du
                </label>
                <input
                  id="du"
                  name="du"
                  type="date"
                  defaultValue={recherche.du ?? ""}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm sm:w-auto"
                />
              </div>
              <div className="w-full sm:w-auto">
                <label htmlFor="au" className="libelle-champ mb-1 block">
                  Au
                </label>
                <input
                  id="au"
                  name="au"
                  type="date"
                  defaultValue={recherche.au ?? ""}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm sm:w-auto"
                />
              </div>
            </div>
            <div className="w-full flex-1 sm:min-w-40 sm:w-auto">
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

          {/* Vue scindée maquette : les documents à gauche, la fiche ou la vue
              d'ensemble à droite (?sel=…).
              Vue scindée mobile (socle 10/09) : `detail-actif` masque la liste
              sous 900px quand une sélection existe — la fiche (ou le formulaire
              de dépôt) remplace la liste au lieu d'être rendue dessous, avec un
              lien retour en tête. */}
          <div className={`split${sel ? " detail-actif" : ""}`}>
            <div className="colonne-liste-split volet-liste">
              <div className="tete-liste">
                {/* L'intitulé de la colonne dit ce qu'elle CONTIENT : « tous les
                    documents » sous un filtre actif était faux. */}
                <span className="mono-discret">
                  {filtresActifs ? "Documents filtrés" : "Tous les documents"}
                  {!erreurDocuments ? ` · ${libelleCompte}` : ""}
                </span>
                {sel && (
                  <Link
                    href={lien(null)}
                    className="lien-discret inline-flex items-center gap-1.5"
                  >
                    Vue d&apos;ensemble
                    <IndicateurLien />
                  </Link>
                )}
              </div>
              {erreurDocuments ? (
                /* Ni liste ni état vide : proposer « déposez la première pièce »
                   alors que la lecture a échoué serait un mensonge de plus. */
                <div className="p-3.5">
                  <EchecLecture quoi={["la liste des documents"]} />
                </div>
              ) : docs.length === 0 ? (
                /* Retrait du cadre de colonne, comme l'encart d'erreur : le
                   pointillé arrondi ne bute plus sur ses angles droits (24/09) */
                <div className="p-3.5">
                  <div className="vide-guide">
                    {filtresActifs ? (
                      <>
                        <p className="titre">Aucun document ne correspond</p>
                        <p className="explication">
                          Le type, la période ou le titre cherché ne retiennent rien.
                          Repartez de la liste complète, puis resserrez d&apos;un cran.
                        </p>
                        <span className="geste">
                          <Link
                            href={`/agence/${orgId}/documents`}
                            className={`inline-flex items-center gap-1.5 ${buttonVariants({ variant: "outline", size: "sm" })}`}
                          >
                            Effacer les filtres
                            <IndicateurLien />
                          </Link>
                        </span>
                      </>
                    ) : (
                      /* Sans filtre, on n'arrive ici qu'avec une fiche ou le dépôt
                         ouverts à droite : l'en-tête porte déjà « Déposer ». */
                      <>
                        <p className="titre">Aucun document pour l&apos;instant</p>
                        <p className="explication">
                          Baux, diagnostics et justificatifs déposés ailleurs dans
                          l&apos;application se retrouvent ici tout seuls.
                        </p>
                      </>
                    )}
                  </div>
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
                        className={`rang${actif ? " actif" : ""}`}
                        aria-current={actif ? "true" : undefined}
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
                      className={`rang${actif ? " actif" : ""}`}
                      aria-current={actif ? "true" : undefined}
                    >
                      <span className="min-w-0 flex-1">
                        <b className="block truncate">{titreAffiche(d.titre) ?? "Sans titre"}</b>
                        {/* Le détail passe à la ligne au lieu d'être tronqué
                            (25/09 : « · 160… » à 1280 px comme à 390 px). */}
                        <small className="block">
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
                        <span
                          className={`puce ${renouveler ? "puce-rouge" : "puce-grise"}`}
                          title="Durée de conservation du document"
                        >
                          {puceConservation(dureesParType.get(d.type))}
                        </span>
                        {/* Le rang se clique en entier ; la flèche le dit
                            (25/09 : sans elle, la puce passait pour le seul
                            contenu de droite et rien n'invitait à ouvrir). */}
                        <span aria-hidden className="text-muted-foreground">→</span>
                      </span>
                    </Link>
                  );
                })
              )}
              {/* La colonne dit ce qu'elle ne montre pas. Sans cette ligne, 100
                  pièces sur 340 se lisaient comme 340 pièces (relevé du 11/09). */}
              {totalTronque && (
                <p className="border-t border-border px-3.5 py-2.5 text-[length:var(--pas-appui)] text-[var(--texte-secondaire)]">
                  Les {docs.length} documents les plus récents
                  {compteListe !== null ? `, sur ${compteListe}` : ""}. Affinez par
                  type, par période ou par titre pour atteindre les autres.
                </p>
              )}
            </div>

            {sel ? (
              <div className="min-w-0">
                {/* Visible sous 900px seulement (.retour-liste) : la liste est masquée */}
                <Link href={lien(null)} className="retour-liste mb-2">
                  ← Tous les documents
                </Link>
                {sel === "depot" ? (
                  <Card className="h-fit">
                    <CardHeader>
                      <CardTitle className="text-base">Déposer un document</CardTitle>
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
                ) : (
                  <PaneDocument orgId={orgId} documentId={sel} lienFermer={lien(null)} />
                )}
              </div>
            ) : (
              <div className="space-y-3.5">
                {aRenouveler.length > 0 && (
                  <Card className="border-l-[3px] border-l-[var(--destructive)]">
                    {/* Sans pt-5 : la Card pose déjà sa marge (24/09) */}
                    <CardContent>
                      <div className="entete-carte">
                        <h3 className="text-base font-medium">Documents à renouveler</h3>
                        <span className="puce puce-rouge">{aRenouveler.length}</span>
                      </div>
                      <ul className="divide-y divide-border text-sm">
                        {aRenouveler.map((d) => (
                          <li key={d.id}>
                            <Link
                              href={lien(d.id)}
                              className="flex items-center justify-between gap-3 py-2 hover:underline pointer-coarse:min-h-11"
                            >
                              <span className="min-w-0 flex-1 truncate">
                                {titreAffiche(d.titre) ?? "Sans titre"}
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
                  <CardContent>
                    <div className="entete-carte">
                      <h3 className="text-base font-medium">Par type</h3>
                    </div>
                    {entreesTypes.length === 0 ? (
                      <p className="vide">Aucun document à répartir pour l&apos;instant.</p>
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
                                className="flex items-center justify-between gap-3 py-1.5 hover:underline pointer-coarse:min-h-11"
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
                          Le type d&apos;un document pilote seul ses droits
                          d&apos;accès et sa durée de conservation. {totalVivants}{" "}
                          document{totalVivants > 1 ? "s" : ""} conservé
                          {totalVivants > 1 ? "s" : ""}, hors documents purgés.
                        </p>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
