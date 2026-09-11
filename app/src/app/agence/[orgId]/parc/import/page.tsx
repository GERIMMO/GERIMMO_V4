import Link from "next/link";
import { notFound } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";
import { ROLES_RESPONSABLES } from "@/lib/ged";
import { COLONNES } from "@/lib/import-parc";
import { FormulaireImport } from "./formulaire-import";

export const metadata = { title: "Reprendre mon parc — Gerimmo" };

/**
 * La reprise d'un parc existant (module 16.3 : « dizaines de lots, ligne par
 * ligne, sans reprise du passé »).
 *
 * Sans elle, une agence qui arrive avec cinquante lots les saisit un par un —
 * six écrans, cinquante fois. Aucun essai de quatorze jours ne survit à ça.
 */
export default async function PageImportParc(
  props: PageProps<"/agence/[orgId]/parc/import">
) {
  const { orgId } = await props.params;
  const { role, organisation } = await verifierAccesEspace(orgId);
  // Un import engage tout le parc : il appartient au responsable, pas à un
  // agent. La base le revérifie (importer_parc).
  if (!role || !ROLES_RESPONSABLES.includes(role)) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 p-4 sm:p-7">
      <div>
        <Link href={`/agence/${orgId}/parc`} className="lien-discret text-[13px]">
          ← Mon parc
        </Link>
        <h1 className="mt-2">Reprendre mon parc</h1>
        <p className="mesure-lecture mt-1 text-sm text-muted-foreground">
          Un tableur, une ligne par lot : le bien, son lot, son propriétaire, et
          le locataire en place s&apos;il y en a un. {organisation.name} récupère
          en une fois ce qu&apos;il faudrait saisir écran par écran.
        </p>
      </div>

      <section className="loc-carte">
        <div className="entete-carte">
          <h3>1. Le gabarit</h3>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Partez de ce fichier, ou reprenez l&apos;export de votre outil actuel :
          les en-têtes sont reconnus sans tenir compte des accents ni de la
          casse, et les colonnes que Gerimmo ne connaît pas sont ignorées, pas
          refusées.
        </p>
        <a href={`/agence/${orgId}/parc/import/modele`} className="btn-or mt-3">
          Télécharger le gabarit
        </a>

        <details className="mt-4">
          <summary className="cursor-pointer text-sm">Les colonnes, une par une</summary>
          <ul className="mt-2 space-y-1 text-[13px] text-muted-foreground">
            {COLONNES.map(([cle, libelle, requise]) => (
              <li key={cle}>
                <span className={requise ? "font-medium text-[var(--corps)]" : ""}>{libelle}</span>
                {requise && <span className="text-[var(--destructive)]"> — obligatoire</span>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[13px] text-muted-foreground">
            Une ligne sans locataire crée le lot et sa détention, sans bail.
            Deux lignes portant le même nom de bien atterrissent dans le même
            immeuble ; deux fois le même propriétaire ne font qu&apos;une fiche.
          </p>
        </details>
      </section>

      <section className="loc-carte">
        <div className="entete-carte">
          <h3>2. Le fichier, contrôlé puis importé</h3>
        </div>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Le contrôle n&apos;écrit rien : il dit, ligne par ligne, ce qui
          passera. L&apos;import ne devient possible qu&apos;ensuite.
        </p>
        <FormulaireImport orgId={orgId} />
      </section>

      <p className="mesure-lecture text-xs text-muted-foreground">
        Les baux arrivent <b>en brouillon</b>, et c&apos;est voulu : activer un
        bail passe par les contrôles de mise en location (diagnostics, état des
        lieux, mentions obligatoires). Un import qui créerait des baux actifs
        les contournerait en masse — ce que ces contrôles existent précisément
        pour empêcher.
      </p>
    </main>
  );
}
