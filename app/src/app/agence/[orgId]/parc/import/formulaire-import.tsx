"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { importerParc, type EtatImport } from "@/app/actions/import-parc";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Label } from "@/components/ui/label";

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
  // « qu'est-ce qui a été créé » : le tableau change de sens, pas de forme.
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
          <BoutonEnvoi variant="outline" enCoursTexte="Lecture…">
            Contrôler le fichier
          </BoutonEnvoi>
          {/* La bascule n'apparaît qu'APRÈS un contrôle : on ne fait pas
              basculer un parc sur un fichier que personne n'a regardé. */}
          {etat.controle && ok.length > 0 && (
            <BoutonEnvoi name="bascule" value="1" enCoursTexte="Import…">
              Importer {ok.length} ligne{ok.length > 1 ? "s" : ""}
            </BoutonEnvoi>
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

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-sm">
              <caption className="sr-only">
                Résultat ligne par ligne de {apresBascule ? "l'import" : "la lecture du fichier"}
              </caption>
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th scope="col" className="py-1.5 pr-3 font-normal">Ligne</th>
                  <th scope="col" className="py-1.5 pr-3 font-normal">État</th>
                  <th scope="col" className="py-1.5 font-normal">Détail</th>
                </tr>
              </thead>
              <tbody>
                {resultats.map((r) => (
                  <tr key={r.ligne} className="border-t border-[var(--filet)] align-top">
                    <td className="py-2 pr-3 tabular-nums">{r.ligne}</td>
                    <td className="py-2 pr-3">
                      <span className={`puce ${r.statut === "ok" ? "puce-loue" : "puce-rouge"}`}>
                        {r.statut === "ok" ? (apresBascule ? "créée" : "prête") : "à corriger"}
                      </span>
                    </td>
                    <td className="py-2">
                      {r.lot_id ? (
                        <Link
                          href={`/agence/${orgId}/parc/${r.bien_id}/lots/${r.lot_id}`}
                          className="lien-discret"
                        >
                          {r.message}
                        </Link>
                      ) : (
                        r.message
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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
