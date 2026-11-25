"use client";

import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Label } from "@/components/ui/label";
import { creerArticleIA, creerArticleVierge, type EtatNouvelArticle } from "./actions";

/** L'équivalent manuel (interrupteur IA, 22/11/2026) : un brouillon vide, à écrire dans l'éditeur. Aucun appel à l'IA. */
export function FormulaireArticleVierge() {
  const [etat, action] = useActionState<EtatNouvelArticle, FormData>(creerArticleVierge, {});
  return (
    <form data-saisie-confirmee action={action} className="formulaire-reperes mt-6 space-y-5 rounded-xl border border-[var(--filet)] bg-[var(--ivoire)] p-5 sm:p-7" data-brouillon-vierge>
      <div className="space-y-1.5">
        <Label htmlFor="titre-vierge" className="libelle-champ">Titre de l’article</Label>
        <input id="titre-vierge" name="titre" required minLength={5} maxLength={180} defaultValue={etat.valeurs?.titre}
          className="w-full rounded-[var(--rayon-champ)] border border-[var(--filet-champ)] bg-[var(--carte)] p-3 text-sm" />
        <p className="text-[12px] text-[var(--texte-secondaire)]">Le brouillon s’ouvre ensuite dans l’éditeur : vous y écrivez le chapô, le texte et le message Facebook. Rien n’est publié avant votre validation.</p>
      </div>
      <BoutonEnvoi variant="outline">Créer un brouillon vierge</BoutonEnvoi>
      {etat.erreur && <p role="alert" className="text-sm text-[var(--destructive)]">{etat.erreur}</p>}
    </form>
  );
}

export function FormulaireNouvelArticle() {
  const [etat, action] = useActionState<EtatNouvelArticle, FormData>(creerArticleIA, {});
  return (
    <form data-saisie-confirmee action={action} className="formulaire-reperes mt-6 space-y-5 rounded-xl border border-[var(--filet)] bg-[var(--ivoire)] p-5 sm:p-7">
      <p className="legende-champs"><span aria-hidden="true" />Information obligatoire à compléter.</p>
      <div className="space-y-1.5">
        <Label htmlFor="sujet" className="libelle-champ">Sujet</Label>
        <textarea id="sujet" name="sujet" rows={3} required defaultValue={etat.valeurs?.sujet}
          placeholder="Expliquer comment Gerimmo simplifie le suivi d’un incident locatif."
          className="w-full rounded-[var(--rayon-champ)] border border-[var(--filet-champ)] bg-[var(--carte)] p-3 text-sm" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="public" className="libelle-champ">Public visé</Label>
        <input id="public" name="public" defaultValue={etat.valeurs?.public ?? "Agences et professionnels de la gestion locative"}
          className="w-full rounded-[var(--rayon-champ)] border border-[var(--filet-champ)] bg-[var(--carte)] p-3 text-sm" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="faits" className="libelle-champ">Faits que Gerimmo peut affirmer</Label>
        <textarea id="faits" name="faits" rows={8} required defaultValue={etat.valeurs?.faits}
          placeholder="Listez les fonctionnalités réellement disponibles et les informations vérifiées. Gerimmo n’ajoutera aucun fait de lui-même."
          className="w-full rounded-[var(--rayon-champ)] border border-[var(--filet-champ)] bg-[var(--carte)] p-3 text-sm leading-relaxed" />
        <p className="text-[12px] text-[var(--texte-secondaire)]">Ces faits sont la seule matière autorisée. Le brouillon devra ensuite être relu avant sa parution.</p>
      </div>
      <BoutonEnvoi>Créer le brouillon avec Gerimmo</BoutonEnvoi>
      {etat.erreur && <p role="alert" className="text-sm text-[var(--destructive)]">{etat.erreur}</p>}
    </form>
  );
}

