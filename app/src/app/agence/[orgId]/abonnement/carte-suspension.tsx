import Link from "next/link";

// L'ESPACE SUSPENDU OU ARCHIVÉ PAR LA SUPERVISION (audit final du 27/10/2026, DRT-04).
//
// La page disait « Vos droits d'accès payés ont pris fin… Souscrivez ci-dessous pour reprendre la saisie » à un
// responsable dont l'espace venait d'être suspendu par Gerimmo : diagnostic faux, et une souscription qui ne relève
// pas de lui. Cette carte remplace alors l'encadré « lecture seule » et le bloc de souscription.
export function CarteEspaceSuspendu({ archive }: { archive: boolean }) {
  return (
    <div role="status" className="loc-carte border-l-4 border-l-[var(--destructive)]">
      <p className="mesure-lecture text-sm">
        <b className="font-semibold">{archive ? "Votre espace est archivé par Gerimmo." : "Votre espace est suspendu par Gerimmo."}</b>{" "}
        <span className="text-muted-foreground">
          La saisie est fermée par une décision de notre équipe, et seule elle peut la rouvrir&nbsp;: aucune souscription
          n&apos;est à engager d&apos;ici là. Rien n&apos;a été supprimé&nbsp;: vous pouvez tout consulter et tout
          exporter. Pour en connaître la raison ou demander la réouverture,{" "}
          <Link href="/assistance" className="font-semibold underline underline-offset-2">
            écrivez-nous
          </Link>
          .
        </span>
      </p>
    </div>
  );
}
