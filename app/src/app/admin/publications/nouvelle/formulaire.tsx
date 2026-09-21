"use client";

import { useActionState } from "react";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Label } from "@/components/ui/label";
import { creerArticleIA, type EtatNouvelArticle } from "./actions";

export function FormulaireNouvelArticle() {
  const [etat, action] = useActionState<EtatNouvelArticle, FormData>(creerArticleIA, {});
  return (
    <form action={action} className="mt-6 space-y-5 border border-[var(--filet)] bg-[var(--ivoire)] p-5 sm:p-7">
      <div className="space-y-1.5">
        <Label htmlFor="sujet" className="libelle-champ">Sujet</Label>
        <textarea id="sujet" name="sujet" rows={3} required defaultValue={etat.valeurs?.sujet}
          placeholder="Expliquer comment Gerimmo simplifie le suivi d’un incident locatif."
          className="w-full rounded-[10px] border border-[var(--filet)] bg-white p-3 text-sm" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="public" className="libelle-champ">Public visé</Label>
        <input id="public" name="public" defaultValue={etat.valeurs?.public ?? "Agences et professionnels de la gestion locative"}
          className="w-full rounded-[10px] border border-[var(--filet)] bg-white p-3 text-sm" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="faits" className="libelle-champ">Faits que Gerimmo peut affirmer</Label>
        <textarea id="faits" name="faits" rows={8} required defaultValue={etat.valeurs?.faits}
          placeholder="Listez les fonctionnalités réellement disponibles et les informations vérifiées. Gerimmo n’ajoutera aucun fait de lui-même."
          className="w-full rounded-[10px] border border-[var(--filet)] bg-white p-3 text-sm leading-relaxed" />
        <p className="text-[12px] text-[var(--texte-secondaire)]">Ces faits sont la seule matière autorisée. Le brouillon devra ensuite être relu avant sa parution.</p>
      </div>
      <BoutonEnvoi>Créer le brouillon avec Gerimmo</BoutonEnvoi>
      {etat.erreur && <p role="alert" className="text-sm text-[var(--destructive)]">{etat.erreur}</p>}
    </form>
  );
}

