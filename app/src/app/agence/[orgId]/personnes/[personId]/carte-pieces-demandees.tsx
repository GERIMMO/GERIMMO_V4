"use client";

import Link from "next/link";
import { FormulairePiece } from "./formulaire-piece";
import { useActionState, useId } from "react";
import {
  demanderPieceLocataire,
  relancerPieceDemandee,
  annulerPieceDemandee,
  type EtatPieceDemandee,
} from "@/app/actions/pieces-demandees";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { buttonVariants } from "@/components/ui/button";
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
  peutRelancer,
}: {
  orgId: string;
  personId: string;
  demandeId: string;
  peutRelancer: boolean;
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
      {peutRelancer && <form action={actionRel}>
        <BoutonEnvoi variant="outline" size="sm">
          Relancer
        </BoutonEnvoi>
      </form>}
      <form action={actionAnn}>
        <BoutonEnvoi variant="ghost" size="sm">
          Annuler
        </BoutonEnvoi>
      </form>
      {etatRel.succes && <span role="status" className="text-xs text-success-soft-foreground">{etatRel.succes}</span>}
      {etatRel.avertissement && <span role="status" className="text-xs text-warning-soft-foreground">{etatRel.avertissement}</span>}
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
  aUnAcces = true,
}: {
  orgId: string;
  personId: string;
  demandes: PieceDemandee[];
  tronquees?: boolean;
  aUnAcces?: boolean;
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
      {!aUnAcces && <p className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">Les demandes restent enregistrées dans la fiche. <Link href="#acces-locataire" className="underline underline-offset-4">Invitez la personne à son espace</Link> pour qu’elle puisse déposer ses documents.</p>}
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
              <span className="puce puce-prep shrink-0">{aUnAcces ? "En attente" : "À inviter"}</span>
              <BoutonsDemande orgId={orgId} personId={personId} demandeId={d.id} peutRelancer={aUnAcces} />
              <details className="w-full rounded-lg border border-border bg-muted/20 px-3">
                <summary className="cursor-pointer py-2 text-xs font-medium">J’ai le document — le déposer moi-même</summary>
                <FormulairePiece orgId={orgId} personId={personId} demande={d} />
              </details>
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
        {/* Des BOUTONS « + RIB »… sous un libellé : en pastilles grises, ils
            avaient l'apparence exacte des états « en attente » / « reçue »,
            rien ne disait qu'on pouvait cliquer (24/09). `.puce` = un état. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Demandes fréquentes :</span>
          {LIBELLES_COURANTS.map(([libelle]) => (
            <button
              key={libelle}
              type="button"
              className={buttonVariants({ variant: "outline", size: "xs" })}
              onClick={(e) => {
                const form = e.currentTarget.closest("form");
                const champ = form?.querySelector<HTMLInputElement>('input[name="libelle"]');
                const type = form?.querySelector<HTMLSelectElement>('select[name="type"]');
                const trouve = LIBELLES_COURANTS.find(([l]) => l === libelle);
                if (champ) champ.value = libelle;
                if (type && trouve) type.value = trouve[1];
              }}
            >
              <span aria-hidden>+</span> {libelle}
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
            maxLength={120}
            placeholder="Pièce à demander (ex. : RIB)"
            defaultValue={etat.valeurs?.libelle}
            // h-8 rounded-lg : la boîte de <Input>, comme le reste de la fiche
            className="h-8 min-w-44 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm"
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
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="justificatif">Justificatif</option>
            <option value="piece_identite">Pièce d&apos;identité</option>
          </select>
          {/* Taille par défaut (h-8) : à côté d'un champ h-8, le bouton sm
              paraissait plus petit que son voisin (24/09). */}
          <BoutonEnvoi variant="outline">{aUnAcces ? "Envoyer la demande" : "Préparer la demande"}</BoutonEnvoi>
        </div>
        {etat.succes && <p className="text-sm text-success-soft-foreground">{etat.succes}</p>}
        {etat.avertissement && <p role="status" className="text-sm text-warning-soft-foreground">{etat.avertissement}</p>}
        {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
        {/* Plus de note de pied (24/09) : elle redisait la description de la
            carte, en appelant « locataire » ce que celle-ci nomme « personne ». */}
      </form>
    </div>
  );
}
