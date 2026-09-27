"use client";

import { useActionState, useState } from "react";
import { retablirBien, retirerBien, type EtatRetraitBien } from "@/app/actions/retrait-bien";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Button } from "@/components/ui/button";

// Retirer un bien du parc — ou l'y remettre (audit du 27/09). Un archivage,
// pas une suppression : l'historique (baux terminés, écritures, documents)
// reste, le bien sort du parc et de l'abonnement. Le geste demande une
// confirmation : il archive aussi les lots libres du bien.
export function CarteRetraitBien({
  orgId,
  bienId,
  retireLe,
  bailEnCours,
  estProprietaire,
}: {
  orgId: string;
  bienId: string;
  /** Date de retrait (ISO) — null : le bien est au parc. */
  retireLe: string | null;
  /** Un lot du bien est loué ou en préavis : le retrait sera refusé. */
  bailEnCours: boolean;
  estProprietaire: boolean;
}) {
  const [confirmer, setConfirmer] = useState(false);
  const [etatRetrait, actionRetrait] = useActionState<EtatRetraitBien, FormData>(
    retirerBien.bind(null, orgId, bienId),
    {}
  );
  const [etatRetour, actionRetour] = useActionState<EtatRetraitBien, FormData>(
    retablirBien.bind(null, orgId, bienId),
    {}
  );
  const abonnement = estProprietaire ? " et de votre abonnement" : "";

  if (retireLe) {
    return (
      <section id="retrait" className="scroll-mt-20 rounded-md border border-border p-4 text-sm" aria-labelledby="retrait-titre">
        <h2 id="retrait-titre" className="text-base">Bien retiré du parc</h2>
        <p className="mt-1 text-muted-foreground">
          Retiré le {new Date(retireLe).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}
          {estProprietaire ? " : il n'est plus compté dans votre abonnement." : "."} Son
          historique reste consultable.
        </p>
        {etatRetour.succes ? (
          <p className="mt-2 text-success-soft-foreground">{etatRetour.succes}</p>
        ) : (
          <form action={actionRetour} className="mt-3">
            <BoutonEnvoi variant="outline" size="sm" enCoursTexte="Remise au parc…" className="min-h-11">
              Remettre ce bien au parc
            </BoutonEnvoi>
            {estProprietaire && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Il sera de nouveau compté dans votre abonnement.
              </p>
            )}
            {etatRetour.erreur && (
              <p className="err !mt-2 !mb-0" role="alert">
                {etatRetour.erreur}
              </p>
            )}
          </form>
        )}
      </section>
    );
  }

  return (
    <section id="retrait" className="scroll-mt-20 rounded-md border border-border p-4 text-sm" aria-labelledby="retrait-titre">
      <h2 id="retrait-titre" className="text-base">Retirer ce bien</h2>
      {bailEnCours ? (
        <p className="mt-1 text-muted-foreground">
          Un lot de ce bien est loué&nbsp;: le bien ne peut pas être retiré tant que le
          bail court. Le départ se constate sur le bail (congé, état des lieux de sortie).
        </p>
      ) : etatRetrait.succes ? (
        <p className="mt-1 text-success-soft-foreground">{etatRetrait.succes}</p>
      ) : (
        <>
          <p className="mt-1 text-muted-foreground">
            Vendu, créé par erreur, plus en gestion&nbsp;? Retiré, il sort du parc
            {abonnement} ; ses lots libres sont archivés avec lui. Rien n&apos;est
            supprimé, et le geste se défait.
          </p>
          {!confirmer ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 min-h-11"
              onClick={() => setConfirmer(true)}
            >
              Retirer ce bien…
            </Button>
          ) : (
            <form action={actionRetrait} className="mt-3 flex flex-wrap items-center gap-2">
              <BoutonEnvoi variant="destructive" size="sm" enCoursTexte="Retrait…" className="min-h-11">
                Confirmer le retrait
              </BoutonEnvoi>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-11"
                onClick={() => setConfirmer(false)}
              >
                Annuler
              </Button>
            </form>
          )}
          {etatRetrait.erreur && (
            <p className="err !mt-2 !mb-0" role="alert">
              {etatRetrait.erreur}
            </p>
          )}
        </>
      )}
    </section>
  );
}
