"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { afficherToast } from "@/components/ui/toast";

// Les gestes du lien de parrainage (24/09). Le lien n'était qu'un texte brut :
// il fallait le sélectionner à la main, et sur téléphone il se coupait au
// milieu de « parrain ». « Copier » le met dans le presse-papiers ;
// « Partager » ouvre la feuille de partage du téléphone, quand le navigateur
// en a une (jamais au rendu serveur, d'où la lecture à part).

const RIEN_A_ECOUTER = () => () => {};
const PARTAGE_NAVIGATEUR = () =>
  typeof navigator !== "undefined" && typeof navigator.share === "function";
const PARTAGE_SERVEUR = () => false;

export function BoutonsLienParrainage({ lien }: { lien: string }) {
  const peutPartager = useSyncExternalStore(
    RIEN_A_ECOUTER,
    PARTAGE_NAVIGATEUR,
    PARTAGE_SERVEUR
  );

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(lien);
      afficherToast("Lien copié");
    } catch {
      // Presse-papiers refusé (page non sécurisée, permission) : le lien reste
      // affiché juste au-dessus, on le dit plutôt que de faire croire à la copie.
      afficherToast("Copie impossible : sélectionnez le lien ci-dessus.");
    }
  };

  const partager = async () => {
    try {
      await navigator.share({ title: "Gerimmo", url: lien });
    } catch {
      // Feuille de partage fermée sans choisir : ce n'est pas une erreur.
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" onClick={copier}>
        Copier le lien
      </Button>
      {peutPartager && (
        <Button type="button" variant="outline" size="sm" onClick={partager}>
          Partager
        </Button>
      )}
    </div>
  );
}
