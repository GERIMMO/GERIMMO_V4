import { verifierAccesEspace } from "@/lib/espace";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";
import { formaterDate } from "@/lib/ged";

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

/** Montant à la française : deux décimales, virgule décimale, pas de séparateur de milliers. */
function montantFr(v: number | string): string {
  return Number(v).toFixed(2).replace(".", ",");
}

/** Un champ CSV ne doit contenir ni séparateur ni saut de ligne. */
function champ(v: unknown): string {
  return String(v ?? "").replace(/[;\n\r]/g, " ").trim();
}

export async function GET(req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await ctx.params;
  const { supabase } = await verifierAccesEspace(orgId);

  // Période facultative : ?du=2026-01-01&au=2026-12-31. Sans elle, tout le journal.
  const url = new URL(req.url);
  const du = url.searchParams.get("du");
  const au = url.searchParams.get("au");

  let requete = supabase
    .from("ecritures")
    .select(
      "id, lot_id, date_piece, date_imputation, categorie, sens, montant, libelle, systeme," +
        " contre_ecriture_de," +
        // Deux clés étrangères relient lots à biens (dont une composite qui garde
        // l'agence cohérente) : il faut nommer celle qu'on suit.
        " lot:lots(nom, bien:biens!lots_bien_id_fkey(nom))," +
        " mandat:mandats(person:persons(nom, prenom))"
    )
    .eq("organization_id", orgId)
    .order("date_imputation")
    .order("created_at");
  if (du) requete = requete.gte("date_imputation", du);
  if (au) requete = requete.lte("date_imputation", au);

  const { data, error } = await requete;

  // Sans ce garde-fou, une erreur produisait un fichier vide et silencieux :
  // l'agent croyait son journal vide alors que la lecture avait échoué.
  if (error) {
    return new Response(`Export impossible : ${error.message}`, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // Seules les écritures d'honoraires portent le mandat. Pour les loyers, le
  // mandant se retrouve par le lot — sans quoi la colonne resterait vide sur la
  // quasi-totalité du journal, et la ventilation par mandant serait impossible.
  // On garde toutes les lignes, y compris closes : le journal est historique, et
  // une écriture de mars doit porter le mandant de mars même si le mandat s'est
  // terminé depuis.
  const { data: lignesMandat } = await supabase
    .from("mandat_lignes")
    .select("lot_id, date_debut, date_fin, mandat:mandats(person:persons(nom, prenom))")
    .eq("organization_id", orgId);

  const mandatsDuLot = new Map<string, { debut: string; fin: string | null; nom: string }[]>();
  for (const l of (lignesMandat ?? []) as unknown as {
    lot_id: string;
    date_debut: string;
    date_fin: string | null;
    mandat: UnOuPlusieurs<{ person: UnOuPlusieurs<{ nom: string; prenom: string | null }> }>;
  }[]) {
    const p = premier(premier(l.mandat)?.person);
    if (!p) continue;
    const liste = mandatsDuLot.get(l.lot_id) ?? [];
    liste.push({
      debut: l.date_debut,
      fin: l.date_fin,
      nom: `${p.nom}${p.prenom ? ` ${p.prenom}` : ""}`,
    });
    mandatsDuLot.set(l.lot_id, liste);
  }

  const mandantAuJour = (lotId: string | null, jour: string): string | undefined =>
    lotId
      ? mandatsDuLot
          .get(lotId)
          ?.find((m) => m.debut <= jour && (m.fin === null || m.fin >= jour))?.nom
      : undefined;

  // La colonne « annule » portait l'identifiant technique de l'écriture reprise :
  // trente-six caractères illisibles pour un comptable. On lui donne de quoi
  // retrouver la ligne d'origine — sa catégorie et sa date.
  const lignesBrutes = (data ?? []) as unknown as LigneBrute[];
  const repereParId = new Map(
    lignesBrutes.map((e) => [e.id, `${e.categorie} du ${formaterDate(e.date_piece)}`])
  );

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

  const lignes = lignesBrutes.map((e) => {
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
  const csv = [periode, entete, ...lignes].join("\r\n");
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="journal-de-gestion.csv"',
    },
  });
}
