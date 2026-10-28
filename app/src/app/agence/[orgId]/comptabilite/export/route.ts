import { verifierAccesEspace } from "@/lib/espace";
import { lotsDuPortefeuille, PortefeuilleIndisponible } from "@/lib/portefeuille";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";
import { formaterDate } from "@/lib/ged";
import { neutraliserFormule } from "@/lib/csv-sur";
import { lireToutesLesPages, type EchecLecture, type PageLue } from "@/lib/lecture-complete";
import { LIMITE_LIGNES_AFFICHEE, LIMITE_LIGNES_API } from "@/lib/lectures-fiscales";

// Export CSV du journal de gestion (pas de FEC) — RM-A6 : mention « journal de gestion ».
//
// Le fichier est fait pour être ouvert dans un tableur français :
//   - séparateur point-virgule et BOM UTF-8, sinon Excel casse les accents ;
//   - montants à la virgule et à deux décimales, sinon la colonne est importée
//     en texte et l'agent ne peut pas la sommer ;
//   - le lot et le mandant en clair, sinon le journal ne se ventile pas.



type LigneBrute = {
  date_piece: string;
  date_imputation: string;
  categorie: string;
  sens: string;
  montant: number | string;
  libelle: string | null;
  systeme: boolean;
  id: string;
  contre_ecriture_de: string | null;
  lot_id: string | null;
  lot: UnOuPlusieurs<{ nom: string; bien: UnOuPlusieurs<{ nom: string | null }> }>;
  mandat: UnOuPlusieurs<{ person: UnOuPlusieurs<{ nom: string; prenom: string | null }> }>;
};

type LigneMandat = {
  id: string;
  lot_id: string;
  date_debut: string;
  date_fin: string | null;
  mandat: UnOuPlusieurs<{
    etat: string | null;
    date_fin: string | null;
    person: UnOuPlusieurs<{ nom: string; prenom: string | null }>;
  }>;
};

/** Une période pendant laquelle une ligne de mandat nomme le mandant d'un lot. */
type PeriodeMandant = { id: string; debut: string; fin: string | null; resilie: boolean; nom: string };

/** La plus proche de deux dates de fin connues (AAAA-MM-JJ) ; `null` = sans fin. */
const finLaPlusProche = (a: string | null, b: string | null): string | null =>
  a === null ? b : b === null ? a : a < b ? a : b;

/**
 * Relecture adverse du 23/10 : rien ne ferme les lignes d'un mandat résilié (`date_fin` reste vide), et RM-5.1.3 laisse
 * un nouveau mandat ouvrir sa ligne sur le même lot. Deux lignes peuvent donc couvrir le même jour ; la route prenait
 * la première LUE, soit, depuis le tri par identifiant, un tirage entre deux uuid. L'ordre de préférence ne dépend plus
 * de la lecture : d'abord un mandat non résilié (RM-5.1.3 n'en laisse qu'un ouvert par lot ; c'est lui qui décide
 * quand deux lignes commencent le même jour, `date_debut` valant le jour de l'insertion), puis la ligne commencée le
 * plus récemment (un mandat qui commence sur le lot succède au précédent), puis l'identifiant.
 *
 * Limite assumée : rien n'enregistre la date d'une résiliation. `mandats.date_fin` n'est renseignée par aucune action ni
 * fonction SQL, et un mandat résilié est verrouillé. Sans successeur sur le lot, le dernier mandant reste donc nommé
 * pour les écritures postérieures à la résiliation (restitution du dépôt, régularisation finale : elles lui reviennent).
 */
