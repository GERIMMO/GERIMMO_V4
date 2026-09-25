import type { SupabaseClient } from "@supabase/supabase-js";
import { EQUIPES, estEquipe, type Equipe } from "@/lib/missions";
import type { ContenuPoint } from "@/lib/point-du-matin";
import type { DecisionAffichee } from "./decision-matin";

export type PointLu = {
  id: string; jour: string; equipe: Equipe; nom: string; statut: string; contenu: ContenuPoint; genere_le: string; lu_le: string | null;
  decisions: DecisionAffichee[];
};

type Ligne = { id: string; jour: string; equipe: string; statut: string; contenu: unknown; genere_le: string; lu_le: string | null; decisions_du_matin: Record<string, unknown>[] | null };

function decision(d: Record<string, unknown>): DecisionAffichee {
  const options = Array.isArray(d.options) ? d.options.filter((o): o is string => typeof o === "string") : [];
  // Ce que le point peut faire seul est décidé à l'assemblage (lib/point-du-matin.ts)
  // et enregistré dans `gestes` : la page ne relit pas les tables d'origine.
  const gestes = d.gestes && typeof d.gestes === "object" ? d.gestes as { validation?: boolean; refus?: boolean; attestation?: string } : {};
  const reco = typeof d.recommandation === "string" ? d.recommandation : null;
  const validation = gestes.validation === true, refus = gestes.refus === true;
  return {
    id: String(d.id), titre: String(d.titre ?? ""), pourquoi: String(d.pourquoi ?? ""), options, recommandation: reco,
    lien: typeof d.lien === "string" ? d.lien : null, statut: String(d.statut ?? "en_attente"), motif: typeof d.motif === "string" ? d.motif : null,
    decide_le: typeof d.decide_le === "string" ? d.decide_le : null, validation, refus,
    attestation: typeof gestes.attestation === "string" ? gestes.attestation : null,
  };
}

function contenu(c: unknown): ContenuPoint {
  const x = c && typeof c === "object" ? c as Partial<ContenuPoint> : {};
  return { passages: Array.isArray(x.passages) ? x.passages : [], realisations: Array.isArray(x.realisations) ? x.realisations : [], echecs: Array.isArray(x.echecs) ? x.echecs : [], sans_passage: Array.isArray(x.sans_passage) ? x.sans_passage : [] };
}

const COLONNES = "id,jour,equipe,statut,contenu,genere_le,lu_le,decisions_du_matin(id,cle,titre,pourquoi,options,recommandation,lien,source,statut,motif,decide_le,gestes,cree_le)";

export async function lirePoints(db: Pick<SupabaseClient, "from">, filtre: { jour?: string; equipe?: Equipe; depuis?: string; limite?: number }) {
  let q = db.from("points_du_matin").select(COLONNES).order("jour", { ascending: false }).order("equipe").limit(filtre.limite ?? 7);
  if (filtre.jour) q = q.eq("jour", filtre.jour);
  if (filtre.equipe) q = q.eq("equipe", filtre.equipe);
  if (filtre.depuis) q = q.gte("jour", filtre.depuis);
  const { data, error } = await q;
  if (error) return { points: null as PointLu[] | null, erreur: true };
  const points: PointLu[] = ((data ?? []) as unknown as Ligne[]).filter((l) => estEquipe(l.equipe)).map((l) => ({
    id: l.id, jour: l.jour, equipe: l.equipe as Equipe, nom: EQUIPES[l.equipe as Equipe].nom, statut: l.statut, contenu: contenu(l.contenu), genere_le: l.genere_le, lu_le: l.lu_le,
    decisions: (l.decisions_du_matin ?? []).map(decision).sort((a, b) => (a.statut === "en_attente" ? 0 : 1) - (b.statut === "en_attente" ? 0 : 1) || a.titre.localeCompare(b.titre)),
  }));
  return { points, erreur: false };
}

export const dateLongue = (jour: string) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeZone: "Europe/Paris" }).format(new Date(`${jour}T12:00:00Z`));
export const heureParis = (iso: string) => new Intl.DateTimeFormat("fr-FR", { timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(iso));
