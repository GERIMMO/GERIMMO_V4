"use client";
import { useId } from "react";
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import { declarerReglementFacture, retirerReglementFacture, type EtatReglementAction } from "@/app/actions/reglement-facture";
import { MESSAGE_AUCUN_PAIEMENT, MESSAGE_IMPUTATION_LOCATAIRE, MOYENS_REGLEMENT } from "@/lib/reglement-facture";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { CleEnvoi } from "@/components/cle-envoi";
import { InputDateJour } from "@/components/input-date-jour";
import { Label } from "@/components/ui/label";

/**
 * « Déclarer un règlement » sur une facture validée (décision D23, option A ; fiche B.8).
 *
 * Le montant est prérempli au reste à régler, la date au jour de Paris (plafonnée à aujourd'hui), le moyen à
 * « virement » ; la référence est facultative. Le champ du montant est du texte à clavier décimal, jamais
 * `type="number"` (VER-TS-02 : « 840,00 » lu 84000 par un navigateur non francophone). La clé d'envoi (D05) rejoue le
 * même envoi après une réponse perdue sans doubler le règlement. Gerimmo n'effectue aucun paiement : l'écran le dit.
 */
export function FormulaireReglement({
  orgId,
  factureId,
  resteEuros,
  imputationLocataire,
}: {
  orgId: string;
  factureId: string;
  /** Le reste à régler, déjà formaté « 139,68 » pour le champ (deux décimales, virgule). */
  resteEuros: string;
  imputationLocataire: boolean;
}) {
  const id = useId();
  const [etat, action] = useActionState<EtatReglementAction, FormData>(declarerReglementFacture.bind(null, orgId, factureId), {});
  return (
    <form data-saisie-confirmee action={action} className="space-y-3 rounded-lg border border-[var(--filet)] p-3">
      <CleEnvoi etat={etat} />
      <h4 className="font-medium">Déclarer un règlement</h4>
      {imputationLocataire && (
        <p role="note" className="rounded-lg border-l-4 border-[var(--warning)] bg-[var(--warning-soft)] px-3.5 py-3 text-sm text-[var(--warning-soft-foreground)]">
          {MESSAGE_IMPUTATION_LOCATAIRE}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${id}-montant`}>Montant réglé (€)</Label>
          <input
            id={`${id}-montant`}
            name="montant"
            type="text"
            inputMode="decimal"
            required
            defaultValue={etat.valeurs?.montant ?? resteEuros}
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          />
          <p className="text-xs text-muted-foreground">Prérempli au reste à régler ; un règlement partiel est possible.</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-date`}>Date du règlement</Label>
          <InputDateJour id={`${id}-date`} name="date_reglement" required pasDansLeFutur valeurSoumise={etat.valeurs?.date_reglement} className="h-9 text-sm" />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-moyen`}>Moyen de règlement</Label>
          <select id={`${id}-moyen`} name="moyen" defaultValue={etat.valeurs?.moyen ?? "virement"} className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm">
            {Object.entries(MOYENS_REGLEMENT).map(([valeur, libelle]) => (
              <option key={valeur} value={valeur}>{libelle}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-reference`}>Référence (facultative)</Label>
          <input
            id={`${id}-reference`}
            name="reference"
            type="text"
            maxLength={200}
            defaultValue={etat.valeurs?.reference ?? ""}
            placeholder="numéro de virement, de chèque…"
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          />
          <p className="text-xs text-muted-foreground">Visible de vous seul : l’artisan ne voit que la date et le moyen.</p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{MESSAGE_AUCUN_PAIEMENT} Une dépense « Travaux » est écrite au journal, datée du règlement.</p>
      <BoutonEnvoi enCoursTexte="Enregistrement…">Enregistrer le règlement</BoutonEnvoi>
      {etat.erreur && <p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && <p role="status" className="text-sm text-success-soft-foreground">{etat.succes}</p>}
    </form>
  );
}

/** « Retirer ce règlement » : annulation motivée par contre-écriture, jamais de suppression (fiche B.8, critère 5). */
export function RetraitReglement({ orgId, reglementId }: { orgId: string; reglementId: string }) {
  const id = useId();
  const [etat, action] = useActionState<EtatReglementAction, FormData>(retirerReglementFacture.bind(null, orgId, reglementId), {});
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-[var(--marque-sombre)] underline">Retirer ce règlement</summary>
      <form data-saisie-confirmee action={action} className="mt-2 space-y-2">
        <Label htmlFor={id}>Motif du retrait</Label>
        <textarea
          id={id}
          name="motif"
          required
          maxLength={4000}
          defaultValue={etat.valeurs?.motif ?? ""}
          className="w-full rounded-md border p-2 text-sm"
          placeholder="Virement rejeté, saisie en double…"
        />
        <p className="text-xs text-muted-foreground">Une contre-écriture datée d’aujourd’hui annule la dépense ; le règlement reste visible, marqué « retiré ».</p>
        <BoutonEnvoi size="sm" variant="outline" enCoursTexte="Retrait…">Confirmer le retrait</BoutonEnvoi>
        {etat.erreur && <p role="alert" className="text-destructive">{etat.erreur}</p>}
        {etat.succes && <p role="status" className="text-success-soft-foreground">{etat.succes}</p>}
      </form>
    </details>
  );
}
