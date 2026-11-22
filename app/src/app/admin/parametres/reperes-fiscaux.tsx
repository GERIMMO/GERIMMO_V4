"use client";

import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import { reglerReperesFiscaux } from "@/app/actions/reperes-fiscaux";
import { etatVerification, libelleVerification, phrasesMicroFoncier, type ReperesFiscaux } from "@/lib/reperes-fiscaux";

/**
 * Les repères fiscaux affichés aux propriétaires (audit palier 1, P2-09) : le plafond et l'abattement du
 * micro-foncier, que l'aide du récapitulatif fiscal cite. `reperes` : le réglage enregistré (null = illisible) ;
 * `aujourdHui` : le jour de Paris, pour dire si la vérification date d'une année précédente. Aucun calcul ne lit ces
 * valeurs. Enregistrer date la vérification du jour : la case de confirmation est exigée.
 */
export function ReperesFiscauxReglage({ reperes, aujourdHui }: { reperes: ReperesFiscaux | null; aujourdHui: string }) {
  const [retour, action, pending] = useActionState(reglerReperesFiscaux, {});
  const etat = reperes === null ? "illisible" : etatVerification(reperes, aujourdHui);
  const phrases = phrasesMicroFoncier(reperes);
  return (
    <section className="loc-carte space-y-4" aria-labelledby="titre-reperes-fiscaux" data-reperes-fiscaux={etat}>
      <div className="entete-carte">
        <h2 id="titre-reperes-fiscaux">Repères fiscaux affichés aux propriétaires</h2>
        <span className={`puce ${etat === "verifie" ? "puce-loue" : "puce-prep"}`} data-etat-verification>{libelleVerification(reperes, aujourdHui)}</span>
      </div>
      <p className="text-sm">
        L’aide du récapitulatif fiscal cite deux valeurs du régime micro-foncier : le plafond de recettes brutes et
        l’abattement. Elles ne servent à aucun calcul ; seule la phrase d’aide les affiche. Une loi de finances peut
        les modifier : contrôlez-les une fois par an sur le site officiel des impôts, puis enregistrez-les ici.
      </p>
      {reperes === null ? (
        <p role="alert" className="err">
          Les repères fiscaux ne peuvent pas être lus. En attendant, l’aide du récapitulatif fiscal ne cite aucune
          valeur. Rechargez la page avant de les modifier.
        </p>
      ) : (
        <>
          <div className="rounded-lg border border-[var(--bordure)] p-4 text-sm" data-phrase-affichee>
            <p className="font-semibold">Ce que lisent les propriétaires aujourd’hui</p>
            <p className="mt-1">{phrases.regle}</p>
            <p className="mt-1">{phrases.verification}</p>
          </div>
          {/* La clé remonte le formulaire après un enregistrement : les champs repartent des valeurs enregistrées. */}
          <form key={`${reperes.plafondEuros}-${reperes.abattementPourcent}-${reperes.verifieLe ?? ""}`} action={action} className="space-y-3" data-saisie-confirmee>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block min-w-0 text-sm" htmlFor="repere-plafond">
                Plafond de recettes brutes, en euros
                <input id="repere-plafond" name="plafond" type="text" inputMode="numeric" required pattern="[0-9 ]{4,9}" maxLength={9} defaultValue={String(reperes.plafondEuros)} className="champ mt-1 block w-full" />
              </label>
              <label className="block min-w-0 text-sm" htmlFor="repere-abattement">
                Abattement, en pour cent
                <input id="repere-abattement" name="abattement" type="text" inputMode="numeric" required pattern="[0-9]{1,2}" maxLength={2} defaultValue={String(reperes.abattementPourcent)} className="champ mt-1 block w-full" />
              </label>
            </div>
            <label htmlFor="repere-confirmation" className="flex items-start gap-2 text-sm">
              <input id="repere-confirmation" type="checkbox" name="confirmation" value="oui" required className="mt-1" />
              <span>J’ai contrôlé ces deux valeurs aujourd’hui sur le site officiel des impôts.</span>
            </label>
            <BoutonEnvoi enCours={pending} enCoursTexte="Enregistrement…">Enregistrer et dater la vérification</BoutonEnvoi>
          </form>
        </>
      )}
      {retour.erreur && <p role="alert" className="err">{retour.erreur}</p>}
      {retour.succes && <p role="status" className="text-sm">{retour.succes}</p>}
      <p className="text-sm text-[var(--texte-secondaire)]">
        Chaque enregistrement est inscrit au journal de la supervision, avec les valeurs précédentes. Sans date de
        vérification, l’aide dit aux propriétaires de contrôler ces valeurs dans la notice officielle.
      </p>
    </section>
  );
}
