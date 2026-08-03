"use client";

import { useActionState } from "react";
import { changerEtatLot, type EtatParc } from "@/app/actions/parc";
import { ETATS_LOT } from "@/lib/parc";
import { Button } from "@/components/ui/button";

// Transitions autorisées par la machine à états (module 0) — la base fait foi.
//
// « Loué » et « en préavis » ne sont PAS proposés à la main : ils découlent du
// bail. Activer un bail passe le lot en loué, enregistrer un congé le passe en
// préavis. Les boutons manuels d'avant le module bail laissaient marquer un lot
// loué sans locataire, ou en préavis sans congé.
const TRANSITIONS: Record<string, { cible: string; libelle: string }[]> = {
  brouillon: [
    { cible: "disponible", libelle: "Mettre en location" },
    { cible: "archive", libelle: "Archiver" },
  ],
  disponible: [
    { cible: "brouillon", libelle: "Remettre en préparation" },
    { cible: "archive", libelle: "Archiver" },
  ],
  loue: [],
  preavis: [{ cible: "disponible", libelle: "Le locataire est parti" }],
  archive: [{ cible: "brouillon", libelle: "Réactiver (admin de l'agence)" }],
};

// Ce que l'agent doit faire à la place, quand l'état ne se change pas à la main.
const AILLEURS: Record<string, string> = {
  loue: "Ce lot est loué. Pour enregistrer un départ, passez par le bail et son congé.",
  preavis:
    "Le locataire a donné congé. Quand il aura rendu les clés et que l'état des lieux de sortie sera fait, marquez son départ.",
};

export function BoutonsEtatLot({
  orgId,
  bienId,
  lotId,
  etat,
  bloque = false,
  compact = false,
}: {
  orgId: string;
  bienId: string;
  lotId: string;
  etat: string;
  // Des blocages subsistent : « Passer en disponible » reste cliquable (la base
  // fait foi et renvoie l'erreur exacte) mais cesse de s'annoncer comme l'action
  // évidente à faire.
  bloque?: boolean;
  // Liste de lots : le rappel sur la revérification est affiché une fois pour
  // toute la carte, pas sous chaque lot.
  compact?: boolean;
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
              variant={t.cible === "disponible" && !bloque ? "default" : "outline"}
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
      {AILLEURS[etat] && (
        <p className="text-xs text-muted-foreground">{AILLEURS[etat]}</p>
      )}
      {!compact && (
        <p className="text-xs text-muted-foreground">
          État actuel : {ETATS_LOT[etat] ?? etat}.
          {/* La phrase sur la mise en location n'a de sens que si le bouton est là. */}
          {transitions.some((t) => t.cible === "disponible") &&
            " La mise en location vérifie une dernière fois qu'il ne manque rien au lot."}
        </p>
      )}
    </div>
  );
}
