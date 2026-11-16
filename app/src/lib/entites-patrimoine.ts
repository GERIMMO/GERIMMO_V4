import type { SupabaseClient } from "@supabase/supabase-js";
import { lireToutesLesPages } from "./lecture-complete";
import type { EcritureFinances } from "./finances";

export type EntitePatrimoine = { id: string; nom: string; qualite: string | null; lots: string[] };
type Detenteur = {id: string; nom: string; prenom: string | null; qualite: string | null};
export type PeriodeDetention = { lot_id: string; date_debut: string; date_fin: string | null; quote_part: string | number; titulaire: string };
type Detention = Omit<PeriodeDetention,"titulaire"> & { id: string; person: Detenteur | Detenteur[] | null };

export async function lireEntitesPatrimoine(db: SupabaseClient, org: string, annee: number) {
  const r = await lireToutesLesPages<Detention>((debut, fin) => db.from("detentions")
    .select("id,lot_id,date_debut,date_fin,quote_part,person:persons!detentions_person_id_fkey(id,nom,prenom,qualite)",{count:"exact"})
    .eq("organization_id",org).lte("date_debut",`${annee}-12-31`)
    .or(`date_fin.is.null,date_fin.gte.${annee}-01-01`).order("id").range(debut,fin), d=>d.id);
  const groupes = new Map<string, EntitePatrimoine>();
  const periodes: PeriodeDetention[] = [];
  const erreur = { entites: [] as EntitePatrimoine[], periodes: [] as PeriodeDetention[], erreur: true };
  if (r.echec) return erreur;
  for (const d of r.lignes) {
    const p = Array.isArray(d.person) ? d.person[0] : d.person;
    if (!p) return erreur;
    const entite = groupes.get(p.id) ?? { id:p.id, nom:[p.prenom,p.nom].filter(Boolean).join(" "), qualite:p.qualite, lots:[] };
    if (!entite.lots.includes(d.lot_id)) entite.lots.push(d.lot_id);
    groupes.set(p.id, entite);
    periodes.push({lot_id:d.lot_id,date_debut:d.date_debut,date_fin:d.date_fin,quote_part:d.quote_part,titulaire:p.id});
  }
  return { entites:[...groupes.values()].sort((a,b)=>a.nom.localeCompare(b.nom,"fr")), periodes, erreur:false };
}

/** Classe les flux déjà filtrés du livre une seule fois. Aucun calcul de quote-part ou d’impôt. */
export function ventilerParTitulaire(lignes: EcritureFinances[], periodes: PeriodeDetention[], lots: {id:string; bien_id:string}[]) {
  const parLot = new Map<string, PeriodeDetention[]>();
  for (const p of periodes) {
    const liste = parLot.get(p.lot_id) ?? [];
    liste.push(p);
    parLot.set(p.lot_id,liste);
  }
  const parBien = new Map<string,string[]>();
  for (const lot of lots) {
    const liste = parBien.get(lot.bien_id) ?? [];
    liste.push(lot.id);
    parBien.set(lot.bien_id,liste);
  }
  function titulaire(lot: string, jour: string) {
    const actifs = (parLot.get(lot) ?? []).filter(p => p.date_debut <= jour && (!p.date_fin || jour <= p.date_fin));
    return actifs.length === 1 && Number(actifs[0].quote_part) === 100 ? actifs[0].titulaire : null;
  }
  const groupes = new Map<string | null, { recettes: number; depenses: number; ecritures: EcritureFinances[] }>();
  for (const ligne of lignes) {
    const ids = ligne.lot_id ? [ligne.lot_id] : parBien.get(ligne.bien_id ?? "") ?? [];
    const titulaires = new Set(ids.map(id => titulaire(id,ligne.date_imputation)));
    const id = titulaires.size === 1 ? [...titulaires][0] : null;
    const groupe = groupes.get(id) ?? { recettes:0, depenses:0, ecritures:[] };
    const montant = Math.round(Number(ligne.montant) * 100);
    if (ligne.sens === "recette") groupe.recettes += montant;
    else if (ligne.sens === "depense") groupe.depenses += montant;
    groupe.ecritures.push(ligne);
    groupes.set(id,groupe);
  }
  return groupes;
}
