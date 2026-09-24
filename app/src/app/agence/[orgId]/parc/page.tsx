import Link from "next/link";
import { verifierAccesEspace } from "@/lib/espace";
import { lotsDuPortefeuille } from "@/lib/portefeuille";
import { ROLES_RESPONSABLES, eur } from "@/lib/ged";
import { resumerBlocage } from "@/lib/echeances";
import { etiqueterNiveau } from "@/lib/diagnostics";
import {
  TYPES_BIEN,
  ETATS_LOT,
  COULEURS_ETAT_LOT,
  formaterSurface,
  cibleBlocage,
} from "@/lib/parc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { IndicateurLien } from "@/components/ui/indicateur-lien";
import { FormulaireEquipementCatalogue } from "./formulaire-equipement-catalogue";
import { PaneParc, lireSelection } from "./pane-parc";
import { FenetreLotProvider, BoutonLot } from "@/components/fenetre-lot";
import { EchecLecture } from "./echec-lecture";

export const metadata = { title: "Parc — Gerimmo" };

type LotResume = {
  id: string;
  nom: string;
  etat: string;
  surface_m2: number | null;
};

// Un lot concerné par un motif de blocage, avec de quoi construire son lien :
// le message d'ORIGINE de la base, pas l'étiquette raccourcie de l'affichage.
type LotBloque = {
  lotId: string;
  bienId: string;
  nom: string;
  message: string;
};

