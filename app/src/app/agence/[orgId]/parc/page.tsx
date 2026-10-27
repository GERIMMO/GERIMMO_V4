import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, MapPin } from "lucide-react";
import { TitreEcran } from "@/components/titre-ecran";
import { BoutonResumeBien } from "@/components/resume-bien";
import { verifierAccesEspace } from "@/lib/espace";
import { lotsDuPortefeuille } from "@/lib/portefeuille";
import { boutonPremierBien, doitLireLeProfilBailleur, elementsManquantsDuBailleur } from "@/lib/profil-bailleur";
import { ROLES_RESPONSABLES, eur } from "@/lib/ged";
import { avancementLot } from "@/lib/avancement-lot";
import { AvancementLot } from "@/components/avancement-lot";
import { resumerBlocage } from "@/lib/echeances";
import { etiqueterNiveau } from "@/lib/diagnostics";
import {
  TYPES_BIEN,
  ETATS_LOT,
  COULEURS_ETAT_LOT,
  formaterSurface,
} from "@/lib/parc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { IndicateurLien } from "@/components/ui/indicateur-lien";
import { FormulaireEquipementCatalogue } from "./formulaire-equipement-catalogue";
import { PaneParc, lireSelection } from "./pane-parc";
import { FenetreLotProvider, BoutonLot } from "@/components/fenetre-lot";
import { EchecLecture } from "./echec-lecture";
import styles from "./liste-lots.module.css";
import { baseEspace } from "@/lib/racine-espace";
import { chargerBauxActifsDuParc, chargerChambresDuParc, chargerPatrimoineDuParc, verifierLectureDuParc, totalLoyersDuParc } from "@/lib/locations-parc";
import { occupationLot } from "@/lib/occupation-lot";
import { VueParcProprietaire } from "./vue-parc-proprietaire";

export const metadata = { title: "Parc — Gerimmo" };

