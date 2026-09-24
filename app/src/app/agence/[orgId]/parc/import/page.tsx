import { notFound } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";
import { ROLES_RESPONSABLES } from "@/lib/ged";
import { COLONNES } from "@/lib/import-parc";
import { EnteteFiche } from "@/components/fiche-parc";
import { FormulaireImport } from "./formulaire-import";

export const metadata = { title: "Import des lots — Gerimmo" };

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
  const { role, estProprietaire } = await verifierAccesEspace(orgId);
  // Un import engage tout le parc : il appartient au responsable, pas à un
  // agent. La base le revérifie (importer_parc).
  if (!role || !ROLES_RESPONSABLES.includes(role)) notFound();
  // UN NOM PAR ÉCRAN, CELUI DU MENU (24/09). Le lien d'entrée disait
  // « Reprendre un parc », la page « Reprendre mon parc », le retour « ← Mon
  // parc » — alors que le propriétaire arrive de « Mes lots ». Le retour porte
  // le nom de l'entrée du menu ; l'écran et son lien d'entrée, le même titre.
  const libelleParc = estProprietaire ? "Mes lots" : "Parc de l'agence";
  const titre = estProprietaire ? "Importer mes lots" : "Reprendre le parc";
  // Ce qui décide si le fichier passera se lit sans ouvrir le dépliage.
  const obligatoires = COLONNES.filter(([, , requise]) => requise).map(([, libelle]) =>
    // « Type (appartement, maison…) » : le nom de la colonne suffit ici.
    libelle.replace(/\s*\(.*\)$/, "")
  );

  return (
    // max-w-2xl et l'en-tête des fiches, comme « Nouveau bien », sa page sœur
    // (24/09) : même retour gris, même titre à filet, même largeur.
    <main className="mx-auto w-full max-w-2xl space-y-5 p-4 sm:p-7">
      <EnteteFiche
        retour={{ href: `/agence/${orgId}/parc`, libelle: libelleParc }}
        titre={titre}
        sousTitre={
          // Un seul locuteur (24/09) : « vous », ni l'organisation (« Parc de
          // Claire Moreau récupère… ») ni l'éditeur en marque blanche.
          <>
            Un tableur, une ligne par lot : le bien, son lot, son propriétaire,
            et le locataire en place s&apos;il y en a un. Vous récupérez en une
            fois ce qu&apos;il faudrait sinon saisir écran par écran.
          </>
        }
      />

      <section className="loc-carte">
        <div className="entete-carte">
          <h3>1. Le gabarit</h3>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Partez de ce fichier, ou reprenez l&apos;export de votre outil actuel :
          les en-têtes sont reconnus sans tenir compte des accents ni de la
          casse, et les colonnes inconnues sont ignorées, pas refusées.
        </p>
        <a href={`/agence/${orgId}/parc/import/modele`} className="btn-or mt-3">
          Télécharger le gabarit
        </a>
        <p className="mt-3 text-sm">
          <span className="font-medium">Obligatoires :</span>{" "}
          {obligatoires.join(", ")}
          <span className="text-muted-foreground"> — tout le reste est facultatif.</span>
        </p>

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
        <p className="mt-1 text-sm text-muted-foreground">
          Le contrôle n&apos;écrit rien : il dit, ligne par ligne, ce qui
          passera. L&apos;import ne devient possible qu&apos;ensuite.
        </p>
        {/* La règle la plus lourde de conséquences de l'import vit ICI, dans
            la carte, à la taille du texte (24/09) : en 12 px gris sous les
            cartes, c'était le texte le moins lu de la page. */}
        <p className="mt-2 mb-4 text-sm text-muted-foreground">
          Les baux arrivent <b>en brouillon</b>, et c&apos;est voulu : activer un
          bail passe par les contrôles de mise en location (diagnostics, état des
          lieux, mentions obligatoires). Un import qui créerait des baux actifs
          les contournerait en masse — ce que ces contrôles existent précisément
          pour empêcher.
        </p>
        <FormulaireImport orgId={orgId} />
      </section>
    </main>
  );
}
