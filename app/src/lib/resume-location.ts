export type IdentiteResume = { id: string; nom: string; prenom: string | null; date_naissance: string | null; telephone: string | null; sexe?: string | null };
export type BailResume = { id: string; locataire_principal: string | null; date_debut: string | null; date_fin: string | null; loyer_hc: number | null; charges: number | null };
export type LienPersonneResume = { bail_id: string; person_id: string; role: string; garant_de: string | null; date_depart: string | null };
export type PersonneResume = { personne: IdentiteResume | null; person_id: string; bail_id: string; garant_de: string | null; depart: string | null };

export function ageAu(naissance: string | null, aujourdHui: string): number | null {
  if (!naissance || !/^\d{4}-\d{2}-\d{2}$/.test(naissance) || naissance > aujourdHui) return null;
  const d = new Date(`${naissance}T12:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== naissance) return null;
  const age = Number(aujourdHui.slice(0, 4)) - Number(naissance.slice(0, 4)) - (aujourdHui.slice(5) < naissance.slice(5) ? 1 : 0);
  return age >= 0 ? age : null;
}

export function personnesDuResume(baux: BailResume[], liens: LienPersonneResume[], personnes: IdentiteResume[]) {
  const identites = new Map(personnes.map(p => [p.id, p]));
  const autorises = new Set(baux.map(b => b.id));
  const locataires = new Map<string, PersonneResume>();
  const garants = new Map<string, PersonneResume>();
  const entree = (bail_id: string, person_id: string, garant_de: string | null = null, depart: string | null = null): PersonneResume => ({ bail_id, person_id, personne: identites.get(person_id) ?? null, garant_de, depart });
  for (const b of baux) if (b.locataire_principal) locataires.set(`${b.id}:${b.locataire_principal}`, entree(b.id, b.locataire_principal));
  for (const l of liens) {
    if (!autorises.has(l.bail_id)) continue;
    const key = `${l.bail_id}:${l.person_id}`;
    if (l.role === "colocataire") locataires.set(key, entree(l.bail_id, l.person_id, null, l.date_depart));
    if (l.role === "garant") garants.set(key, entree(l.bail_id, l.person_id, l.garant_de));
  }
  return { locataires: [...locataires.values()], garants: [...garants.values()] };
}
