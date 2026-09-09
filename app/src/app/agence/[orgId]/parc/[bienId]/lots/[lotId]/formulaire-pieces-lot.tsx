"use client";

import { useActionState } from "react";
import {
  ajouterPieceLot,
  supprimerPieceLot,
  proposerPiecesLot,
  type EtatParc,
} from "@/app/actions/parc";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Input } from "@/components/ui/input";

export type PieceLot = { id: string; nom: string };

const COURANTES = ["Entrée", "Séjour", "Cuisine", "Chambre", "Salle de bain", "WC", "Couloir"];

// L'erreur de l'action s'affiche sous la pièce — avant, elle était jetée
// (audit vie du bail 09/09).
function BoutonRetirer({ orgId, bienId, lotId, pieceId }: { orgId: string; bienId: string; lotId: string; pieceId: string }) {
  const [etat, formAction] = useActionState<EtatParc, FormData>(
    () => supprimerPieceLot(orgId, bienId, lotId, pieceId),
    {}
  );
  return (
    <>
      <form action={formAction}>
        <BoutonEnvoi variant="ghost" size="sm">
          Retirer
        </BoutonEnvoi>
      </form>
      {etat.erreur && <p className="w-full text-sm text-destructive">{etat.erreur}</p>}
    </>
  );
}

function FormProposition({
  orgId,
  bienId,
  lotId,
}: {
  orgId: string;
  bienId: string;
  lotId: string;
}) {
  const [etat, action] = useActionState<EtatParc, FormData>(
    async () => proposerPiecesLot(orgId, bienId, lotId),
    {}
  );
  return (
    <form action={action} className="space-y-1">
      <BoutonEnvoi size="sm" enCoursTexte="…">
        Proposer les pièces de ce logement
      </BoutonEnvoi>
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && (
        <p className="text-sm text-success-soft-foreground">{etat.succes}</p>
      )}
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
  const [etat, formAction] = useActionState<EtatParc, FormData>(action, {});

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        La liste des pièces sert à générer la grille d&apos;état des lieux, pièce par pièce.
      </p>

      {pieces.length === 0 ? (
        // La page blanche fait sauter l'étape. On propose la liste d'un coup,
        // d'après le nombre de pièces du lot : retirer est plus rapide qu'écrire.
        <div className="space-y-2 rounded-lg bg-muted p-3">
          <p className="text-sm">
            Aucune pièce déclarée. L&apos;état des lieux se résumera alors à une
            grille générale — sols, murs, plafonds — sans distinguer la cuisine de
            la chambre. C&apos;est ce document qui permet, ou non, de retenir une
            somme sur le dépôt de garantie à la sortie.
          </p>
          <FormProposition orgId={orgId} bienId={bienId} lotId={lotId} />
        </div>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {pieces.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-1 rounded-full border border-border pl-3 text-sm">
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
            <BoutonEnvoi variant="outline" size="sm">
              + {nom}
            </BoutonEnvoi>
          </form>
        ))}
      </div>

      {/* Ajout libre */}
      <form action={formAction} className="flex items-end gap-2">
        {/* En erreur, la saisie est reposée via etat.valeurs (recette 22/08) */}
        <Input name="nom" maxLength={60} placeholder="Autre pièce (ex. Bureau, Dressing)…" className="max-w-xs" defaultValue={etat.valeurs?.nom} />
        <BoutonEnvoi size="sm" variant="outline" enCoursTexte="Ajout…">
          Ajouter
        </BoutonEnvoi>
      </form>
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
    </div>
  );
}
