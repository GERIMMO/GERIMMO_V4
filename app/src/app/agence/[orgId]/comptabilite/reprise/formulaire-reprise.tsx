"use client";

import { useActionState, useId } from "react";
import { reprendreSoldes, type EtatReprise } from "@/app/actions/reprise-comptable";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { eur } from "@/lib/ged";

/** « 2026-10-01 » — la date du jour, pour partir de quelque chose de plausible. */
function aujourdhui(): string {
  return new Date().toISOString().slice(0, 10);
}

export function FormulaireReprise({ orgId }: { orgId: string }) {
  const [etat, action] = useActionState<EtatReprise, FormData>(
    reprendreSoldes.bind(null, orgId),
    {}
  );
  const base = useId();

  const resultats = etat.resultats ?? [];
  const erreurs = resultats.filter((r) => r.statut === "erreur");
  const alertes = resultats.filter((r) => r.statut === "alerte");
  const tresorerieDetail = resultats
    .filter((r) => r.tresorerie && r.statut !== "erreur")
    .reduce((t, r) => t + r.montant, 0);
  const ecart =
    etat.tresorerieAnnoncee === undefined
      ? null
      : Math.round((etat.tresorerieAnnoncee - tresorerieDetail) * 100) / 100;
  const juste = ecart !== null && ecart === 0 && erreurs.length === 0;

  return (
    <div className="space-y-5">
      <form action={action} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${base}-date`}>Date de bascule</Label>
            <Input
              id={`${base}-date`}
              name="date_bascule"
              type="date"
              required
              defaultValue={etat.dateBascule ?? aujourdhui()}
            />
            <p className="text-xs text-muted-foreground">
              Le jour où les comptes passent chez vous. Les dépôts et les
              avances seront datés de ce jour.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${base}-tresorerie`}>Trésorerie reprise (€)</Label>
            <Input
              id={`${base}-tresorerie`}
              name="tresorerie"
              inputMode="decimal"
              required
              defaultValue={etat.tresorerieAnnoncee ?? ""}
              // Un exemple se dit exemple : « 42000 » seul passait pour une
              // valeur déjà saisie (24/09).
              placeholder="ex. 42 000"
            />
            <p className="text-xs text-muted-foreground">
              Ce que vous recevez réellement. Le détail du fichier devra le
              justifier à l&apos;euro près.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${base}-fichier`}>Votre balance (CSV)</Label>
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

        {/* Le contenu et la reprise voyagent avec le formulaire : « Basculer »
            ne doit ni redemander le fichier, ni ouvrir une seconde reprise. */}
        {etat.contenu && <input type="hidden" name="contenu" value={etat.contenu} />}
        {etat.fichier && <input type="hidden" name="nom_fichier" value={etat.fichier} />}
        {etat.reprise && <input type="hidden" name="reprise" value={etat.reprise} />}

        {/* L'irréversibilité se lit LÀ où l'on clique « Basculer », pas
            seulement dans les notes du bas de page (24/09). */}
        <p className="text-sm">
          <b>La bascule est définitive</b> : après elle, on corrige par écritures
          rectificatives, pas par une seconde reprise — c&apos;est ce qu&apos;exige
          une comptabilité, et ce qui vous protège.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {/* « Contrôler » est le geste qui fait avancer le parcours : bouton
              plein. Dès que « Basculer » (plein) apparaît à côté, il repasse
              en contour — un seul bouton plein à la fois (24/09). */}
          <BoutonEnvoi
            variant={etat.controle && juste ? "outline" : "default"}
            enCoursTexte="Lecture…"
          >
            Contrôler la balance
          </BoutonEnvoi>
          {/* La bascule n'apparaît que si le compte tombe juste : proposer un
              bouton que la base refusera n'aide personne. */}
          {etat.controle && juste && (
            <BoutonEnvoi name="bascule" value="1" enCoursTexte="Bascule…">
              Basculer {resultats.length} ligne{resultats.length > 1 ? "s" : ""}
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
          Colonnes ignorées, faute d&apos;équivalent : {etat.inconnues!.join(", ")}.
        </p>
      )}

      {etat.basculee && resultats.length > 0 && (
        <p role="status" className="rounded-lg bg-[var(--success-soft)] p-3 text-sm text-[var(--success-soft-foreground)]">
          Balance d&apos;ouverture enregistrée. Les dépôts détenus rejoignent les
          dépôts de garantie de chaque bail, les avances s&apos;imputeront sur le
          prochain appel, et les fonds mandants sont au compte mandant.
        </p>
      )}

      {resultats.length > 0 && (
        <section className="loc-carte" aria-labelledby={`${base}-bilan`}>
          <div className="entete-carte">
            <h3 id={`${base}-bilan`}>
              {etat.basculee ? "Ce qui a été repris" : "Ce que dit le contrôle"}
            </h3>
            <span className="mono-discret">{resultats.length} lignes</span>
          </div>

          {/* L'écart, en premier et en grand : c'est la seule question qui
              décide si la bascule est possible. */}
          {ecart !== null && (
            <div
              className={`mt-3 rounded-lg border p-3 ${
                ecart === 0
                  ? "border-[var(--success)] bg-[var(--success-soft)]"
                  : "border-[var(--destructive)] bg-[var(--destructive-soft)]"
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="libelle-champ">Écart</span>
                <span className="montant font-heading text-lg">{eur(ecart)}</span>
              </div>
              <p className="mt-1 text-xs">
                Vous annoncez {eur(etat.tresorerieAnnoncee ?? 0)}, le détail en
                justifie {eur(tresorerieDetail)}.
                {ecart === 0
                  ? " Le compte tombe juste."
                  : " La bascule reste fermée tant que l'écart n'est pas nul."}
              </p>
            </div>
          )}

          <p className="mt-3 text-sm text-muted-foreground">
            {erreurs.length > 0
              ? `${erreurs.length} ligne${erreurs.length > 1 ? "s" : ""} à corriger avant de basculer.`
              : alertes.length > 0
                ? `Rien ne bloque. ${alertes.length} ligne${alertes.length > 1 ? "s méritent" : " mérite"} votre attention.`
                : "Tout est lisible."}
          </p>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <caption className="sr-only">
                Résultat ligne par ligne de {etat.basculee ? "la bascule" : "la lecture de la balance"}
              </caption>
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th scope="col" className="py-1.5 pr-3 font-normal">Ligne</th>
                  <th scope="col" className="py-1.5 pr-3 font-normal">Nature</th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-normal">Montant</th>
                  <th scope="col" className="py-1.5 pr-3 font-normal">État</th>
                  <th scope="col" className="py-1.5 font-normal">Détail</th>
                </tr>
              </thead>
              <tbody>
                {resultats.map((r) => (
                  <tr key={r.ligne} className="border-t border-[var(--filet)] align-top">
                    <td className="py-2 pr-3 tabular-nums">{r.ligne}</td>
                    <td className="py-2 pr-3 text-[13px]">{r.type}</td>
                    <td className="montant py-2 pr-3 text-right tabular-nums">{eur(r.montant)}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={`puce ${
                          r.statut === "erreur"
                            ? "puce-rouge"
                            : r.statut === "alerte"
                              ? "puce-prep"
                              : "puce-loue"
                        }`}
                      >
                        {r.statut === "erreur"
                          ? "à corriger"
                          : r.statut === "alerte"
                            ? "à lire"
                            : etat.basculee
                              ? "reprise"
                              : "prête"}
                      </span>
                    </td>
                    <td className="py-2 text-[13px]">{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