// Le parc de l'agence : chaque bien et ses lots (RM-0.1.2 : tout bien a au
// moins un lot ; le multi-lots reste discret tant qu'on ne découpe pas).
export default async function PageParc(props: PageProps<"/agence/[orgId]/parc">) {
  const { orgId } = await props.params;
  // Un BIEN sélectionné (?sel=bien:…) s'ouvre dans le panneau de droite ;
  // sans sélection, la vue d'ensemble. Un LOT, lui, ouvre depuis le 12/09 la
  // FENÊTRE — sur place, sans aller-retour serveur, parce que c'est le geste
  // le plus répété de la journée d'un agent. `?sel=lot:…` reste honoré : des
  // écrans y mènent déjà (les « à renseigner » d'un document généré), et la
  // fenêtre s'ouvre alors d'elle-même à l'arrivée.
  const { sel } = (await props.searchParams) as { sel?: string | string[] };
  const selection = lireSelection(sel);
  // Deux destinations désormais : le panneau pour un bien, la fenêtre pour un
  // lot. `selectionBien` est ce qui reste au panneau ; `lotInitial` est ce que
  // la fenêtre ouvre d'elle-même à l'arrivée.
  const selectionBien =
    selection?.type === "bien" ? { type: "bien" as const, id: selection.id } : null;
  const lotInitial = selection?.type === "lot" ? selection.id : null;
  const { supabase, user, role, estProprietaire } = await verifierAccesEspace(orgId);
  // « Mon portefeuille » (RM-18.1.3) : l'agent ne voit que les lots des
  // mandats qui lui sont confiés — null : il voit tout.
  const portefeuille = await lotsDuPortefeuille(supabase, orgId, role, user.id);

  const [
    { data: biens, error: erreurBiens },
    { data: equipements, error: erreurEquipements },
    { data: bauxActifs, error: erreurBaux },
    { data: blocagesParc, error: erreurBlocages },
  ] = await Promise.all([
    supabase
      .from("biens")
      // !lots_bien_id_fkey : depuis les FK composites (revue 2), deux relations
      // lient lots à biens — sans ce choix explicite, PostgREST refuse la jointure
      .select(
        "id, nom, type, address_line1, postal_code, city, lots!lots_bien_id_fkey(id, nom, etat, surface_m2)"
      )
      .eq("organization_id", orgId)
      .order("nom"),
    supabase
      .from("equipements_catalogue")
      .select("id, nom, actif")
      .eq("organization_id", orgId)
      .order("nom"),
    // Aperçu (maquette) : le quittancement mensuel des baux en cours
    supabase
      .from("baux")
      .select("loyer_hc, charges, lot_id")
      .eq("organization_id", orgId)
      .in("etat", ["actif", "preavis"]),
    // Motifs de blocage de tous les lots en préparation, en un aller-retour (perf 30/08)
    supabase.rpc("lots_blocages_location", { p_org: orgId }),
  ]);

  const biensVisibles = (biens ?? [])
    .map((bien) => ({
      ...bien,
      lotsVisibles: (bien.lots as LotResume[]).filter(
        (l) => l.etat !== "archive" && (!portefeuille || portefeuille.has(l.id))
      ),
    }))
    .filter((bien) => bien.lotsVisibles.length > 0);
  const nbLots = biensVisibles.reduce((n, b) => n + b.lotsVisibles.length, 0);
  const nbLoues = biensVisibles.reduce(
    (n, b) => n + b.lotsVisibles.filter((l) => l.etat === "loue" || l.etat === "preavis").length,
    0
  );
  const tousLots = biensVisibles.flatMap((b) =>
    b.lotsVisibles.map((l) => ({ ...l, bien_id: b.id }))
  );
  const enPreparation = tousLots.filter((l) => l.etat === "brouillon");
  const disponibles = tousLots.filter((l) => l.etat === "disponible");
  const quittancement = (bauxActifs ?? [])
    .filter((b) => !portefeuille || portefeuille.has(b.lot_id as string))
    .reduce((s, b) => s + Number(b.loyer_hc) + Number(b.charges), 0);


  // « Éléments à compléter » (maquette) : les motifs de blocage de mise en
  // location, agrégés sur les lots en préparation, triés du plus fréquent.
  //
  // Relevé du 11/09 : la carte annonçait « traitez ce qui bloque ci-dessous »
  // puis n'offrait pas un seul lien, alors que la RPC renvoie déjà le lot_id —
  // que l'agrégation jetait. Chaque motif garde désormais ses lots ET le
  // message d'origine de la base : `cibleBlocage` teste ce texte brut
  // (« erp », « surface », « détention »…), jamais l'étiquette raccourcie —
  // agréger sur la seule étiquette renverrait tous les liens sur le cas par
  // défaut « Mettre à jour les diagnostics ».
  const lotsConnus = new Map(tousLots.map((l) => [l.id, l]));
  const parMotif = new Map<string, LotBloque[]>();
  for (const ligne of (blocagesParc ?? []) as {
    lot_id: string;
    blocages: string[] | null;
  }[]) {
    // Un lot hors du portefeuille de l'agent n'est ni listé à gauche ni
    // ouvrable : le compter ici gonflait « X au total » de lignes invisibles,
    // et la carte ne pourrait de toute façon pas y mener (RM-18.1.3).
    const lot = lotsConnus.get(ligne.lot_id);
    if (!lot) continue;
    for (const message of ligne.blocages ?? []) {
      // Un diagnostic est compté avec son niveau de rattachement (« au lot » /
      // « à l'immeuble ») — même étiquette que les fiches bien et lot.
      const cle = etiqueterNiveau(resumerBlocage(message), message);
      const lots = parMotif.get(cle) ?? [];
      // `resumerBlocage` ramène plusieurs messages de la base à une même
      // étiquette : un DPE à la fois classe G ET périmé en produit deux, qui se
      // lisent tous deux « DPE absent ». Un lot n'est retenu qu'une fois par
      // motif — sinon la carte alignait deux pastilles identiques pour lui.
      if (lots.some((x) => x.lotId === lot.id)) continue;
      lots.push({ lotId: lot.id, bienId: lot.bien_id, nom: lot.nom, message });
      parMotif.set(cle, lots);
    }
  }
  const motifsTries = [...parMotif.entries()].sort((a, b) => b[1].length - a[1].length);
  const totalBlocages = motifsTries.reduce((s, [, lots]) => s + lots.length, 0);
  const maxMotif = Math.max(1, ...motifsTries.map(([, lots]) => lots.length));

  // Un parc illisible ressemble trait pour trait à un parc vide : sans ce
  // relevé, l'écran invitait à « créer votre premier bien » à une agence qui
  // en a trente (relevé du 11/09).
  const echecs: string[] = [];
  const noter = (libelle: string, erreur: unknown) => {
    if (erreur) echecs.push(libelle);
  };
  noter("les biens et leurs lots", erreurBiens);
  noter("le catalogue d’équipements", erreurEquipements);
  noter("les baux en cours", erreurBaux);
  noter("les éléments qui bloquent la mise en location", erreurBlocages);

  return (
    // Le fournisseur enveloppe l'écran : chaque rang de lot y puise de quoi
    // ouvrir la fenêtre, et la fenêtre se monte au-dessus de tout.
    <FenetreLotProvider orgId={orgId} lotInitial={lotInitial} estProprietaire={estProprietaire}>
      <main className="mx-auto w-full max-w-5xl p-4 sm:p-7">
      <div className="entete-page">
        <h1>
          {estProprietaire
            ? "Mes lots"
            : role === "agent"
              ? "Mon portefeuille"
              : "Parc de l'agence"}
        </h1>
        <div className="flex flex-wrap items-center gap-4">
          {/* Plus de préfixe « Mon portefeuille · » (24/09) : il répétait le
              titre posé sur la même ligne, et l'entrée active du menu. */}
          <span className="mono-discret">
            {biensVisibles.length} bien{biensVisibles.length > 1 ? "s" : ""} · {nbLots} lot
            {nbLots > 1 ? "s" : ""}
          </span>
          {/* Charte 04 : un seul bouton principal par écran. Sur un parc vide,
              c'est celui de l'état vide qui porte l'appel à l'action.
              L'AGENT AUSSI AJOUTE UN BIEN, depuis le 12/09. Le bouton lui était
              masqué parce que la base refusait la création : un bien tout neuf
              n'est sous aucun mandat, donc hors du portefeuille de tout le
              monde, et la relecture qui suit l'insertion échouait. C'était la
              règle qui était fausse, pas le geste — ce que personne ne gère
              appartient à l'agence. */}
          {biensVisibles.length > 0 && (
            <>
              {/* « Reprendre un parc » N'EST PAS OFFERT À UN AGENT : la page
                  d'import le refuse (`notFound`), parce qu'un import engage
                  tout le parc et appartient au responsable. Le lien, lui, était
                  montré à tout le monde — un agent le voyait, cliquait, et
                  tombait sur « page introuvable » (relevé au balayage des
                  boutons, 12/09). Un chemin qu'on propose doit mener quelque
                  part : on aligne le lien sur la garde, pas l'inverse. */}
              {/* Le lien porte le titre de l'écran qu'il ouvre (24/09) :
                  « Importer mes lots » pour le propriétaire, « Reprendre le
                  parc » pour l'agence. */}
              {ROLES_RESPONSABLES.includes(role) && (
                <Link
                  href={`/agence/${orgId}/parc/import`}
                  className="lien-discret text-[13px]"
                >
                  {estProprietaire ? "Importer mes lots" : "Reprendre le parc"}
                </Link>
              )}
              <Link href={`/agence/${orgId}/parc/nouveau`} className="btn-or">
                + Ajouter un bien
              </Link>
            </>
          )}
        </div>
      </div>

      <EchecLecture quoi={echecs} />

      {/* Parc illisible : ni liste ni état vide — l'encart ci-dessus a déjà dit
          pourquoi, et proposer « créer mon premier bien » serait un mensonge. */}
      {erreurBiens ? null : biensVisibles.length === 0 ? (
        // État vide de la charte (.vide-guide) : ce qu'il n'y a pas, pourquoi,
        // et le geste qui le remplit — à la place d'un .vide remonté à la main.
        <div className="vide-guide">
          {portefeuille ? (
            // L'AGENT N'EST PLUS DANS UNE IMPASSE. Cet écran lui disait
            // d'attendre un mandat, sans un seul geste à faire — c'est
            // exactement ce que l'humain a rencontré le 12/09. Il peut
            // enregistrer un bien lui-même ; les mandats, eux, restent le
            // geste de l'administrateur.
            <>
              <p className="titre">Aucun lot ne vous est confié</p>
              <p className="explication">
                Votre portefeuille se remplit de deux façons : un mandat que
                l&apos;administrateur vous confie, ou un bien que vous
                enregistrez vous-même.
              </p>
              <div className="geste">
                <Link href={`/agence/${orgId}/parc/nouveau`} className="btn-or">
                  Ajouter un bien
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="titre">Votre parc est vide</p>
              <p className="explication">
                Commencez par un bien : son lot naît avec lui, et c&apos;est le lot
                qui portera le bail.
              </p>
              <div className="geste">
                <Link href={`/agence/${orgId}/parc/nouveau`} className="btn-or">
                  Créer mon premier bien
                </Link>
              </div>
              {/* Même garde que plus haut : la reprise appartient au
                  responsable. Un agent devant un portefeuille vide se voyait
                  proposer un chemin qui lui répond « page introuvable ». */}
              {ROLES_RESPONSABLES.includes(role) && (
                <p className="mt-3 text-[13px] text-muted-foreground">
                  Vous arrivez avec un parc déjà constitué ?{" "}
                  <Link href={`/agence/${orgId}/parc/import`} className="lien-discret">
                    Reprenez-le depuis un tableur
                  </Link>{" "}
                  — une ligne par lot, en une fois.
                </p>
              )}
            </>
          )}
        </div>
      ) : (
        // Maquette (charte v2) : maître-détail — la liste des lots regroupés
        // par bien à gauche (adresse en en-tête de groupe, lots indentés) ; à
        // droite la sélection (recette 30/08 : comme la maquette, on ne quitte
        // plus le Parc pour lire un bien ou un lot), sinon la vue d'ensemble.
        // Vue scindée mobile (socle 10/09) : `detail-actif` masque la liste
        // sous 900px quand une sélection existe — le détail remplace la liste
        // au lieu d'être rendu dessous, avec un lien retour en tête.
        // Colonne de liste portée à 380 px ICI seulement (24/09) : à 340 px,
        // adresse et nom du lot se coupaient ; à 400 px, les trois tuiles du
        // volet droit passaient sur deux rangées à 1280 px. Les autres vues
        // scindées (incidents, artisans, documents) gardent la règle commune.
        <div
          className={`split min-[901px]:grid-cols-[minmax(0,380px)_minmax(0,1fr)] ${selectionBien ? "detail-actif" : ""}`}
        >
          <div className="colonne-liste-split volet-liste">
            <div className="tete-liste">
              <span className="mono-discret">Lots</span>
              {selectionBien ? (
                <Link href={`/agence/${orgId}/parc`} className="lien-discret text-xs">
                  Vue d&apos;ensemble
                  <IndicateurLien />
                </Link>
              ) : (
                <span className="mono-discret">
                  {nbLoues}/{nbLots} loué{nbLoues > 1 ? "s" : ""}
                </span>
              )}
            </div>
            {biensVisibles.map((bien) => (
              <div key={bien.id}>
                <Link
                  href={`/agence/${orgId}/parc?sel=bien:${bien.id}`}
                  className={`tete-groupe${selectionBien?.id === bien.id ? " actif" : ""}`}
                >
                  {/* Deux lignes plutôt qu'une coupe (24/09) : l'adresse
                      perdait son code postal et sa ville — ce qui distingue
                      deux immeubles homonymes. Le texte entier en `title`. */}
                  <span className="min-w-0">
                    <b className="block truncate text-[13.5px] font-medium" title={bien.nom}>
                      {bien.nom}
                    </b>
                    <span
                      className="mono-discret line-clamp-2 normal-case"
                      title={`${TYPES_BIEN[bien.type] ?? bien.type} · ${bien.address_line1}, ${bien.postal_code} ${bien.city}`}
                    >
                      {TYPES_BIEN[bien.type] ?? bien.type} · {bien.address_line1},{" "}
                      {bien.postal_code} {bien.city}
                    </span>
                  </span>
                  <span className="puce puce-encre shrink-0">
                    {bien.lotsVisibles.filter((l) => l.etat === "loue" || l.etat === "preavis").length}
                    /{bien.lotsVisibles.length} loué
                    {bien.lotsVisibles.filter((l) => l.etat === "loue" || l.etat === "preavis")
                      .length > 1
                      ? "s"
                      : ""}
                  </span>
                  <IndicateurLien />
                </Link>
                {/* Le rang du lot n'est plus un lien : il OUVRE la fenêtre,
                    sur place. Hors fenêtre (navigateur sans JS), BoutonLot
                    retombe sur le lien vers la fiche complète. */}
                {bien.lotsVisibles.map((lot) => (
                  <BoutonLot
                    key={lot.id}
                    lotId={lot.id}
                    href={`/agence/${orgId}/parc/${bien.id}/lots/${lot.id}`}
                    className="rang-lot"
                  >
                    <span
                      className="line-clamp-2 min-w-0 flex-1 text-left text-[13px]"
                      title={lot.nom}
                    >
                      {lot.nom}
                      {lot.surface_m2 !== null && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {formaterSurface(lot.surface_m2)}
                        </span>
                      )}
                    </span>
                    <span
                      className={`${COULEURS_ETAT_LOT[lot.etat] ?? "puce puce-grise"} shrink-0`}
                    >
                      {ETATS_LOT[lot.etat] ?? lot.etat}
                    </span>
                  </BoutonLot>
                ))}
              </div>
            ))}
          </div>

          {selectionBien ? (
            <div className="min-w-0">
              {/* Visible sous 900px seulement (.retour-liste) : la liste est masquée */}
              <Link href={`/agence/${orgId}/parc`} className="retour-liste mb-2">
                ← Tous les lots
              </Link>
              <PaneParc supabase={supabase} orgId={orgId} selection={selectionBien} />
            </div>
          ) : (
          /* Des dossiers à ouvrir, puis les points de préparation vérifiés. */
          <div className="min-w-0 space-y-3.5">
            {/* Sous 900px la liste est au-dessus et rien ne s'ouvre « ici » :
                l'invite ne parle qu'à la vue scindée (même règle que les
                incidents ; tour du 24/09). */}
            {/* Un lot s'ouvre dans une fenêtre, seul un bien se lit « ici »
                (24/09) ; et « ce qui bloque ci-dessous » ne se dit que s'il y
                a quelque chose dessous. */}
            <p className="text-sm text-muted-foreground max-[900px]:hidden">
              Sélectionnez un bien pour le lire ici ; un lot s&apos;ouvre dans une
              fenêtre.
              {!erreurBlocages && totalBlocages > 0 && " Ce qui bloque la mise en location se traite ci-dessous."}
            </p>
            {/* `grille-kpi` compte ses colonnes d'après la place dont elle
                dispose : ces tuiles vivent dans le volet droit d'une vue
                scindée, et `sm:grid-cols-3` y posait trois colonnes de 170 px
                où « QUITTANCEMENT » sortait du cadre (capture du 19/09).
                Le ton de chaque tuile est celui de la puce du même statut —
                vert « loué », ambre « en préparation », bleu pour l'argent —
                pour qu'une couleur vue ici se retrouve dans la liste. */}
            <div className="grille-kpi">
              <div className="kpi vert">
                <span className="eyebrow">En location</span>
                <span className="chiffre block">{nbLoues}</span>
                <span className="block text-xs text-muted-foreground">
                  {nbLoues} loué{nbLoues > 1 ? "s" : ""} sur {nbLots}
                </span>
              </div>
              <div className={`kpi${!erreurBlocages && totalBlocages > 0 ? " ambre" : ""}`}>
                <span className="eyebrow">En préparation</span>
                <span className="chiffre block">{enPreparation.length}</span>
                <span className="block text-xs text-muted-foreground">
                  {/* Ce compteur agrège les BLOCAGES de mise en location (dont
                      les diagnostics, chacun à son niveau) — pas les compteurs
                      « manquants » des fiches, qui couvrent aussi le non bloquant. */}
                  {/* Même mot que la fiche bien : « à régler » (24/09) */}
                  {erreurBlocages
                    ? "blocages non lus"
                    : totalBlocages === 0
                      ? "rien à régler"
                      : `${totalBlocages} élément${totalBlocages > 1 ? "s" : ""} à régler`}
                </span>
              </div>
              <div className="kpi bleu">
                {/* Le mot du menu, pas le jargon d'agence (24/09) */}
                <span className="eyebrow">Loyers &amp; charges</span>
                <span className="chiffre block">
                  {erreurBaux ? "—" : eur(quittancement)}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {erreurBaux ? "montants indisponibles" : "par mois, baux en cours"}
                </span>
              </div>
            </div>
            {/* TOUT EST LOUÉ (24/09) : les deux cartes ci-dessous n'avaient
                alors rien à dire (« 0 disponible », « 0 au total »), ne
                menaient nulle part et s'étiraient à la hauteur l'une de
                l'autre. Une phrase, et le seul geste qui reste. */}
            {disponibles.length === 0 && enPreparation.length === 0 ? (
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    {estProprietaire
                      ? "Tous vos lots sont loués"
                      : portefeuille
                        ? "Tout votre portefeuille est loué"
                        : "Tout le parc est loué"}{" "}
                    : aucun lot à préparer ni à remettre en location.
                  </p>
                  <Link
                    href={`/agence/${orgId}/parc/nouveau`}
                    className={buttonVariants({ variant: "outline", size: "sm", className: "pointer-coarse:min-h-10" })}
                  >
                    + Ajouter un bien
                  </Link>
                </CardContent>
              </Card>
            ) : (
            // `items-start` : une carte courte ne s'étire plus à la hauteur de
            // sa voisine (jusqu'à 330 px de vide sous trois lignes, 24/09).
            <div className="grille-cartes items-start">
              <Card>
                <CardContent>
                  <div className="entete-carte">
                    <h2 className="text-[length:var(--pas-sous-titre)]">Prochaines mises en location</h2>
                    <span className="mono-discret">{disponibles.length} disponible{disponibles.length > 1 ? "s" : ""}</span>
                  </div>
                  {disponibles.length > 0 ? (
                    <p className="mb-3 text-sm text-muted-foreground">
                      Ouvrez la fiche pour vérifier les diagnostics, les propriétaires
                      et préparer le bail. Le statut disponible ne garantit pas que le
                      dossier est à jour.
                    </p>
                  ) : (
                    // Une phrase nue renvoyait aux lots en préparation sans y
                    // mener (24/09) : le lien y mène.
                    <p className="text-sm text-muted-foreground">
                      Aucun lot disponible pour l&apos;instant.{" "}
                      <a href="#preparer-lots" className="lien-discret text-[13px]">
                        Voir {enPreparation.length > 1 ? `les ${enPreparation.length} lots` : "le lot"} en
                        préparation&nbsp;→
                      </a>
                    </p>
                  )}
                  <div className="space-y-2">
                    {disponibles.slice(0, 3).map((lot) => (
                      <Link key={lot.id} href={`/agence/${orgId}/parc/${lot.bien_id}/lots/${lot.id}`} className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted">
                        <span className="min-w-0">{lot.nom}</span><span aria-hidden>→</span>
                      </Link>
                    ))}
                    {disponibles.length > 3 && <p className="text-xs text-muted-foreground">{disponibles.length - 3} autre{disponibles.length > 4 ? "s" : ""} lot{disponibles.length > 4 ? "s" : ""} disponible{disponibles.length > 4 ? "s" : ""} dans la liste du parc.</p>}
                  </div>
                </CardContent>
              </Card>
              <Card id="preparer-lots" className="scroll-mt-20">
                <CardContent>
                  <div className="entete-carte">
                    <h2 className="text-[length:var(--pas-sous-titre)]">Préparer les nouveaux lots</h2>
                    {/* « au total » ne se rattachait à rien : même mot que la
                        tuile et la fiche bien (24/09). */}
                    {!erreurBlocages && (
                      <span className="mono-discret">
                        {totalBlocages === 0 ? "rien à régler" : `${totalBlocages} à régler`}
                      </span>
                    )}
                  </div>
                  {erreurBlocages ? (
                    // « Rien à compléter » est un verdict : on ne le rend pas
                    // sur une lecture qui a échoué.
                    <p className="text-sm text-muted-foreground">
                      Liste indisponible — voir le message en haut de page.
                    </p>
                  ) : motifsTries.length === 0 ? (
                    <p className="text-sm text-success-soft-foreground">
                      {enPreparation.length === 0
                        ? "Aucun lot en préparation. Vérifiez les lots disponibles avant chaque nouveau bail."
                        : "Aucun blocage relevé sur les lots en préparation. Ouvrez leur fiche pour poursuivre la mise en location."}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {motifsTries.map(([motif, lots]) => (
                        <div key={motif}>
                          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                            <span className="min-w-0 truncate">{motif}</span>
                            <span className="mono-discret">{lots.length}</span>
                          </div>
                          <span className="barre block" style={{ height: 7 }}>
                            <i
                              style={{
                                width: `${Math.round((lots.length / maxMotif) * 100)}%`,
                                background: "var(--warning)",
                              }}
                            />
                          </span>
                          <LotsDuMotif orgId={orgId} lots={lots} />
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
            )}
          </div>
          )}
        </div>
      )}

      {/* Le dépliage de la charte (`information-depliable`, 24/09) : chevron
          maison au lieu du triangle natif, et plus de titre répété à
          l'ouverture — le résumé EST le titre. Sur téléphone, le sous-titre
          forme sa propre ligne au lieu de se couper après « futurs ». */}
      <details className="information-depliable mt-8 rounded-xl border border-border bg-card">
        <summary className="px-5 py-2 text-sm">
          <span className="min-w-0">
            Catalogue d’équipements
            <span className="block text-xs font-normal text-muted-foreground sm:ml-2 sm:inline">
              Préparer les futurs états des lieux
            </span>
          </span>
          <span aria-hidden className="information-chevron">⌄</span>
        </summary>
      <Card className="border-0 pt-1 shadow-none">
        <CardHeader>
          <CardDescription>
            {estProprietaire ? "Votre liste" : "La liste de l'agence"}, cochée
            ensuite sur chaque lot — elle prépare la grille d&apos;état des lieux.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {erreurEquipements ? null : (equipements ?? []).length === 0 ? (
            // Un état vide doit dire quoi faire, ou à qui s'adresser quand on ne
            // peut pas le faire soi-même.
            <p className="text-sm text-muted-foreground">
              {["admin_agence", "proprietaire_direct"].includes(role)
                ? "Le catalogue est vide. Ajoutez un premier équipement ci-dessous : il sera proposé sur tous les lots."
                : "Le catalogue est vide. Un administrateur de l'agence peut le remplir."}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(equipements ?? []).map((e) => (
                <span
                  key={e.id}
                  className={`puce ${e.actif ? "puce-encre" : "puce-grise line-through"}`}
                >
                  {e.nom}
                </span>
              ))}
            </div>
          )}
          {["admin_agence", "proprietaire_direct"].includes(role) && (
            <FormulaireEquipementCatalogue orgId={orgId} />
          )}
        </CardContent>
      </Card>
      </details>
      </main>
    </FenetreLotProvider>
  );
}

// Les lots concernés par un motif, chacun menant à l'endroit qui le lève
// (`cibleBlocage`). Repliés au-delà de trois : la carte doit rester une carte.
// Le libellé de l'action vit dans l'aria-label — la pastille, elle, n'affiche
// que le nom du lot, seul élément qui distingue les liens entre eux.
function LotsDuMotif({ orgId, lots }: { orgId: string; lots: LotBloque[] }) {
  const lien = (l: LotBloque) => {
    const cible = cibleBlocage(l.message, {
      orgId,
      bienId: l.bienId,
      lotId: l.lotId,
    });
    return (
      <Link
        key={l.lotId}
        href={cible.href}
        aria-label={`${cible.libelle} — ${l.nom}`}
        className="puce puce-grise max-w-full hover:underline"
      >
        <span className="min-w-0 truncate">{l.nom}</span>
        <span aria-hidden>→</span>
      </Link>
    );
  };
  const visibles = lots.slice(0, 3);
  const reste = lots.slice(3);
  return (
    <div className="mt-1.5 space-y-1.5">
      <div className="flex flex-wrap gap-1.5">{visibles.map(lien)}</div>
      {reste.length > 0 && (
        // UNE PASTILLE QUI SE DÉPLIE (24/09), et non une légende grise de
        // 11 px, identique au « 68 au total » qui, lui, ne se clique pas :
        // rien n'indiquait qu'elle cachait quatorze liens. Chevron qui
        // tourne à l'ouverture, cible tactile de la règle maison.
        <details className="group">
          <summary className="puce puce-grise cursor-pointer list-none pointer-coarse:min-h-[var(--cible-tactile)] [&::-webkit-details-marker]:hidden">
            + {reste.length} autre{reste.length > 1 ? "s" : ""} lot
            {reste.length > 1 ? "s" : ""}
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              width="12"
              height="12"
              className="transition-transform group-open:rotate-180 motion-reduce:transition-none"
            >
              <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <div className="mt-1.5 flex flex-wrap gap-1.5">{reste.map(lien)}</div>
        </details>
      )}
    </div>
  );
}
