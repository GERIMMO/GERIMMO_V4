"use client";

import { useActionState } from "react";
import { enregistrerReglagesMarketing, type EtatCampagne } from "./actions";

type Reglages = { actif: boolean; publication_automatique: boolean; publicite_active: boolean; jours_semaine: number[]; heure_paris: number; budget_mensuel_cents: number };
const JOURS = [[1,"Lundi"],[2,"Mardi"],[3,"Mercredi"],[4,"Jeudi"],[5,"Vendredi"],[6,"Samedi"],[7,"Dimanche"]] as const;

export function ReglagesAutomatiques({ reglages, comptePublicitaire }: { reglages: Reglages; comptePublicitaire: boolean }) {
  const [etat, action, attente] = useActionState(enregistrerReglagesMarketing, {} as EtatCampagne);
  return <form action={action} className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="flex items-start gap-2 border border-[var(--filet)] bg-white p-3"><input type="checkbox" name="actif" defaultChecked={reglages.actif} /><span><b>Agent actif</b><small className="mt-1 block text-[var(--texte-secondaire)]">Coupe immédiatement toute action marketing.</small></span></label>
      <label className="flex items-start gap-2 border border-[var(--filet)] bg-white p-3"><input type="checkbox" name="publication_automatique" defaultChecked={reglages.publication_automatique} /><span><b>Publication automatique</b><small className="mt-1 block text-[var(--texte-secondaire)]">Deux articles et posts par semaine.</small></span></label>
      <label className="flex items-start gap-2 border border-[var(--filet)] bg-white p-3"><input type="checkbox" name="publicite_active" defaultChecked={reglages.publicite_active} /><span><b>Publicité payante</b><small className="mt-1 block text-[var(--texte-secondaire)]">{comptePublicitaire ? "Active dans la limite mensuelle." : "Prête, en attente du compte Meta Ads."}</small></span></label>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <label><span className="libelle-champ">Premier jour</span><select name="jour_1" defaultValue={reglages.jours_semaine[0] ?? 2}>{JOURS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <label><span className="libelle-champ">Deuxième jour</span><select name="jour_2" defaultValue={reglages.jours_semaine[1] ?? 5}>{JOURS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <div><span className="libelle-champ">Créneau</span><p className="border border-[var(--filet)] bg-white px-3 py-2 text-sm">Le matin</p><input type="hidden" name="heure_paris" value={reglages.heure_paris} /></div>
      <label><span className="libelle-champ">Plafond mensuel</span><div className="flex items-center gap-2"><input name="budget" type="number" min="0" max="1000" step="0.01" defaultValue={(reglages.budget_mensuel_cents/100).toFixed(2)} /><span>€</span></div></label>
    </div>
    <div className="flex flex-wrap items-center gap-3"><button className="btn-or" disabled={attente}>{attente ? "Enregistrement…" : "Enregistrer les réglages"}</button>{etat.erreur && <p role="alert" className="err">{etat.erreur}</p>}{etat.succes && <p role="status" className="text-sm text-[var(--success)]">{etat.succes}</p>}</div>
  </form>;
}
