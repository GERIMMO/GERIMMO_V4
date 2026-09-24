"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import { importerParc, type EtatImport } from "@/app/actions/import-parc";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

export function FormulaireImport({ orgId }: { orgId: string }) {
  const [etat, action] = useActionState<EtatImport, FormData>(
    importerParc.bind(null, orgId),
    {}
  );
  const base = useId();

  const resultats = etat.resultats ?? [];
  const ok = resultats.filter((r) => r.statut === "ok");
  const erreurs = resultats.filter((r) => r.statut === "erreur");
  const baux = ok.filter((r) => r.bail_id).length;
  // Après la bascule, la question n'est plus « est-ce que ça passe » mais
  // « qu'est-ce qui a été créé » : la liste change de sens, pas de forme.
  const apresBascule = resultats.length > 0 && etat.controle === false;

  return (
    <div className="space-y-5">
      <form action={action} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={`${base}-fichier`}>Votre fichier (CSV)</Label>
          <input
            id={`${base}-fichier`}
            name="fichier"
            type="file"
            accept=".csv,text/csv"
            className="block w-full text-sm file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-md file:border file:border-[var(--filet)] file:bg-[var(--ivoire)] file:px-3 file:text-sm"
          />
          {etat.fichier && (
            <p className="text-xs text-muted-foreground">
              Fichier lu : <b>{etat.fichier}</b>
            </p>
          )}
        </div>

        {/* Le contenu voyage avec le formulaire : « Importer » ne doit pas
            exiger de redéposer le fichier qu'on vient de contrôler. */}
        {etat.contenu && <input type="hidden" name="contenu" value={etat.contenu} />}
        {etat.fichier && <input type="hidden" name="nom_fichier" value={etat.fichier} />}

        <div className="flex flex-wrap items-center gap-2">
          <EnvoiImport classe="btn-secondaire" enCoursTexte="Lecture…">
            Contrôler le fichier
          </EnvoiImport>
          {/* La bascule n'apparaît qu'APRÈS un contrôle : on ne fait pas
              basculer un parc sur un fichier que personne n'a regardé. */}
          {etat.controle && ok.length > 0 && (
            <EnvoiImport classe="btn-or" name="bascule" value="1" enCoursTexte="Import…">
              Importer {ok.length} ligne{ok.length > 1 ? "s" : ""}
            </EnvoiImport>
          )}
        </div>

        {etat.erreur && (
          <p role="alert" className="text-sm text-destructive">
            {etat.erreur}
          </p>
        )}
      </form>

      {(etat.inconnues?.length ?? 0) > 0 && (
        <p className="text-xs text-muted-foreground">
          Colonnes ignorées, faute d&apos;équivalent :{" "}
          {etat.inconnues!.join(", ")}.
        </p>
      )}

      {resultats.length > 0 && (
        <section className="loc-carte" aria-labelledby={`${base}-bilan`}>
          <div className="entete-carte">
            <h3 id={`${base}-bilan`}>
              {apresBascule ? "Ce qui a été créé" : "Ce que dit le contrôle"}
            </h3>
            <span className="mono-discret">
              {ok.length} / {resultats.length}
            </span>
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
            {apresBascule
              ? `${ok.length} lot${ok.length > 1 ? "s" : ""} en place${
                  baux > 0
                    ? `, dont ${baux} avec un bail en brouillon — il reste à l'activer, lot par lot.`
                    : "."
                }`
              : erreurs.length === 0
                ? "Tout est lisible. L'import peut être lancé."
                : `${erreurs.length} ligne${erreurs.length > 1 ? "s" : ""} à corriger dans votre fichier avant d'importer — les autres passeront.`}
          </p>

          {/* Une rangée par ligne du fichier, comme les listes de lots. Une
              ligne créée ouvre son lot, et c'est TOUTE la rangée qui mène à
              la fiche (24/09) : dans l'ancien tableau, seul le texte de la
              colonne « Détail » était le lien, « Ligne » et « État » restaient
              des zones mortes. Une ligne sans lot (contrôle, ou refusée)
              reste une phrase, sans l'effet de survol d'un lien. */}
          <ol
            className="colonne-liste mt-3"
            aria-label={`Résultat ligne par ligne de ${apresBascule ? "l'import" : "la lecture du fichier"}`}
          >
            {resultats.map((r) => {
              const contenu = (
                <>
                  <span className="min-w-0 flex-1">
                    <b className="block break-words">{r.message}</b>
                    <small className="block tabular-nums">Ligne {r.ligne}</small>
                  </span>
                  <span className={`puce shrink-0 ${r.statut === "ok" ? "puce-loue" : "puce-rouge"}`}>
                    {r.statut === "ok" ? (apresBascule ? "créée" : "prête") : "à corriger"}
                  </span>
                </>
              );
              return (
                // Le filet entre rangées est porté par le <li> : dans son
                // <li>, chaque `.rang` est aussi le dernier enfant, et
                // `.rang:last-child` lui retire le sien.
                <li key={r.ligne} className="border-b border-[var(--filet)] last:border-b-0">
                  {r.lot_id && r.bien_id ? (
                    <Link href={`/agence/${orgId}/parc/${r.bien_id}/lots/${r.lot_id}`} className="rang">
                      {contenu}
                    </Link>
                  ) : (
                    <div className="rang hover:border-l-transparent hover:bg-transparent">{contenu}</div>
                  )}
                </li>
              );
            })}
          </ol>

          {apresBascule && baux > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Un bail en brouillon ne facture rien : il s&apos;active depuis la
              fiche du lot, une fois les diagnostics et l&apos;état des lieux
              déposés. Votre parc en dit la liste, lot par lot.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

/**
 * Le bouton d'envoi de cette page, sur les classes de la page (24/09).
 *
 * « Télécharger le gabarit » est un `.btn-or` (40 px, rayon 10 px) ; les deux
 * envois passaient par BoutonEnvoi, donc par <Button> (32 px, rayon 8 px) :
 * trois styles de bouton d'une carte à l'autre. Poser `.btn-or` sur <Button>
 * ne suffit pas — ses utilitaires (`h-8`, `rounded-lg`, `px-2.5`) l'emportent
 * sur les composants de globals.css. On garde donc le comportement de
 * BoutonEnvoi (désactivé et roue pendant l'envoi, libellé d'attente) sur un
 * <button> natif, qui monte en outre à 44 px au doigt comme tout bouton.
 */
function EnvoiImport({
  classe,
  enCoursTexte,
  children,
  ...props
}: Omit<React.ComponentProps<"button">, "className" | "type"> & {
  classe: "btn-or" | "btn-secondaire";
  enCoursTexte: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      // `.btn-secondaire` est en 14 px, `.btn-or` en 13 px : deux pixels de
      // hauteur d'écart entre deux boutons posés côte à côte. Même corps ici.
      className={`${classe} text-[13px] disabled:pointer-events-none disabled:opacity-50`}
      {...props}
    >
      {pending && <Spinner />}
      {pending ? enCoursTexte : children}
    </button>
  );
}
