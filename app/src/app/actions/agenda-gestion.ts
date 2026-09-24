"use server";

import { verifierAccesEspace } from "@/lib/espace";
import { lotsDuPortefeuille, PortefeuilleIndisponible } from "@/lib/portefeuille";
import { minuitParis, semaineAgenda, moisAgenda, jourAgenda, vueAgenda, pageAgenda, TAILLE_PAGE_AGENDA } from "@/lib/agenda-gestion";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";

type IncidentAgenda = { id: string; numero: string; lot_id: string; categorie: string; urgence: string; lot: UnOuPlusieurs<{ nom: string; bien: UnOuPlusieurs<{ address_line1: string | null; city: string | null }> }> };
export type RendezVousGestion = {
  id: string; statut: string; debut_prevu: string | null; fin_prevue: string | null;
  incident: UnOuPlusieurs<IncidentAgenda>; artisan: UnOuPlusieurs<{ raison_sociale: string }>;
};
export async function chargerAgendaGestion(orgId: string, options: { vue?: string; semaine?: string; mois?: string; jour?: string; page?: string }) {
  const { supabase, user, role } = await verifierAccesEspace(orgId);
  const maintenant = new Date();
  const semaine = semaineAgenda(options.semaine, maintenant);
  const mois = moisAgenda(options.mois, maintenant);
  const jour = jourAgenda(options.jour, mois, maintenant);
  const vue = vueAgenda(options.vue);
  const page = pageAgenda(options.page);
  const vide = { lignes: [] as RendezVousGestion[], total: 0, semaine, mois, jour, vue, page, erreur: false };
  const portefeuille = await lotsDuPortefeuille(supabase, orgId, role, user.id);
  if (portefeuille instanceof PortefeuilleIndisponible) return { ...vide, erreur: true };
  if (portefeuille?.size === 0) return vide;
  // !inner est essentiel : un dossier filtré ne doit laisser ni mission ni
  // compteur visibles. Les contraintes sont nommées pour les FK composées.
  let q = supabase.from("incident_interventions").select(
    "id, statut, debut_prevu, fin_prevue, incident:incidents!incident_interventions_incident_meme_org_fk!inner(id, numero, lot_id, categorie, urgence, lot:lots(nom, bien:biens!lots_bien_id_fkey(address_line1, city))), artisan:artisans!incident_interventions_artisan_id_fkey(raison_sociale)",
    { count: "exact" }
  ).eq("organization_id", orgId).eq("incident.organization_id", orgId);
  if (portefeuille) q = q.in("incident.lot_id", [...portefeuille]);
  if (vue === "a-planifier") q = q.in("statut", ["proposee", "acceptee"]).is("debut_prevu", null);
  else if (vue === "a-verifier") q = q.in("statut", ["planifiee", "en_cours"]).lt("fin_prevue", maintenant.toISOString());
  else if (vue === "mois") {
    // Le calendrier lit le mois entier, sans pagination : un jour se clique,
    // ses rendez-vous se lisent dessous.
    const du = minuitParis(mois.premier);
    q = q.in("statut", ["planifiee", "en_cours", "terminee"])
      .lt("debut_prevu", minuitParis(mois.suivant))
      .or(`fin_prevue.gt.${du},and(fin_prevue.is.null,debut_prevu.gte.${du})`);
  } else {
    const du = minuitParis(semaine.lundi);
    q = q.in("statut", ["planifiee", "en_cours", "terminee"])
      .lt("debut_prevu", minuitParis(semaine.suivant))
      .or(`fin_prevue.gt.${du},and(fin_prevue.is.null,debut_prevu.gte.${du})`);
  }
  const { data, error, count } = await q.order("debut_prevu", { nullsFirst: true }).order("id")
    .range(...(vue === "mois" ? [0, 499] as const : [(page - 1) * TAILLE_PAGE_AGENDA, page * TAILLE_PAGE_AGENDA - 1] as const));
  if (error) return { ...vide, erreur: true };
  // Défense complémentaire pour les projections : aucune relation absente
  // ou hors portefeuille ne doit devenir une carte orpheline.
  const lignes = ((data ?? []) as unknown as RendezVousGestion[]).filter((r) => {
    const incident = premier(r.incident);
    return incident && (!portefeuille || portefeuille.has(incident.lot_id));
  });
  return { ...vide, lignes, total: count ?? lignes.length };
}
