import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { aujourdhuiParis, formaterDate } from "@/lib/ged";
import { FormulaireGelConservation } from "./formulaire-gel-conservation";

export type Conservation = {
  etat: string;
  duree_mois: number | null;
  echeance: string | null;
  gelee_jusqu_au: string | null;
  gel_motif: string | null;
  /** Le « gel » en cours est le préavis de trente jours posé par la base à la levée d'un gel (relecture du 24/10). */
  preavis?: boolean;
  /** Le jour où les pièces se supprimeraient si le gel était levé maintenant (préavis compris). */
  echeance_si_levee?: string | null;
};

/** « AAAA-MM-JJ » + n mois, au calendrier (le dernier jour du mois si le jour n'existe pas). */
function plusMois(jour: string, mois: number): string {
  const [a, m, j] = jour.split("-").map(Number);
  const dernier = new Date(Date.UTC(a, m - 1 + mois + 1, 0)).getUTCDate();
  return new Date(Date.UTC(a, m - 1 + mois, Math.min(j, dernier))).toISOString().slice(0, 10);
}

function lendemain(jour: string): string {
  const d = new Date(`${jour}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Conservation des pièces d'un bail (plan de conformité du 23/10/2026, lots 1E et 2) : la date à laquelle les pièces
 * arrivent au terme de leur durée de conservation, et le gel en cas de litige (douze mois au plus, renouvelable).
 * Lecture et geste passent par la base (`lire_conservation_bail`, lue par la page ; `geler_conservation_bail`).
 */
export function CarteConservationBail({ conservation, erreur, orgId, bailId, base }: {
  /** Le résultat de `lire_conservation_bail`, ou null si la lecture a échoué. */
  conservation: unknown;
  /** Pourquoi la lecture a échoué : bail hors des droits du compte (« acces », 42501) ou panne (« lecture »). */
  erreur?: "acces" | "lecture";
  orgId: string;
  bailId: string;
  base: string;
}) {
  const c = (conservation ?? null) as Conservation | null;
  const aujourdHui = aujourdhuiParis();
  const suspendu = Boolean(c?.gelee_jusqu_au && c.gelee_jusqu_au >= aujourdHui);
  const preavis = suspendu && c?.preavis === true;
  const gelEnCours = suspendu && !preavis;
  return (
    <Card id="conservation" className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="text-base">Conservation des pièces</CardTitle>
        <CardDescription>
          Les pièces d&apos;un bail terminé sont supprimées au terme de leur durée de conservation, indiquée dans la
          politique de confidentialité. Un litige en cours suspend la suppression.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!c ? (
          erreur === "acces" ? (
            <p role="status" className="text-sm">La conservation des pièces de ce bail n&apos;est pas accessible depuis votre compte.</p>
          ) : (
            <p role="alert" className="err">La durée de conservation de ce bail n&apos;a pas pu être lue. Rechargez la page.</p>
          )
        ) : (
          <>
            {c.etat !== "termine" ? (
              c.duree_mois ? (
                <p className="text-sm">
                  Rien n&apos;est supprimé tant que le bail n&apos;est pas terminé. Le compte des {c.duree_mois} mois part de la
                  plus tardive de ces dates : fin du bail, sortie réelle du locataire, état des lieux de sortie, restitution du
                  dépôt de garantie ou dernière modification du bail.
                </p>
              ) : (
                <p className="text-sm">
                  Rien n&apos;est supprimé tant que le bail n&apos;est pas terminé. Aucune durée de conservation n’est active pour
                  les pièces d’un bail : rien ne sera supprimé avant son activation.
                </p>
              )
            ) : c.echeance ? (
              <p className="text-sm">
                Les pièces de ce bail seront supprimées à partir du <strong>{formaterDate(c.echeance)}</strong>. Vous serez
                prévenu trente jours avant ; téléchargez d&apos;ici là celles que vous devez conserver.
              </p>
            ) : (
              <p className="text-sm">Aucune date de suppression n&apos;est fixée pour les pièces de ce bail.</p>
            )}
            {gelEnCours && (
              <div role="status" className="space-y-1 rounded-lg border border-[var(--filet)] bg-[var(--filet-leger)] p-3 text-sm">
                <p>Suppression suspendue jusqu’au <strong>{formaterDate(c.gelee_jusqu_au)}</strong> : {c.gel_motif}</p>
                {c.echeance_si_levee && (
                  <p>Si vous levez le gel, les pièces seront supprimées à partir du {formaterDate(c.echeance_si_levee)}.</p>
                )}
              </div>
            )}
            {preavis && (
              <p role="status" className="rounded-lg border border-[var(--filet)] bg-[var(--filet-leger)] p-3 text-sm">
                Gel levé : préavis de trente jours avant la suppression des pièces. Si un litige reprend, suspendez de nouveau la
                suppression ci-dessous.
              </p>
            )}
            <FormulaireGelConservation
              orgId={orgId}
              bailId={bailId}
              base={base}
              minimum={lendemain(aujourdHui)}
              maximum={plusMois(aujourdHui, 12)}
              gelEnCours={gelEnCours}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
