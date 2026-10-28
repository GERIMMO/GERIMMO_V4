import type { SupabaseClient } from "@supabase/supabase-js";
import { lectureTronquee, lireParIdentifiants } from "./lectures-fiscales";
import { gardeAide2044, type DetenteurFiscal, type ProfilFiscalDetenteur } from "./profil-fiscal";

export type CadreFiscal = { detenteurs: DetenteurFiscal[]; profils: ProfilFiscalDetenteur[]; erreur: string | null; blocage2044: string | null };

/** Les détentions historiques identifient les propriétaires de l'année, y compris après une vente. */
export async function lireCadreFiscal(db: SupabaseClient, orgId: string, annee: number, lots?: Set<string>): Promise<CadreFiscal> {
  const erreur = "La situation fiscale des propriétaires n’a pas pu être vérifiée. Aucun tableau 2044 n’est proposé ; réessayez après avoir rechargé la page.";
  const indisponible = (): CadreFiscal => ({ detenteurs: [], profils: [], erreur, blocage2044: erreur });
  const [detentions, profils] = await Promise.all([
    db.from("detentions").select("id,person_id,lot_id,date_debut,date_fin").eq("organization_id", orgId).lte("date_debut", `${annee}-12-31`),
    db.from("fiscal_profils_detenteurs").select("*").eq("organization_id", orgId).eq("annee", annee).order("version", { ascending: false }),
  ]);
  if (detentions.error || profils.error || lectureTronquee(detentions.data) || lectureTronquee(profils.data)) return indisponible();
  const personnes = [...new Set((detentions.data ?? []).filter(d => (!d.date_fin || d.date_fin >= `${annee}-01-01`) && (!lots || lots.has(d.lot_id))).map(d => String(d.person_id)))];
  const lecture = await lireParIdentifiants<DetenteurFiscal>(personnes, ids => db.from("persons").select("id,nom,prenom,qualite").eq("organization_id", orgId).in("id", ids));
  const selection = (lecture.data ?? []).filter(p => personnes.includes(p.id));
  if (lecture.error || lecture.tronquee || selection.length !== personnes.length) return indisponible();
  const detenteurs = selection.sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  const connus = (profils.data ?? []) as ProfilFiscalDetenteur[];
  return { detenteurs, profils: connus, erreur: null, blocage2044: gardeAide2044(detenteurs, connus, annee) };
}
