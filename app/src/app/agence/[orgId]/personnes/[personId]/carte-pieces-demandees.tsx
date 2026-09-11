"use client";

import { useActionState, useId } from "react";
import {
  demanderPieceLocataire,
  relancerPieceDemandee,
  annulerPieceDemandee,
  type EtatPieceDemandee,
} from "@/app/actions/pieces-demandees";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Label } from "@/components/ui/label";
import { formaterDate } from "@/lib/ged";

export type PieceDemandee = {
  id: string;
  type: string;
  libelle: string;
  note: string | null;
  demandee_le: string;
  relancee_le: string | null;
  satisfaite_le: string | null;
};

// Libellés proposés d'un clic — les demandes qui reviennent tout le temps
const LIBELLES_COURANTS: [string, string][] = [
  ["RIB", "justificatif"],
  ["Avis d'imposition", "justificatif"],
  ["Justificatif de domicile", "justificatif"],
  ["Pièce d'identité", "piece_identite"],
];

function BoutonsDemande({
  orgId,
  personId,
  demandeId,
}: {
  orgId: string;
  personId: string;
  demandeId: string;
}) {
  const [etatRel, actionRel] = useActionState<EtatPieceDemandee, FormData>(
    async () => relancerPieceDemandee(orgId, personId, demandeId),
    {}
  );
  const [etatAnn, actionAnn] = useActionState<EtatPieceDemandee, FormData>(
    async () => annulerPieceDemandee(orgId, personId, demandeId),
    {}
  );
  return (
    <span className="flex shrink-0 items-center gap-1">
      <form action={actionRel}>
        <BoutonEnvoi variant="outline" size="sm">
          Relancer
        </BoutonEnvoi>
      </form>
      <form action={actionAnn}>
        <BoutonEnvoi variant="ghost" size="sm">
          Annuler
        </BoutonEnvoi>
      </form>
      {(etatRel.erreur || etatAnn.erreur) && (
        <span className="text-xs text-destructive">{etatRel.erreur ?? etatAnn.erreur}</span>
      )}
    </span>
  );
}

// « Pièces réclamées » (RM-0b.2.5) : demander une pièce au locataire — elle
// s'affiche dans son espace avec un bouton de dépôt, et se solde toute seule.
export function CartePiecesDemandees({
  orgId,
  personId,
  demandes,
  // La fiche ne charge que les demandes les plus récentes : la carte le dit
  // plutôt que de laisser croire à un historique complet.
  tronquees = false,
}: {
  orgId: string;
  personId: string;
  demandes: PieceDemandee[];
  tronquees?: boolean;
}) {
  const [etat, action] = useActionState<EtatPieceDemandee, FormData>(
    demanderPieceLocataire.bind(null, orgId, personId),
    {}
  );
  const idLibelle = useId();
  const idType = useId();
  const enAttente = demandes.filter((d) => !d.satisfaite_le);
  const recues = demandes.filter((d) => d.satisfaite_le);

  return (
    <div className="space-y-3">
      {enAttente.length > 0 && (
        <ul className="divide-y divide-border">
          {enAttente.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <b className="font-medium">{d.libelle}</b>
                <small className="block text-muted-foreground">
                  demandée le {formaterDate(d.demandee_le)}
                  {d.relancee_le ? ` · relancée le ${formaterDate(d.relancee_le)}` : ""}
                  {d.note ? ` · ${d.note}` : ""}
                </small>
              </span>
              <span className="puce puce-prep shrink-0">en attente</span>
              <BoutonsDemande orgId={orgId} personId={personId} demandeId={d.id} />
            </li>
          ))}
        </ul>
      )}
      {recues.length > 0 && (
        <ul className="divide-y divide-border">
          {recues.map((d) => (
            <li key={d.id} className="flex items-center gap-2 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <b className="font-medium">{d.libelle}</b>
                <small className="block text-muted-foreground">
                  déposée le {formaterDate(d.satisfaite_le!)} — au dossier de la personne
                </small>
              </span>
              <span className="puce puce-loue shrink-0">reçue</span>
            </li>
          ))}
        </ul>
      )}

      {tronquees && (
        <p className="text-xs text-muted-foreground">
          Les {demandes.length} demandes les plus récentes — les plus anciennes
          ne sont pas listées ici.
        </p>
      )}
      <form action={action} className="space-y-2 border-t border-border pt-3">
        <div className="flex flex-wrap gap-1.5">
          {LIBELLES_COURANTS.map(([libelle]) => (
            <button
              key={libelle}
              type="button"
              className="puce puce-grise cursor-pointer hover:bg-[var(--ardoise)]"
              onClick={(e) => {
                const form = e.currentTarget.closest("form");
                const champ = form?.querySelector<HTMLInputElement>('input[name="libelle"]');
                const type = form?.querySelector<HTMLSelectElement>('select[name="type"]');
                const trouve = LIBELLES_COURANTS.find(([l]) => l === libelle);
                if (champ) champ.value = libelle;
                if (type && trouve) type.value = trouve[1];
              }}
            >
              {libelle}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {/* Ligne compacte : libellés réservés à la synthèse vocale */}
          <Label htmlFor={idLibelle} className="sr-only">
            Nom de la pièce demandée
          </Label>
          <input
            id={idLibelle}
            name="libelle"
            placeholder="Pièce à demander (ex. : RIB)"
            defaultValue={etat.valeurs?.libelle}
            className="h-9 min-w-44 flex-1 rounded-md border border-input bg-transparent px-3 text-sm"
          />
          {/* « Type de pièce » tout court est DÉJÀ le nom d'un champ visible
              de la carte juste au-dessus (dépôt d'une pièce) : deux contrôles
              au même nom sur une page laissent choisir au hasard. Celui-ci dit
              la demande, comme son voisin « Nom de la pièce demandée ». */}
          <Label htmlFor={idType} className="sr-only">
            Type de la pièce demandée
          </Label>
          <select
            id={idType}
            name="type"
            defaultValue={etat.valeurs?.type ?? "justificatif"}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="justificatif">Justificatif</option>
            <option value="piece_identite">Pièce d&apos;identité</option>
          </select>
          <BoutonEnvoi size="sm" variant="outline">
            Demander
          </BoutonEnvoi>
        </div>
        {etat.succes && <p className="text-sm text-success-soft-foreground">{etat.succes}</p>}
        {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
        <p className="text-xs text-muted-foreground">
          La demande s&apos;affiche dans l&apos;espace du locataire avec un bouton de
          dépôt ; la pièce déposée rejoint son dossier et la demande se solde.
        </p>
      </form>
    </div>
  );
}