type LotResume = {
  id: string;
  nom: string;
  etat: string;
  surface_m2: number | null;
  pieces: number | null;
  identifiant_fiscal: string | null;
  chauffage: string | null;
  eau_chaude: string | null;
  locaux_privatifs: string | null;
  description: string | null;
  meuble: boolean;
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
  // Décision D27 : les écrans du propriétaire direct vivent sous /espace/<id>, ceux des agences sous /agence/<id>.
  const base = baseEspace(orgId, estProprietaire);
  // « Mon portefeuille » (RM-18.1.3) : l'agent ne voit que les lots des
  // mandats qui lui sont confiés — null : il voit tout.
  const portefeuille = await lotsDuPortefeuille(supabase, orgId, role, user.id);

  const [
    { data: biens, error: erreurBiens },
    { data: equipements, error: erreurEquipements },
    { data: bauxActifs, error: erreurBaux },
    { data: blocagesParc, error: erreurBlocages },
    { data: detentions, error: erreurDetentions },
    { data: diagnostics, error: erreurDiagnostics },
    { data: pieces, error: erreurPieces },
    { data: chambres, error: erreurChambres },
  ] = await Promise.all([
    estProprietaire ? chargerPatrimoineDuParc(supabase, orgId) : supabase
      .from("biens")
      // !lots_bien_id_fkey : depuis les FK composites (revue 2), deux relations
      // lient lots à biens — sans ce choix explicite, PostgREST refuse la jointure
      .select(
        "id, nom, type, address_line1, postal_code, city, archived_at, lots!lots_bien_id_fkey(id, nom, etat, surface_m2, pieces, identifiant_fiscal, chauffage, eau_chaude, locaux_privatifs, description, meuble)"
      )
      .eq("organization_id", orgId)
      .order("nom"),
    supabase
      .from("equipements_catalogue")
      .select("id, nom, actif")
      .eq("organization_id", orgId)
      .order("nom"),
    chargerBauxActifsDuParc(supabase, orgId),
    // Motifs de blocage de tous les lots en préparation, en un aller-retour (perf 30/08)
    supabase.rpc("lots_blocages_location", { p_org: orgId }),
    verifierLectureDuParc(supabase.from("detentions").select("lot_id, quote_part", { count: "exact" }).eq("organization_id", orgId).is("date_fin", null), estProprietaire),
    verifierLectureDuParc(supabase.from("diagnostics").select("lot_id, bien_id, type, date_expiration, classe_dpe", { count: "exact" }).eq("organization_id", orgId).is("archived_at", null), estProprietaire),
    verifierLectureDuParc(supabase.from("lot_pieces").select("lot_id", { count: "exact" }).eq("organization_id", orgId), estProprietaire),
    chargerChambresDuParc(supabase, orgId),
  ]);

  // Les anciens liens de sélection rejoignent aussi la fiche propriétaire.
  // Le choix est résolu depuis les données autorisées, jamais depuis un id arbitraire.
  if (estProprietaire && selection && !erreurBiens) {
    const bien = (biens ?? []).find(item => selection.type === "bien" ? item.id === selection.id : (item.lots as LotResume[]).some(lot => lot.id === selection.id));
    if (bien) redirect(selection.type === "bien" ? `${base}/parc/${bien.id}` : `${base}/parc/${bien.id}/lots/${selection.id}`);
  }

  // Un bien RETIRÉ (archivé, 27/09) quitte le parc et l'abonnement : il ne
  // se liste plus avec les autres, mais reste joignable (« Biens retirés »,
  // en fin de liste) — on archive, on ne fait pas disparaître.
  const biensRetires = (biens ?? []).filter((b) => b.archived_at);
  const biensVisibles = (biens ?? [])
    .filter((bien) => !bien.archived_at)
    .map((bien) => ({
      ...bien,
      lotsVisibles: (bien.lots as LotResume[]).filter(
        (l) => l.etat !== "archive" && (!portefeuille || portefeuille.has(l.id))
      ),
    }))
    // UN BIEN SANS LOT VISIBLE RESTE LISTÉ (25/09, D01) : l'abonnement le
    // facturait, l'accueil le comptait (« 2 biens »), et Mes lots n'en montrait
    // qu'un — le second n'existait nulle part où l'on puisse agir. Seul le
    // portefeuille d'un agent le masque encore : hors de ses mandats, il ne
    // peut rien en faire (RM-18.1.3).
    .filter((bien) => bien.lotsVisibles.length > 0 || !portefeuille);
  const nbLots = biensVisibles.reduce((n, b) => n + b.lotsVisibles.length, 0);
  const nbLoues = biensVisibles.reduce(
    (n, b) => n + b.lotsVisibles.filter((l) => l.etat === "loue" || l.etat === "preavis").length,
    0
  );
  // Le lot se nomme AVEC son bien (audit 27/09) : plusieurs « Lot unique → »
  // identiques ne se distinguaient pas dans les cartes de préparation.
  const tousLots = biensVisibles.flatMap((b) =>
    b.lotsVisibles.map((l) => ({ ...l, bien_id: b.id, nomComplet: `${b.nom} · ${l.nom}` }))
  );
  const enPreparation = tousLots.filter((l) => l.etat === "brouillon");
  const disponibles = tousLots.filter((l) => l.etat === "disponible");
  const lotsConnus = new Set(tousLots.map(l => l.id));
  const quittancement = estProprietaire ? totalLoyersDuParc(bauxActifs ?? [], lotsConnus) : (bauxActifs ?? [])
    .filter(b => !portefeuille || portefeuille.has(b.lot_id))
    .reduce((s, b) => s + Number(b.loyer_hc) + Number(b.charges), 0);

  const totalBlocages = (blocagesParc ?? []).filter((l: { lot_id: string }) => lotsConnus.has(l.lot_id))
    .reduce((n: number, l: { blocages: string[] | null }) => n + new Set((l.blocages ?? []).map(message => etiqueterNiveau(resumerBlocage(message), message))).size, 0);
  const progressions = new Map(biensVisibles.flatMap(bien => bien.lotsVisibles.map(lot => [lot.id, avancementLot({
    lot, bien,
    quoteParts: erreurDetentions ? null : (detentions ?? []).filter(d => d.lot_id === lot.id).reduce((n, d) => n + Number(d.quote_part), 0),
    pieces: erreurPieces || erreurChambres ? null : [...(pieces ?? []), ...(chambres ?? [])].filter(p => p.lot_id === lot.id).length,
    diagnosticsLot: erreurDiagnostics ? null : (diagnostics ?? []).filter(d => d.lot_id === lot.id),
    diagnosticsBien: erreurDiagnostics ? null : (diagnostics ?? []).filter(d => d.bien_id === bien.id),
  })] as const)));

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
  noter("les propriétaires des lots", erreurDetentions);
  noter("les diagnostics des lots", erreurDiagnostics);
  noter("les pièces des lots", erreurPieces);
  noter("les chambres en colocation", erreurChambres);

  // D29 B (fiche DES-A-11) : l'adresse reste facultative à l'inscription du propriétaire, mais « Créer un lot »
  // lui demande d'abord de compléter son profil. Sur un parc VIDE, le bouton le dit d'avance au lieu de promettre
  // « Créer mon premier bien » puis d'ouvrir un écran d'attente. Même règle, même porte que « Créer un lot »
  // (lib/profil-bailleur.ts, où se décident aussi quand lire le profil et quel bouton montrer). Une lecture en
  // échec ne change rien : le bouton habituel, et la porte décide.
  let manquantsBailleur: string[] = [];
  let profilIllisible = false;
  if (doitLireLeProfilBailleur({
    role,
    erreurBiens: Boolean(erreurBiens),
    portefeuille: Boolean(portefeuille),
    nbBiensVisibles: biensVisibles.length,
    nbBiensRetires: biensRetires.length,
  })) {
    const { data: profil, error: erreurProfil } = await supabase.from("organizations")
      .select("address_line1,postal_code,city,email_contact")
      .eq("id", orgId).maybeSingle();
    profilIllisible = Boolean(erreurProfil);
    manquantsBailleur = elementsManquantsDuBailleur(profil);
  }
  const premierBien = boutonPremierBien({ base, manquants: manquantsBailleur, erreurLecture: profilIllisible });

  return (
    // Le fournisseur enveloppe l'écran : chaque rang de lot y puise de quoi
    // ouvrir la fenêtre, et la fenêtre se monte au-dessus de tout.
    <FenetreLotProvider orgId={orgId} lotInitial={lotInitial} estProprietaire={estProprietaire}>
      <main className="mx-auto w-full max-w-5xl p-4 sm:p-7">
      <div className="entete-page">
        <TitreEcran rubrique="lots">
          {estProprietaire
            ? "Biens & locations"
            : role === "agent"
              ? "Mon portefeuille"
              : "Parc de l'agence"}
        </TitreEcran>
        <div className="flex flex-wrap items-center gap-4">
          {/* Plus de préfixe « Mon portefeuille · » (24/09) : il répétait le
              titre posé sur la même ligne, et l'entrée active du menu. */}
          {!estProprietaire && <span className="mono-discret">
            {biensVisibles.length} bien{biensVisibles.length > 1 ? "s" : ""} · {nbLots} lot
            {nbLots > 1 ? "s" : ""}
          </span>}
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
                  href={`${base}/parc/import`}
                  className="lien-discret text-[13px]"
                >
                  {estProprietaire ? "Importer mes lots" : "Reprendre le parc"}
                </Link>
              )}
              <Link href={`${base}/parc/nouveau`} className="btn-or">
                + Ajouter un bien
              </Link>
            </>
          )}
        </div>
      </div>

      <EchecLecture quoi={echecs} />

      {/* Parc illisible : ni liste ni état vide — l'encart ci-dessus a déjà dit
          pourquoi, et proposer « créer mon premier bien » serait un mensonge. */}
      {erreurBiens ? null : biensVisibles.length === 0 && biensRetires.length === 0 ? (
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
                <Link href={`${base}/parc/nouveau`} className="btn-or">
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
                <Link href={premierBien.href} className="btn-or">
                  {premierBien.libelle}
                </Link>
              </div>
              {/* Même garde que plus haut : la reprise appartient au
                  responsable. Un agent devant un portefeuille vide se voyait
                  proposer un chemin qui lui répond « page introuvable ». */}
              {ROLES_RESPONSABLES.includes(role) && (
                <p className="mt-3 text-[13px] text-muted-foreground">
                  Vous arrivez avec un parc déjà constitué ?{" "}
                  <Link href={`${base}/parc/import`} className="lien-discret">
                    Reprenez-le depuis un tableur
                  </Link>{" "}
                  — une ligne par lot, en une fois.
                </p>
              )}
              {biensRetires.length > 0 && (
                <p className="mt-3 text-[13px] text-muted-foreground">
                  Biens retirés&nbsp;:{" "}
                  {biensRetires.map((bien, i) => (
                    <span key={bien.id}>
                      {i > 0 && ", "}
                      <Link href={`${base}/parc/${bien.id}`} className="lien-discret">
                        {bien.nom}
                      </Link>
                    </span>
                  ))}
                </p>
              )}
            </>
          )}
        </div>
      ) : estProprietaire ? (
        <VueParcProprietaire lectureLocations={!erreurBaux && !erreurChambres} loyers={erreurBaux ? null : quittancement}
          biens={biensVisibles.map(bien => ({
            id: bien.id, nom: bien.nom, adresse: [bien.address_line1, [bien.postal_code, bien.city].filter(Boolean).join(" ")].filter(Boolean).join(", "), href: `${base}/parc/${bien.id}`,
            lots: bien.lotsVisibles.map(lot => {
              const locations = (bauxActifs ?? []).filter(bail => bail.lot_id === lot.id);
              const prochain = progressions.get(lot.id)?.prochain;
              return { id: lot.id, nom: lot.nom === "Lot unique" ? bien.nom : lot.nom, etat: lot.etat, surface: lot.surface_m2, meuble: lot.meuble,
                href: `${base}/parc/${bien.id}/lots/${lot.id}`,
                locataires: locations.flatMap(bail => { const personne = bail.locataire as unknown as { nom: string; prenom: string | null } | null; return personne ? [[personne.prenom, personne.nom].filter(Boolean).join(" ")] : []; }),
                loyer: erreurBaux ? null : totalLoyersDuParc(locations, lotsConnus),
                occupation: erreurBaux || erreurChambres ? null : occupationLot((chambres ?? []).filter(chambre => chambre.lot_id === lot.id), locations),
                aCompleter: prochain ? { titre: prochain.titre, ancre: prochain.ancre } : null,
              };
            }),
          }))}
          retires={biensRetires.map(bien => ({ id: bien.id, nom: bien.nom, href: `${base}/parc/${bien.id}` }))} />
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
          <div className={`colonne-liste-split volet-liste ${estProprietaire ? styles.liste : ""}`} id="liste-lots">
            <div className="tete-liste">
              <span className="mono-discret">Lots</span>
              {selectionBien ? (
                <Link href={`${base}/parc`} className="lien-discret text-xs">
                  Vue d&apos;ensemble
                  <IndicateurLien />
                </Link>
              ) : (
                <span className="mono-discret">
                  {nbLoues}/{nbLots} loué{nbLoues > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className={estProprietaire ? styles.cartes : undefined}>
            {biensVisibles.map((bien) => (
              <div key={bien.id} className={estProprietaire ? styles.groupe : undefined}>
                {bien.lotsVisibles.length === 0 && (
                  <BoutonResumeBien orgId={orgId} bien={bien} className={estProprietaire ? styles.carte : "rang-lot"}>
                    {estProprietaire ? <IdentiteLotListe nom={bien.nom} bien={bien} surface={null} /> : (
                    <span className="min-w-0 flex-1 text-left text-[13px]">
                      <b className="block break-words font-medium">{bien.nom}</b>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {TYPES_BIEN[bien.type] ?? bien.type} · Surface non renseignée
                      </span>
                      <span className="mt-1 block break-words text-xs text-muted-foreground">
                        {bien.address_line1}, {bien.postal_code} {bien.city}
                      </span>
                    </span>
                    )}
                  </BoutonResumeBien>
                )}
                {bien.lotsVisibles.map((lot) => (
                  <BoutonLot
                    key={lot.id}
                    lotId={lot.id}
                    libelle={`${bien.nom} · ${lot.nom}`}
                    href={`${base}/parc/${bien.id}/lots/${lot.id}`}
                    className={estProprietaire ? styles.carte : "rang-lot"}
                    data-etat={lot.etat}
                  >
                    {estProprietaire ? <>
                      <IdentiteLotListe nom={lot.nom === "Lot unique" ? bien.nom : lot.nom} bien={bien} surface={lot.surface_m2} etat={lot.etat} />
                      <AvancementLot avancement={progressions.get(lot.id) ?? null} nom={lot.nom === "Lot unique" ? bien.nom : lot.nom} />
                    </> : (
                    <span className="min-w-0 flex-1 text-left text-[13px]">
                      <b className="block break-words font-medium">{lot.nom === "Lot unique" ? bien.nom : lot.nom}</b>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {TYPES_BIEN[bien.type] ?? bien.type} · {lot.surface_m2 !== null ? formaterSurface(lot.surface_m2) : "Surface non renseignée"}
                      </span>
                      <span className="mt-1 block break-words text-xs text-muted-foreground">
                        {bien.address_line1}, {bien.postal_code} {bien.city}
                      </span>
                      <AvancementLot avancement={progressions.get(lot.id) ?? null} nom={lot.nom === "Lot unique" ? bien.nom : lot.nom} />
                    </span>
                    )}
                  </BoutonLot>
                ))}
              </div>
            ))}
            {biensRetires.map((bien) => (
              <BoutonResumeBien
                key={bien.id}
                orgId={orgId}
                bien={bien}
                className={estProprietaire ? `${styles.carte} ${styles.retire} rang-lot-retire` : "rang-lot rang-lot-retire"}
              >
                {estProprietaire ? <IdentiteLotListe nom={bien.nom} bien={bien} surface={(bien.lots as LotResume[]).length === 1 ? (bien.lots as LotResume[])[0].surface_m2 : undefined} etat="archive" /> : (
                <span className="min-w-0 flex-1 text-left text-[13px]">
                  <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <b className="min-w-0 break-words font-medium">{bien.nom}</b>
                    <span className="lot-etiquette-archive">Archivé</span>
                  </span>
                  <span className="mt-1 block text-xs">
                    {TYPES_BIEN[bien.type] ?? bien.type}
                    {(bien.lots as LotResume[]).length === 1 && (bien.lots as LotResume[])[0].surface_m2 !== null && <> · {formaterSurface((bien.lots as LotResume[])[0].surface_m2)}</>}
                  </span>
                  <span className="mt-1 block break-words text-xs">{bien.address_line1}, {bien.postal_code} {bien.city}</span>
                </span>
                )}
              </BoutonResumeBien>
            ))}
            </div>
          </div>

          {selectionBien ? (
            <div className="min-w-0">
              {/* Visible sous 900px seulement (.retour-liste) : la liste est masquée */}
              <Link href={`${base}/parc`} className="retour-liste mb-2">
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
              Chaque barre indique l’avancement de la fiche du lot, indépendamment de son bail.
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
                  {/* Sans lot en préparation, « rien à régler » sonnait comme un
                      verdict sur tout le parc — alors qu'un lot disponible peut
                      encore bloquer (25/09, D03). On dit ce que compte la tuile. */}
                  {erreurBlocages
                    ? "blocages non lus"
                    : enPreparation.length === 0
                      ? "aucun lot en préparation"
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
                <CardContent>
                  {/* Le geste « + Ajouter un bien » est déjà dans l'en-tête de
                      la page : pas de doublon ici (deux liens identiques sur un
                      même écran, relevé du 24/09). */}
                  <p className="text-sm text-muted-foreground">
                    {estProprietaire
                      ? "Tous vos lots sont loués"
                      : portefeuille
                        ? "Tout votre portefeuille est loué"
                        : "Tout le parc est loué"}{" "}
                    : aucun lot à préparer ni à remettre en location.
                  </p>
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
                      <a href="#liste-lots" className="lien-discret text-[13px]">
                        Voir {enPreparation.length > 1 ? `les ${enPreparation.length} lots` : "le lot"} en
                        préparation&nbsp;→
                      </a>
                    </p>
                  )}
                  <div className="space-y-2">
                    {disponibles.slice(0, 3).map((lot) => (
                      <Link key={lot.id} href={`${base}/parc/${lot.bien_id}/lots/${lot.id}`} className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted">
                        <span className="min-w-0">{lot.nomComplet}</span><span aria-hidden>→</span>
                      </Link>
                    ))}
                    {disponibles.length > 3 && <p className="text-xs text-muted-foreground">{disponibles.length - 3} autre{disponibles.length > 4 ? "s" : ""} lot{disponibles.length > 4 ? "s" : ""} disponible{disponibles.length > 4 ? "s" : ""} dans la liste du parc.</p>}
                  </div>
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

function IdentiteLotListe({ nom, bien, surface, etat }: {
  nom: string;
  bien: { type: string; address_line1: string; postal_code: string; city: string };
  surface?: number | null;
  etat?: string;
}) {
  return <span className={styles.identite}>
    <span className={styles.entete}>
      <strong className={styles.nom}>{nom}</strong>
      <ChevronRight size={18} className={styles.chevron} aria-hidden="true" />
    </span>
    <span className={styles.details}>
      <span>{TYPES_BIEN[bien.type] ?? bien.type}{surface !== undefined && <> · {surface !== null ? formaterSurface(surface) : "Surface non renseignée"}</>}</span>
      {etat && <span className={etat === "archive" ? "lot-etiquette-archive" : COULEURS_ETAT_LOT[etat] ?? "puce puce-grise"}>{ETATS_LOT[etat] ?? etat}</span>}
    </span>
    <span className={styles.adresse}><MapPin size={14} aria-hidden="true" /><span>{[bien.address_line1, [bien.postal_code, bien.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</span></span>
  </span>;
}
