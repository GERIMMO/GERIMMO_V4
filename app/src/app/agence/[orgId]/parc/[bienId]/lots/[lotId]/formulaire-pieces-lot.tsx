"use client";

import { useActionState } from "react";
import { ajouterPieceLot, supprimerPieceLot, type EtatParc } from "@/app/actions/parc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type PieceLot = { id: string; nom: string };

const COURANTES = ["Entrée", "Séjour", "Cuisine", "Chambre", "Salle de bain", "WC", "Couloir"];

function BoutonRetirer({ orgId, bienId, lotId, pieceId }: { orgId: string; bienId: string; lotId: string; pieceId: string }) {
  return (
    <form
      action={async () => {
        await supprimerPieceLot(orgId, bienId, lotId, pieceId);
      }}
    >
      <Button type="submit" variant="ghost" size="sm">
        Retirer
      </Button>
    </form>
  );
}

export function FormulairePiecesLot({
  orgId,
  bienId,
  lotId,
  pieces,
}: {
  orgId: string;
  bienId: string;
  lotId: string;
  pieces: PieceLot[];
}) {
  const action = ajouterPieceLot.bind(null, orgId, bienId, lotId);
  const [etat, formAction, enCours] = useActionState<EtatParc, FormData>(action, {});

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        La liste des pièces sert à générer la grille d&apos;état des lieux, pièce par pièce.
      </p>

      {pieces.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucune pièce définie — la grille d&apos;état des lieux restera générique tant qu&apos;il n&apos;y en a pas.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {pieces.map((p) => (
            <li key={p.id} className="flex items-center gap-1 rounded-full border border-border pl-3 text-sm">
              {p.nom}
              <BoutonRetirer orgId={orgId} bienId={bienId} lotId={lotId} pieceId={p.id} />
            </li>
          ))}
        </ul>
      )}

      {/* Ajout rapide des pièces courantes */}
      <div className="flex flex-wrap gap-1.5">
        {COURANTES.map((nom) => (
          <form
            key={nom}
            action={async () => {
              const fd = new FormData();
              fd.set("nom", nom);
              await ajouterPieceLot(orgId, bienId, lotId, {}, fd);
            }}
          >
            <Button type="submit" variant="outline" size="sm">
              + {nom}
            </Button>
          </form>
        ))}
      </div>

      {/* Ajout libre */}
      <form action={formAction} className="flex items-end gap-2">
        <Input name="nom" maxLength={60} placeholder="Autre pièce (ex. Bureau, Dressing)…" className="max-w-xs" />
        <Button type="submit" size="sm" variant="outline" disabled={enCours}>
          {enCours ? "Ajout…" : "Ajouter"}
        </Button>
      </form>
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
    </div>
  );
}
