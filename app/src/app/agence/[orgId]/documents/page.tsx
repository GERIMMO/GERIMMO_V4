import { TitreEcran } from "@/components/titre-ecran";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, FileImage, FileText, TriangleAlert } from "lucide-react";
import { lirePresentationSignatures } from "@/lib/lecture-presentation-signatures";
import { etatSignatureDocument } from "@/lib/presentation-signatures";
import { presentationDocument } from "@/lib/presentation-document";
import { verifierAccesEspace } from "@/lib/espace";
import {
  TYPES_DOCUMENT,
  formaterDate,
  limiteRenouvellement,
  motifLitteral,
} from "@/lib/ged";
import { formaterTaille } from "@/lib/file-type";
import { lotsDuPortefeuille } from "@/lib/portefeuille";
import { nomComplet } from "@/lib/roles-personnes";
import { estUuid } from "@/lib/identifiants";
import { libelleLot } from "@/lib/parc";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";
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
import { PaneDocument } from "./pane-document";
import { FiltresProprietaire } from "./filtres-proprietaire";
import { titreAffiche } from "./titre-document";
import { presentationRapport, syntheseRapport, usagesParDocument, type UsageRapport } from "@/lib/rapports-diagnostic";
import { baseEspace } from "@/lib/racine-espace";
import styles from "./documents-proprietaire.module.css";

// Les diagnostics qui citent la pièce, archivés compris. Littéral local : le contrôle des embeds ambigus
// (tests/embeds-ambigus.test.ts) ne lit que les constantes du fichier.
const CHAMPS_USAGE_RAPPORT =
  "document_id, type, date_realisation, date_expiration, archived_at, lot_id, bien_id, lot:lots!diagnostics_lot_id_fkey(nom, bien_id, bien:biens!lots_bien_id_fkey(nom)), bien:biens!diagnostics_bien_id_fkey(nom)";

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
  verifie_le: string | null;
  purged_at: string | null;
  created_at: string;
  liens: LienRang[];
};

