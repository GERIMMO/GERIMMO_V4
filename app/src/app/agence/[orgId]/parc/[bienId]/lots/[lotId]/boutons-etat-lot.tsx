"use client";

import { useActionState } from "react";
import { changerEtatLot, type EtatParc } from "@/app/actions/parc";
import { ETATS_LOT } from "@/lib/parc";
import { Button } from "@/components/ui/button";

// Transitions autorisées par la machine à états (module 0) — la base fait foi
// (trigger) : ces boutons ne proposent que les transitions légales depuis
// l'état courant. « loué » arrivera avec le bail (S4) ; on l'expose quand même
// pour la démo interne tant que le module bail n'existe pas.
const TRANSITIONS: Record<string, { cible: string; libelle: string }[]> = {
  brouillon: [
    { cible: "disponible", libelle: "Passer en disponible" },
    { cible: "archive", libelle: "Archiver" },
  ],
  disponible: [
    { cible: "loue", libelle: "Marquer loué" },
    { cible: "brouillon", libelle: "Repasser en brouillon" },
    { cible: "archive", libelle: "Archiver" },
  ],
  loue: [{ cible: "preavis", libelle: "Passer en préavis" }],
  preavis: [
    { cible: "loue", libelle: "Préavis annulé (re-loué)" },
    { cible: "disponible", libelle: "Sortie effective (disponible)" },
  ],
  archive: [{ cible: "brouillon", libelle: "Réactiver (admin agence)" }],
};

export function BoutonsEtatLot({
  orgId,
  bienId,
  lotId,
  etat,
}: {
  orgId: string;
  bienId: string;
  lotId: string;
  etat: string;
}) {
  const actionLiee = changerEtatLot.bind(null, orgId, bienId, lotId);
  const [retour, action, enCours] = useActionState<EtatParc, FormData>(actionLiee, {});
  const transitions = TRANSITIONS[etat] ?? [];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {transitions.map((t) => (
          <form key={t.cible} action={action}>
            <input type="hidden" name="etat" value={t.cible} />
            <Button
              type="submit"
              size="sm"
              variant={t.cible === "disponible" ? "default" : "outline"}
              disabled={enCours}
            >
              {t.libelle}
            </Button>
          </form>
        ))}
      </div>
      {retour.erreur && <p className="text-sm text-destructive">{retour.erreur}</p>}
      {retour.succes && (
        <p className="text-sm text-success-soft-foreground">{retour.succes}</p>
      )}
      <p className="text-xs text-muted-foreground">
        État courant : {ETATS_LOT[etat] ?? etat}. Le passage en « Disponible »
        revérifie tous les blocages en base.
      </p>
    </div>
  );
}
