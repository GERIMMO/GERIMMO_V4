import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { aujourdhuiParis, formaterDate } from "@/lib/ged";
import { FormulaireGelConservation } from "./formulaire-gel-conservation";

export type Conservation = {
  etat: string;
  duree_mois: number | null;
  echeance: string | null;
  gelee_jusqu_au: string | null;
  gel_motif: string | null;
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
export function CarteConservationBail({ conservation, orgId, bailId, base }: {
  /** Le résultat de `lire_conservation_bail`, ou null si la lecture a échoué. */
  conservation: unknown;
  orgId: string;
  bailId: string;
  base: string;
}) {
  const c = (conservation ?? null) as Conservation | null;
  const aujourdHui = aujourdhuiParis();
  const gelEnCours = Boolean(c?.gelee_jusqu_au && c.gelee_jusqu_au >= aujourdHui);
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
          <p role="alert" className="err">La durée de conservation de ce bail n&apos;a pas pu être lue. Rechargez la page.</p>
        ) : (
          <>
            {c.etat !== "termine" ? (
              <p className="text-sm">
                Rien n&apos;est supprimé tant que le bail n&apos;est pas terminé. Le compte des {c.duree_mois ?? 36} mois part
                de la fin du bail, de l&apos;état des lieux de sortie ou de la restitution du dépôt, la plus tardive des trois.
              </p>
            ) : c.echeance ? (
              <p className="text-sm">
                Les pièces de ce bail seront supprimées à partir du <strong>{formaterDate(c.echeance)}</strong>. Vous serez
                prévenu trente jours avant ; téléchargez d&apos;ici là celles que vous devez conserver.
              </p>
            ) : (
              <p className="text-sm">Aucune date de suppression n&apos;est fixée pour les pièces de ce bail.</p>
            )}
            {gelEnCours && (
              <p role="status" className="rounded-lg border border-[var(--filet)] bg-[var(--filet-leger)] p-3 text-sm">
                Suppression suspendue jusqu&apos;au <strong>{formaterDate(c.gelee_jusqu_au)}</strong> : {c.gel_motif}
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
