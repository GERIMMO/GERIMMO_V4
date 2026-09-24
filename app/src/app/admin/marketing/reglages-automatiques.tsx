"use client";

import { useActionState } from "react";
import { enregistrerReglagesMarketing, type EtatCampagne } from "./actions";

type Reglages = { actif: boolean; publication_automatique: boolean; publicite_active: boolean; jours_semaine: number[]; heure_paris: number; budget_mensuel_cents: number };
const JOURS = [[1,"Lundi"],[2,"Mardi"],[3,"Mercredi"],[4,"Jeudi"],[5,"Vendredi"],[6,"Samedi"],[7,"Dimanche"]] as const;

// Une seule façon d'habiller un champ sur la rangée (24/09) : sélecteurs nus,
// faux champ « Créneau » encadré et plafond nu cohabitaient. Même classe que
// le formulaire de campagne et les autres formulaires de la console.
const champ = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
// Le même cadre, avec l'unité « € » en suffixe à l'intérieur.
const champAvecUnite = "flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--marque)]";
const caseACocher = "flex items-start gap-2 rounded-xl border border-[var(--filet)] bg-white p-3";

export function ReglagesAutomatiques({ reglages, comptePublicitaire }: { reglages: Reglages; comptePublicitaire: boolean }) {
  const [etat, action, attente] = useActionState(enregistrerReglagesMarketing, {} as EtatCampagne);
  return <form action={action} className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3">
      <label className={caseACocher}><input type="checkbox" name="actif" defaultChecked={reglages.actif} className="mt-1" /><span><b>Agent actif</b><small className="mt-1 block text-[var(--texte-secondaire)]">Prépare des brouillons à vous soumettre. Aucun envoi automatique.</small></span></label>
      <div className={caseACocher}><span><b>Votre accord avant diffusion</b><small className="mt-1 block text-[var(--texte-secondaire)]">Chaque article et chaque post attend votre validation.</small></span></div>
      <div className={caseACocher}><span><b>Publicité sous votre contrôle</b><small className="mt-1 block text-[var(--texte-secondaire)]">{comptePublicitaire ? "Le plafond n’autorise aucune dépense. Chaque campagne doit être validée." : "Compte Meta Ads à connecter avant toute campagne payante."}</small></span></div>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="grid gap-1"><span className="libelle-champ">Premier jour</span><select className={champ} name="jour_1" defaultValue={reglages.jours_semaine[0] ?? 2}>{JOURS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <label className="grid gap-1"><span className="libelle-champ">Deuxième jour</span><select className={champ} name="jour_2" defaultValue={reglages.jours_semaine[1] ?? 5}>{JOURS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      {/* Le créneau n'est pas réglable : il s'affiche comme un champ, en
          lecture seule, au lieu d'une boîte d'un autre style. */}
      <div className="grid gap-1"><span className="libelle-champ">Créneau</span><p className={`${champ} text-[var(--texte-secondaire)]`}>Le matin</p><input type="hidden" name="heure_paris" value={reglages.heure_paris} /></div>
      <label className="grid gap-1"><span className="libelle-champ">Plafond mensuel</span><span className={champAvecUnite}><input name="budget" type="number" min="0" max="1000" step="0.01" defaultValue={(reglages.budget_mensuel_cents/100).toFixed(2)} className="min-w-0 flex-1 bg-transparent py-2 outline-none" /><span aria-hidden className="text-[var(--texte-secondaire)]">€</span></span></label>
    </div>
    <div className="flex flex-wrap items-center gap-3"><button className="btn-or" disabled={attente}>{attente ? "Enregistrement…" : "Enregistrer les réglages"}</button>{etat.erreur && <p role="alert" className="err">{etat.erreur}</p>}{etat.succes && <p role="status" className="text-sm text-[var(--success)]">{etat.succes}</p>}</div>
  </form>;
}