function preferer(a: PeriodeMandant, b: PeriodeMandant): number {
  if (a.resilie !== b.resilie) return a.resilie ? 1 : -1;
  if (a.debut !== b.debut) return a.debut < b.debut ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// Le journal est privé : aucun relais ni navigateur ne doit en garder une copie, ni deviner un autre type que le nôtre
// (mêmes en-têtes que les routes de fichier, src/lib/fichier-signe.ts). Posés sur le CSV comme sur chaque refus.
const ENTETES_PRIVES = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

/**
 * Un refus en clair : jamais un fichier qui aurait l'air complet sans l'être. Audit final du 27/10 (COD-08) : ces refus
 * sont des situations connues, pas des pannes du serveur — 503 (avec `Retry-After`) quand une lecture a échoué ou n'a pas
 * pu être vérifiée (réessayer suffit souvent), 422 quand le portefeuille dépasse ce que l'export sait lire (réessayer ne
 * changera rien). Un 500 les comptait comme erreurs serveur dans la surveillance.
 */
function refus(message: string, status: 503 | 422 = 503): Response {
  return new Response(message, {
    status,
    headers: {
      ...ENTETES_PRIVES,
      "Content-Type": "text/plain; charset=utf-8",
      ...(status === 503 ? { "Retry-After": "30" } : {}),
    },
  });
}

const nombre = (n: number) => n.toLocaleString("fr-FR");

/**
 * Audit du 23/10 (A04) : l'API rend au plus 1 000 lignes par requête, sans le dire. Ce qui ne se lit pas EN ENTIER
 * (voir `lireToutesLesPages`) ne produit pas de fichier, et le refus dit ce qui manque.
 */
function pourquoiEcrituresIncompletes(echec: EchecLecture): string {
  const suite =
    " Le fichier n'est pas produit : un journal incomplet ne doit pas passer pour complet." +
    " Réessayez dans un instant ; si le problème persiste, signalez-le depuis Aide et retours.";
  switch (echec.motif) {
    case "erreur":
      return `Export impossible : ${echec.message}`;
    case "sans-compte":
      return "Export impossible : le nombre d'écritures du journal n'a pas pu être vérifié." + suite;
    case "modifiee":
      return "Export impossible : le journal a été modifié pendant la lecture (écriture ajoutée, déplacée ou supprimée)." + suite;
    case "incomplete":
      return (
        `Export impossible : le journal compte ${nombre(echec.attendues)} écritures,` +
        ` mais ${nombre(echec.lues)} seulement ont pu être lues.` +
        suite
      );
  }
}

function pourquoiMandatsIncomplets(echec: EchecLecture): string {
  const detail =
    echec.motif === "erreur"
      ? echec.message
      : echec.motif === "sans-compte"
        ? "le nombre de lignes de mandat n'a pas pu être vérifié"
        : echec.motif === "modifiee"
          ? "les lignes de mandat ont été modifiées pendant la lecture"
          : `${nombre(echec.attendues)} lignes de mandat attendues, ${nombre(echec.lues)} lues`;
  return (
    `Export impossible : la colonne « mandant » n'a pas pu être reconstituée (${detail}).` +
    " Le fichier n'est pas produit — un journal sans mandant ne se ventile pas. Réessayez dans un instant."
  );
}

/** Montant à la française : deux décimales, virgule décimale, pas de séparateur de milliers. */
function montantFr(v: number | string): string {
  return Number(v).toFixed(2).replace(".", ",");
}

/**
 * Un champ CSV ne doit contenir ni séparateur ni saut de ligne, ni commencer comme une formule de tableur (audit du 13/10, CHF-04 :
 * un libellé « =1+1 » était exporté tel quel et évalué à l'ouverture). Réservé aux colonnes de texte : jamais aux montants.
 */
function champ(v: unknown): string {
  return neutraliserFormule(String(v ?? "").replace(/[;\n\r]/g, " ").trim());
}

export async function GET(req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await ctx.params;
  const { supabase, user, role } = await verifierAccesEspace(orgId);
  // « Mon portefeuille » : l'agent n'exporte que le journal de ses lots —
  // même règle que la page comptabilité (une écriture sans lot reste une
  // affaire d'agence, hors de son périmètre).
  const portefeuille = await lotsDuPortefeuille(supabase, orgId, role, user.id);
  // Un portefeuille illisible est rendu VIDE, pour ne rien ouvrir de trop : sans ce garde, l'agent recevait un journal
  // sans aucune ligne, avec un statut de succès. Et une liste qui atteint la limite de lecture est peut-être coupée :
  // l'export filtré sur elle perdrait des lots sans le dire (audit du 23/10, A04).
  if (portefeuille instanceof PortefeuilleIndisponible) {
    return refus(
      "Export impossible : votre portefeuille n'a pas pu être lu. Le fichier n'est pas produit : il serait vide sans le dire." +
        " Réessayez dans un instant."
    );
  }
  if (portefeuille && portefeuille.size >= LIMITE_LIGNES_API) {
    return refus(
      `Export impossible : la lecture de votre portefeuille a atteint la limite de ${LIMITE_LIGNES_AFFICHEE} lots` +
        " et peut être incomplète. Le fichier n'est pas produit ; signalez-le depuis Aide et retours.",
      422
    );
  }

  // Période facultative : ?du=2026-01-01&au=2026-12-31. Sans elle, tout le journal.
  const url = new URL(req.url);
  const du = url.searchParams.get("du");
  const au = url.searchParams.get("au");

  // Toutes les pages, avec le compte exact (audit du 23/10, A04) : une seule lecture s'arrêtait à 1 000 écritures, et
  // le fichier se disait complet. L'identifiant ferme l'ordre : deux écritures du même jour, créées au même instant, ne
  // changent pas de place d'une page à l'autre.
  const lectureEcritures = await lireToutesLesPages<LigneBrute>(
    (debut, fin) => {
      let requete = supabase
        .from("ecritures")
        .select(
          "id, lot_id, date_piece, date_imputation, categorie, sens, montant, libelle, systeme," +
            " contre_ecriture_de," +
            // Deux clés étrangères relient lots à biens (dont une composite qui garde
            // l'agence cohérente) : il faut nommer celle qu'on suit.
            " lot:lots!ecritures_lot_id_fkey(nom, bien:biens!lots_bien_id_fkey(nom))," +
            // Idem pour les mandats depuis l'audit du 29/09 (clé composite).
            " mandat:mandats!ecritures_mandat_id_fkey(person:persons(nom, prenom))",
          { count: "exact" }
        )
        .eq("organization_id", orgId);
      if (du) requete = requete.gte("date_imputation", du);
      if (au) requete = requete.lte("date_imputation", au);
      // La projection est assemblée en plusieurs morceaux : le client n'en déduit pas le type des lignes.
      return requete
        .order("date_imputation")
        .order("created_at")
        .order("id")
        .range(debut, fin) as unknown as PromiseLike<PageLue<LigneBrute>>;
    },
    (e) => e.id
  );

  // Sans ce garde-fou, une erreur produisait un fichier vide et silencieux :
  // l'agent croyait son journal vide alors que la lecture avait échoué. Il
  // refuse aussi, depuis le 23/10, une lecture INCOMPLÈTE.
  if (lectureEcritures.echec) return refus(pourquoiEcrituresIncompletes(lectureEcritures.echec));

  // Seules les écritures d'honoraires portent le mandat. Pour les loyers, le
  // mandant se retrouve par le lot — sans quoi la colonne resterait vide sur la
  // quasi-totalité du journal, et la ventilation par mandant serait impossible.
  // On garde toutes les lignes, y compris celles des mandats résiliés : le journal
  // est historique, et une écriture de mars doit porter le mandant de mars même si
  // le mandat s'est terminé depuis. Toutes les pages aussi : la 1 001e ligne de
  // mandat nomme un mandant comme les autres. L'état et la fin du mandat servent à
  // départager deux lignes qui couvrent le même jour (voir `preferer`).
  const lectureMandats = await lireToutesLesPages<LigneMandat>(
    (debut, fin) =>
      supabase
        .from("mandat_lignes")
        .select("id, lot_id, date_debut, date_fin, mandat:mandats(etat, date_fin, person:persons(nom, prenom))", {
          count: "exact",
        })
        .eq("organization_id", orgId)
        .order("id")
        .range(debut, fin),
    (l) => l.id
  );

  // Cette lecture n'était pas contrôlée : en cas d'échec, le fichier sortait
  // complet en apparence, avec une colonne « mandant » VIDE sur la quasi-
  // totalité des lignes — un journal comptable inexploitable qui ne dit pas
  // qu'il lui manque quelque chose. Mieux vaut refuser l'export.
  if (lectureMandats.echec) return refus(pourquoiMandatsIncomplets(lectureMandats.echec));

  const mandatsDuLot = new Map<string, PeriodeMandant[]>();
  for (const l of lectureMandats.lignes) {
    const mandat = premier(l.mandat);
    const p = premier(mandat?.person);
    if (!p) continue;
    const liste = mandatsDuLot.get(l.lot_id) ?? [];
    liste.push({
      id: l.id,
      debut: l.date_debut,
      // La ligne s'arrête au plus tard à la fin du mandat, si elle est un jour renseignée (aucun écran ne la pose
      // aujourd'hui : voir la limite décrite au-dessus de `preferer`).
      fin: finLaPlusProche(l.date_fin, mandat?.date_fin ?? null),
      resilie: mandat?.etat === "resilie",
      nom: `${p.nom}${p.prenom ? ` ${p.prenom}` : ""}`,
    });
    mandatsDuLot.set(l.lot_id, liste);
  }
  for (const liste of mandatsDuLot.values()) liste.sort(preferer);

  const mandantAuJour = (lotId: string | null, jour: string): string | undefined =>
    lotId
      ? mandatsDuLot
          .get(lotId)
          ?.find((m) => m.debut <= jour && (m.fin === null || m.fin >= jour))?.nom
      : undefined;

  // La colonne « annule » portait l'identifiant technique de l'écriture reprise :
  // trente-six caractères illisibles pour un comptable. On lui donne de quoi
  // retrouver la ligne d'origine — sa catégorie et sa date.
  const lignesBrutes = lectureEcritures.lignes;
  // Le repère se construit sur tout le journal : une contre-écriture du
  // portefeuille peut annuler une ligne qui n'y est plus.
  const repereParId = new Map(
    lignesBrutes.map((e) => [e.id, `${e.categorie} du ${formaterDate(e.date_piece)}`])
  );
  const lignesExportees = portefeuille
    ? lignesBrutes.filter((e) => e.lot_id != null && portefeuille.has(e.lot_id))
    : lignesBrutes;

  const entete = [
    "date_piece",
    "date_imputation",
    "bien",
    "lot",
    "mandant",
    "categorie",
    "sens",
    "montant",
    "libelle",
    "auto",
    "annule",
  ].join(";");

  const lignes = lignesExportees.map((e) => {
    const lot = premier(e.lot);
    const surLEcriture = premier(premier(e.mandat)?.person);
    const mandant = surLEcriture
      ? `${surLEcriture.nom}${surLEcriture.prenom ? ` ${surLEcriture.prenom}` : ""}`
      : mandantAuJour(e.lot_id, e.date_imputation);
    return [
      e.date_piece,
      e.date_imputation,
      champ(premier(lot?.bien)?.nom),
      champ(lot?.nom),
      champ(mandant),
      champ(e.categorie),
      e.sens,
      montantFr(e.montant),
      champ(e.libelle),
      e.systeme ? "oui" : "non",
      e.contre_ecriture_de
        ? (repereParId.get(e.contre_ecriture_de) ?? e.contre_ecriture_de)
        : "",
    ].join(";");
  });

  const periode =
    du || au
      ? `Journal de gestion du ${du ? formaterDate(du) : "début"} au ${au ? formaterDate(au) : "ce jour"}`
      : "Journal de gestion";
  // Les deux liens de l'écran (« Exporter 2026 » et « Tout exporter »)
  // rendaient le MÊME nom de fichier : deux exports de portées différentes se
  // ressemblaient trait pour trait dans un dossier de téléchargements. La
  // portée passe désormais dans le nom — mais `du` et `au` viennent de l'URL
  // et finissent dans un en-tête HTTP, où un retour chariot injecté ouvrirait
  // un en-tête arbitraire : on n'en garde que chiffres et tirets.
  const jourSur = (v: string | null, defaut: string) =>
    v ? (v.replace(/[^0-9-]/g, "").slice(0, 10) || defaut) : defaut;
  const suffixe =
    du || au ? `-${jourSur(du, "debut")}-au-${jourSur(au, "ce-jour")}` : "-complet";
  const csv = [periode, entete, ...lignes].join("\r\n");
  return new Response("﻿" + csv, {
    headers: {
      ...ENTETES_PRIVES,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="journal-de-gestion${suffixe}.csv"`,
    },
  });
}
