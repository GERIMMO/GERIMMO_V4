"use client";
import { useEffect, useId, useRef, useState } from "react";
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
 *
 * Le composant reste monté quand la facture est soldée (reste à zéro) : il remplace alors le formulaire par la phrase
 * « réglée en totalité ». Sinon l'action, qui revalide la page, démonterait le formulaire avec son message de succès,
 * que personne ne lirait ni n'entendrait, et le focus tomberait sur la page. La région de statut est hors du formulaire,
 * toujours présente ; elle reçoit le focus après un succès.
 */
export function FormulaireReglement({
  orgId,
  factureId,
  resteCents,
  imputationLocataire,
}: {
  orgId: string;
  factureId: string;
  /** Le reste à régler, en centimes. À zéro, la facture est soldée : plus de formulaire, la phrase d'état et le message restent. */
  resteCents: number;
  imputationLocataire: boolean;
}) {
  const id = useId();
  const [etat, action] = useActionState<EtatReglementAction, FormData>(declarerReglementFacture.bind(null, orgId, factureId), {});
  const soldee = resteCents <= 0;
  // Le champ reçoit « 139,68 » : deux décimales, virgule.
  const resteEuros = (Math.max(resteCents, 0) / 100).toFixed(2).replace(".", ",");
  // Le message de succès vaut pour la facture telle que SA réponse l'a laissée : si un règlement retiré la rouvre ensuite
  // (le reste remonte), l'ancien « Règlement … enregistré » ne reste pas affiché sous un formulaire de nouveau ouvert.
  // Un règlement ne fait que baisser le reste : le message n'est donc jamais masqué par la réponse qui l'apporte.
  const [reponse, setReponse] = useState({ etat, resteCents });
  if (reponse.etat !== etat) setReponse({ etat, resteCents });
  const succes = resteCents > reponse.resteCents ? undefined : etat.succes;
  const statut = useMessageDeStatut(etat, succes);
  return (
    <div className="space-y-2">
      {soldee ? (
        <p className="text-sm text-muted-foreground">La facture est réglée en totalité (déclaration, sans paiement bancaire par Gerimmo). L’artisan voit la date et le moyen de chaque règlement.</p>
      ) : (
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
    </form>
      )}
      <p ref={statut} role="status" tabIndex={-1} className="text-sm text-success-soft-foreground focus:outline-none">{succes ?? ""}</p>
    </div>
  );
}

/** Après un succès (nouvelle réponse de l'action), le focus va sur la région de statut : le bouton qui l'avait a pu disparaître. */
function useMessageDeStatut(etat: EtatReglementAction, succes: string | undefined) {
  const statut = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (succes) statut.current?.focus();
  }, [etat, succes]);
  return statut;
}

/**
 * « Retirer ce règlement » : annulation motivée par contre-écriture, jamais de suppression (fiche B.8, critère 5).
 * Une fois le règlement retiré (`retrait`, la phrase « Retiré le … »), le composant reste monté et remplace le formulaire
 * par cette phrase : le message de succès et le focus survivent à la revalidation de la page.
 */
export function RetraitReglement({ orgId, reglementId, retrait }: { orgId: string; reglementId: string; retrait: string | null }) {
  const id = useId();
  const [etat, action] = useActionState<EtatReglementAction, FormData>(retirerReglementFacture.bind(null, orgId, reglementId), {});
  const statut = useMessageDeStatut(etat, etat.succes);
  return (
    <div className="text-sm">
    {retrait ? <p>{retrait}</p> : (
    <details>
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
      </form>
    </details>
    )}
    <p ref={statut} role="status" tabIndex={-1} className="text-success-soft-foreground focus:outline-none">{etat.succes ?? ""}</p>
    </div>
  );
}