type ARenouveler = { id: string; titre: string | null; expire_le: string; rattachement?: string | null };

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
  const lotDemande = uneValeur(brut.lot);
  const { supabase, role, user, estProprietaire } = await verifierAccesEspace(orgId);
  // Décision D27 : les écrans du propriétaire direct vivent sous /espace/<id>, ceux des agences sous /agence/<id>.
  const base = baseEspace(orgId, estProprietaire);
  // Dépôt ouvert depuis la fiche d'un lot (audit #264, DOC-05) : le lot est
  // relu dans cet espace, sous la RLS (un agent ne lit que son portefeuille),
  // avant d'être proposé au rattachement ; l'action le revérifie. Un lot
  // inconnu n'est simplement pas proposé ; une lecture refusée est dite.
  const { data: lotLu, error: erreurLot } = sel === "depot" && estUuid(lotDemande)
    ? await supabase
        .from("lots")
        .select("id, nom, bien_id, bien:biens!lots_bien_id_fkey(nom)")
        .eq("id", lotDemande)
        .eq("organization_id", orgId)
        .neq("etat", "archive")
        .maybeSingle()
    : { data: null, error: null };
  const lotDepot = lotLu ? {
    id: lotLu.id as string,
    libelle: libelleLot(lotLu.nom, premier(lotLu.bien as UnOuPlusieurs<{ nom: string }>)?.nom),
    // La fiche du lot du propriétaire montre ses « Autres documents » : le
    // dépôt y revient. Celle de l'agence ne les liste pas : pas de retour forcé.
    retour: estProprietaire ? `${base}/parc/${lotLu.bien_id}/lots/${lotLu.id}#documents-lot` : undefined,
  } : undefined;
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
      "id, type, titre, mime_type, taille_octets, expire_le, verifie_le, purged_at, created_at, liens:document_liens(entite, entite_id)"
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
    { data: diagnosticsARenouveler, error: erreurDiagnosticsARenouveler },
    { count: totalCourants, error: erreurTotal },
    { data: personnes, error: erreurPersonnes },
  ] = await Promise.all([
    requete,
    // La vue d'ensemble se calcule sur TOUTES les pièces courantes, agrégées
    // EN SQL — jamais sur une fenêtre plafonnée (revue 26/08, passes 1 et 2)
    estProprietaire
      ? Promise.resolve({ data: [], error: null })
      : supabase.rpc("documents_stats_par_type", { p_org: orgId, p_lots: lotsPerimetre }),
    supabase.rpc("documents_a_renouveler", {
      p_org: orgId,
      p_limite: limiteRenouvellement(),
      p_lots: lotsPerimetre,
    }),
    // DOC-04 : l'échéance d'un rapport de diagnostic vit dans `diagnostics` (plafond du DPE compris).
    supabase.rpc("diagnostics_a_renouveler", {
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
  ]);

  // Le typage de .rpc().select() hésite entre ligne et tableau : la fonction
  // renvoie toujours un setof, on fixe le tableau
  const docs = ((documents ?? []) as unknown as DocRang[]);
  // DOC-04 et DOC-N1 : les rapports de diagnostic de la liste disent leur échéance et le bien ou le lot qu'ils servent.
  const idsVivants = docs.filter(d => !d.purged_at).map(d => d.id);
  const { data: usagesBruts, error: erreurUsages } = idsVivants.length
    ? await supabase.from("diagnostics").select(CHAMPS_USAGE_RAPPORT).eq("organization_id", orgId).in("document_id", idsVivants)
    : { data: [], error: null };
  const usages = usagesParDocument((usagesBruts ?? []) as unknown as UsageRapport[]);
  const nomsPersonnes = new Map((personnes ?? []).map((p) => [p.id, nomComplet(p)]));
  const suiviSignatures = await lirePresentationSignatures(orgId, { documents: docs.filter(d => !d.purged_at).map(d => d.id) });

  const aRenouveler = [
    ...((aRenouvelerBrut ?? []) as ARenouveler[]),
    ...((diagnosticsARenouveler ?? []) as ARenouveler[]),
  ].filter((d, i, liste) => liste.findIndex(x => x.id === d.id) === i).sort((a, b) => a.expire_le.localeCompare(b.expire_le));
  const entreesTypes = ((statsTypes ?? []) as { type: string; total: number }[]).map(
    (s) => [s.type, Number(s.total)] as [string, number]
  );
  const totalVivants = entreesTypes.reduce((somme, [, n]) => somme + n, 0);

  // Les lectures d'appoint : si l'une échoue, la page reste utile mais elle le
  // DIT — sinon une répartition absente passerait pour un parc sans pièces et
  // un rattachement manquant pour une pièce sans personne.
  const lecturesManquees = [
    erreurStats && "la répartition par type",
    (erreurRenouveler || erreurDiagnosticsARenouveler) && "les documents à renouveler",
    erreurUsages && "l’échéance et le rattachement des rapports de diagnostic",
    erreurTotal && "le nombre total de documents",
    erreurPersonnes && "les personnes rattachées",
    erreurLot && "le lot d’où le dépôt a été ouvert",
    suiviSignatures.erreur && "le suivi des signatures",
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
  const indexSelection = docs.findIndex(d => d.id === sel);

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
    return `${base}/documents${q ? `?${q}` : ""}`;
  };

  // Le dépôt est une tâche à part entière : les filtres et la liste restent
  // dans l'adresse de retour, sans repousser le formulaire sous le premier écran.
  if (estProprietaire && sel === "depot") {
    return (
      <main className={`mx-auto w-full max-w-5xl flex-1 p-4 sm:p-7 ${styles.page}`}>
        <Link href={lotDepot?.retour ?? lien(null)} className="lien-discret mb-2 inline-flex min-h-11 items-center">
          {lotDepot?.retour ? "← Retour au lot" : "← Retour aux documents"}
        </Link>
        <div className={styles.entetePage}>
          <div className="entete-page">
            <TitreEcran rubrique="documents">Déposer un document</TitreEcran>
          </div>
        </div>
        <div className="max-w-2xl">
          <EchecLecture quoi={[erreurPersonnes && "les personnes rattachées", erreurLot && "le lot d’où le dépôt a été ouvert"].filter((q): q is string => Boolean(q))} />
          <Card>
            <CardContent>
              <FormulaireDepot orgId={orgId} personnes={personnes ?? []} lienAnnuler={lotDepot?.retour ?? lien(null)} typeInitial={recherche.type} lot={lotDepot} />
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    // Même gabarit que les autres écrans de l'espace (audit 27/09 : en
    // max-w-6xl, le titre partait 12 px plus à gauche que partout ailleurs).
    <main className={`mx-auto w-full max-w-5xl flex-1 p-4 sm:p-7${estProprietaire ? ` ${styles.page}` : ""}`} data-document-ouvert={estProprietaire && Boolean(sel)}>
      {/* L'en-tête standard de l'espace (tour du 24/09) : le titre, la
          mention, l'action — sans fil d'Ariane, Documents est une page de
          premier niveau et le menu dit déjà où l'on est. Même ordre
          qu'Incidents : le compteur, l'action secondaire en lien discret,
          puis le seul bouton principal (charte 04). La phrase d'aide passe
          sous le filet. */}
      <div className={estProprietaire ? styles.entetePage : "mb-6"}>
        <div className="entete-page">
          <TitreEcran rubrique="documents">Documents</TitreEcran>
          <div className={`flex flex-wrap items-center gap-3${estProprietaire ? ` ${styles.actionsPage}` : ""}`}>
            {!estProprietaire && <span className="mono-discret">
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
            </span>}
            <Link href={`${base}/documents/catalogue`} className="lien-discret" aria-label={estProprietaire ? "Préparer un document" : undefined}>
              {estProprietaire ? "Préparer" : "Préparer un document"}
            </Link>
            {/* Parc vide : le guide, dessous, porte le seul geste de dépôt */}
            {!parcVide && (
              <Link href={lien("depot")} className="btn-or" aria-label={estProprietaire ? "Déposer un document" : undefined}>
                {estProprietaire ? "+ Déposer" : "+ Déposer un document"}
              </Link>
            )}
          </div>
        </div>
        {!estProprietaire && <p className="text-sm text-muted-foreground">
          Baux, diagnostics, quittances et justificatifs de vos lots, au même
          endroit.
        </p>}
      </div>

      <EchecLecture quoi={lecturesManquees} />

      {/* Filtres — la recherche traite % et _ comme des caractères normaux.
          Sous 640 px (audit 09/09), chaque champ prend sa propre ligne :
          aucun débordement horizontal au niveau page. Les deux dates, courtes,
          partagent la leur (24/09). Parc vide : rien à filtrer, pas de barre. */}
      {parcVide ? (
        <div className="vide-guide" data-ton="bleu">
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
          {estProprietaire ? <FiltresProprietaire recherche={recherche} lienEffacer={`${base}/documents`} /> : <form method="get" className="barre-filtres mb-4 flex flex-wrap items-end gap-2">
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
          </form>}

          {estProprietaire && aRenouveler.length > 0 && (
            <details className={styles.renouvellements}>
              <summary>
                <TriangleAlert size={17} aria-hidden="true" />
                <span>{aRenouveler.length} document{aRenouveler.length > 1 ? "s" : ""} à renouveler</span>
                <span className={styles.voirRenouvellements}>Voir les documents</span>
              </summary>
              <ul>
                {aRenouveler.map((d) => <li key={d.id}>
                  <Link href={lien(d.id)}>
                    <span>{titreAffiche(d.titre) ?? "Sans titre"}<small>{d.rattachement ? `${d.rattachement} · ` : ""}Échéance : {formaterDate(d.expire_le)}</small></span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </Link>
                </li>)}
              </ul>
            </details>
          )}

          {/* Vue scindée maquette : les documents à gauche, la fiche ou la vue
              d'ensemble à droite (?sel=…).
              Vue scindée mobile (socle 10/09) : `detail-actif` masque la liste
              sous 900px quand une sélection existe — la fiche (ou le formulaire
              de dépôt) remplace la liste au lieu d'être rendue dessous, avec un
              lien retour en tête. */}
          <div className={`split${sel ? " detail-actif" : estProprietaire ? "" : " split-apercu"}${estProprietaire ? ` ${styles.espaceDocuments}` : ""}`}>
            <div className="colonne-liste-split volet-liste">
              <div className="tete-liste">
                {/* L'intitulé de la colonne dit ce qu'elle CONTIENT : « tous les
                    documents » sous un filtre actif était faux. */}
                <span className="mono-discret">
                  {estProprietaire && !erreurDocuments ? <>
                    {libelleCompte} document{compteListe === null || compteListe !== 1 ? "s" : ""}
                    {filtresActifs && totalCourants != null && totalCourants !== compteListe ? ` sur ${totalCourants}` : ""}
                  </> : <>
                    {filtresActifs ? "Documents filtrés" : "Tous les documents"}
                    {!erreurDocuments ? ` · ${libelleCompte}` : ""}
                  </>}
                </span>
                {sel && !estProprietaire && (
                  <Link
                    href={lien(null)}
                    className="lien-discret inline-flex items-center gap-1.5"
                  >
                    Vue d’ensemble
                    <IndicateurLien />
                  </Link>
                )}
                {estProprietaire && !sel && !erreurDocuments && docs.length > 0 && <span className={styles.ordreListe}>Plus récents d’abord</span>}
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
                  <div className="vide-guide" data-ton="bleu">
                    {filtresActifs ? (
                      <>
                        <p className="titre">Aucun document ne correspond</p>
                        <p className="explication">
                          {estProprietaire ? "Essayez un autre titre ou retirez un filtre." : <>Le type, la période ou le titre cherché ne retiennent rien.
                          Repartez de la liste complète, puis resserrez d&apos;un cran.</>}
                        </p>
                        <span className="geste">
                          <Link
                            href={`${base}/documents`}
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
                        className={`rang flex-wrap gap-y-2${actif ? " actif" : ""}`}
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
                  const rapport = syntheseRapport(usages.get(d.id) ?? []);
                  const presentation = presentationRapport(d, rapport, doc => presentationDocument(doc, etatSignatureDocument(suiviSignatures.circuits, d.id)));
                  const lieA = rapport?.rattachements.map(r => r.libelle).join(", ");
                  if (estProprietaire) {
                    const Icone = d.mime_type?.startsWith("image/") ? FileImage : FileText;
                    return <Link
                      key={d.id}
                      href={lien(d.id)}
                      className={`${styles.documentLigne}${actif ? ` ${styles.documentActif}` : ""}`}
                      aria-current={actif ? "true" : undefined}
                    >
                      <span className={styles.iconeFichier} aria-hidden="true"><Icone size={19} strokeWidth={1.6} /></span>
                      <span className={styles.identiteDocument}>
                        <span className={styles.titreLigne}>{titreAffiche(d.titre) ?? "Sans titre"}</span>
                        <span className={styles.metaDocument}>{TYPES_DOCUMENT[d.type] ?? d.type}{lieA && ` · ${lieA}`}{rattachements && ` · ${rattachements}`}</span>
                      </span>
                      <time className={styles.dateDocument} dateTime={d.created_at} title="Date de dépôt">{formaterDate(d.created_at)}</time>
                      <span className={`${styles.statutDocument} puce ${presentation.classe}`} title={presentation.detail}>{presentation.libelle}</span>
                      <span className={styles.ouvrirDocument} aria-hidden="true"><IndicateurLien /><ChevronRight size={16} /></span>
                    </Link>;
                  }
                  return (
                    <Link
                      key={d.id}
                      href={lien(d.id)}
                      className={`rang flex-wrap gap-y-2${actif ? " actif" : ""}`}
                      aria-current={actif ? "true" : undefined}
                    >
                      <span className="min-w-0 flex-1">
                        <b className={estProprietaire ? styles.titreLigne : "block truncate"}>{titreAffiche(d.titre) ?? "Sans titre"}</b>
                        {/* Le détail passe à la ligne au lieu d'être tronqué
                            (25/09 : « · 160… » à 1280 px comme à 390 px). */}
                        <small className="block">
                          {TYPES_DOCUMENT[d.type] ?? d.type}
                          {" · "}
                          {formaterDate(d.created_at)}
                          {!estProprietaire && d.taille_octets ? ` · ${formaterTaille(d.taille_octets)}` : ""}
                          {lieA && ` · ${lieA}`}
                          {rattachements && ` · ${rattachements}`}
                        </small>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {/* Ouvrir une fiche ne recharge pas la liste : l'anneau
                            sur la ligne cliquée confirme le geste */}
                        <IndicateurLien />
                        {/* La conservation reste dans le détail ; ici on lit l’état du fichier. */}
                        <span
                          className={`puce ${presentation.classe}`}
                          title={presentation.detail}
                        >
                          {presentation.libelle}
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
                {estProprietaire ? <nav className={styles.navigationDocument} aria-label="Navigation des documents">
                  <Link href={lien(null)}><ArrowLeft size={16} aria-hidden="true" />Retour à la liste</Link>
                  {indexSelection >= 0 && docs.length > 1 && <div className={styles.parcourirDocuments}>
                    {indexSelection > 0 ? <Link href={lien(docs[indexSelection - 1].id)} aria-label="Document précédent" title="Document précédent"><ChevronLeft size={18} aria-hidden="true" /></Link> : <span aria-disabled="true" aria-label="Document précédent"><ChevronLeft size={18} aria-hidden="true" /></span>}
                    {indexSelection < docs.length - 1 ? <Link href={lien(docs[indexSelection + 1].id)} aria-label="Document suivant" title="Document suivant"><ChevronRight size={18} aria-hidden="true" /></Link> : <span aria-disabled="true" aria-label="Document suivant"><ChevronRight size={18} aria-hidden="true" /></span>}
                  </div>}
                </nav> : <Link href={lien(null)} className="retour-liste mb-2">← Retour aux documents</Link>}
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
                      <FormulaireDepot orgId={orgId} personnes={personnes ?? []} lot={lotDepot} />
                    </CardContent>
                  </Card>
                ) : (
                  <PaneDocument key={sel} orgId={orgId} documentId={sel} lienFermer={lien(null)} />
                )}
              </div>
            ) : !estProprietaire ? (
              <div className="space-y-3.5">
                {aRenouveler.length > 0 && (
                  <Card data-tone="critical">
                    {/* Sans pt-5 : la Card pose déjà sa marge (24/09) */}
                    <CardContent>
                      <div className="entete-carte">
                        <h2 className="titre-carte text-base font-medium">Documents à renouveler</h2>
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
                                  {d.rattachement ? `${d.rattachement} · ` : ""}expire le {formaterDate(d.expire_le)}
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

                <Card className="carte-rubrique" data-ton="bleu">
                  <CardContent>
                    <div className="entete-carte">
                      <h2 className="titre-carte text-base font-medium">Répartition des documents</h2>
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
            ) : null}
          </div>
        </>
      )}
    </main>
  );
}
