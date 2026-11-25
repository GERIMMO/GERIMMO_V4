"use client";

import { useId, useState } from "react";
import { useActionFormulaire } from "@/lib/use-action-formulaire";
import { annulerAvenantBail, enregistrerAvenantBail, type EtatAvenantBailAction } from "@/app/actions/avenant-bail";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChampFichier } from "@/components/champ-fichier";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";

const classeTextarea = "w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm";
const classeSelect = "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";

/** « 650.5 » s'écrit « 650,5 » dans un champ : c'est ainsi qu'on le tape, et que le serveur le relit. */
const pourChamp = (n: number) => String(n).replace(".", ",");

/**
 * Les deux gestes de l'avenant signé (audit palier 1, P1-14) : l'enregistrer, ou l'annuler tant qu'il attend.
 *
 * UN SEUL composant pour les deux, toujours monté : après un geste, la page se recharge et le formulaire qui vient de
 * servir disparaît (un avenant en attente remplace le formulaire d'enregistrement, et inversement). Le message de
 * confirmation, lui, doit rester lisible : il vit ici.
 */
export function GestesAvenantSigne({
  orgId,
  bailId,
  attenteId,
  dates,
  loyerActuel,
  chargesActuelles,
  libelleCharges,
  aujourdhui,
}: {
  orgId: string;
  bailId: string;
  /** L'avenant qui attend sa date d'effet, s'il y en a un : on ne peut alors que l'annuler. */
  attenteId: string | null;
  /** Les dates d'effet que la base acceptera, la plus proche d'abord. Vide : aucun avenant ne peut plus prendre effet. */
  dates: { valeur: string; libelle: string }[];
  loyerActuel: number;
  chargesActuelles: number;
  /** « Provision pour charges » ou « Forfait de charges », selon le bail. */
  libelleCharges: string;
  aujourdhui: string;
}) {
  const id = useId();
  const [dernier, setDernier] = useState<"enregistrement" | "annulation" | null>(null);
  const enregistrement = useActionFormulaire<EtatAvenantBailAction>((etat, form) => {
    setDernier("enregistrement");
    return enregistrerAvenantBail(orgId, bailId, etat, form);
  }, true);
  const annulation = useActionFormulaire<EtatAvenantBailAction>(async (etat, form) => {
    setDernier("annulation");
    if (!attenteId) return { erreur: "Aucun avenant n’attend plus son application. Rechargez la page." };
    return annulerAvenantBail(orgId, bailId, attenteId, etat, form);
  }, true);
  const confirmation = dernier === "enregistrement" ? enregistrement.etat.succes : dernier === "annulation" ? annulation.etat.succes : undefined;

  return (
    <div className="space-y-3" data-gestes-avenant>
      {confirmation && <p role="status" className="text-sm text-success-soft-foreground">{confirmation}</p>}

      {attenteId ? (
        <details data-annuler-avenant className="text-sm">
          <summary className="lien-discret inline-flex min-h-11 cursor-pointer items-center">Annuler cet avenant</summary>
          <form data-saisie-confirmee key={annulation.version} onSubmit={annulation.soumettre} className="mt-2 space-y-3">
            <p className="text-muted-foreground">
              Possible tant que sa date d’effet n’est pas atteinte. L’avenant annulé et sa pièce restent au dossier ; le
              loyer et les charges du bail ne changent pas.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-motif`}>Pourquoi l’annuler</Label>
              <textarea id={`${id}-motif`} name="motif_annulation" rows={2} required minLength={5} maxLength={500} className={classeTextarea}
                placeholder="Ex. erreur de saisie sur le montant" />
            </div>
            {annulation.etat.erreur && <p role="alert" className="text-sm text-destructive">{annulation.etat.erreur}</p>}
            <BoutonEnvoi enCours={annulation.enCours} variant="outline">Annuler l’avenant</BoutonEnvoi>
          </form>
        </details>
      ) : dates.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-avenant-sans-date>
          Ce bail se termine avant le prochain loyer à appeler : un avenant ne pourrait plus y prendre effet.
        </p>
      ) : (
        <form data-saisie-confirmee data-enregistrer-avenant key={enregistrement.version} onSubmit={enregistrement.soumettre} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-objet`}>Objet de l’avenant</Label>
            <Input id={`${id}-objet`} name="objet" required minLength={5} maxLength={500} placeholder="Ex. baisse du loyer convenue avec le locataire" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-signe`}>Signé le</Label>
              <Input id={`${id}-signe`} name="signe_le" type="date" required max={aujourdhui} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-effet`}>S’applique à partir du</Label>
              <select id={`${id}-effet`} name="date_effet" required defaultValue={dates[0].valeur} className={classeSelect} aria-describedby={`${id}-effet-aide`}>
                {dates.map((d) => <option key={d.valeur} value={d.valeur}>{d.libelle}</option>)}
              </select>
            </div>
          </div>
          <p id={`${id}-effet-aide`} className="text-xs text-muted-foreground">
            Toujours le 1er d’un mois dont le loyer n’est pas encore appelé : un loyer déjà appelé n’est jamais modifié.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-loyer`}>Loyer hors charges après l’avenant (€)</Label>
              <Input id={`${id}-loyer`} name="loyer_hc" inputMode="decimal" required defaultValue={pourChamp(loyerActuel)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-charges`}>{libelleCharges} après l’avenant (€)</Label>
              <Input id={`${id}-charges`} name="charges" inputMode="decimal" required defaultValue={pourChamp(chargesActuelles)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-fichier`}>Avenant signé par les parties (PDF, JPEG ou PNG)</Label>
            <ChampFichier depotDirect id={`${id}-fichier`} name="fichier" required accept=".pdf,.jpg,.jpeg,.png" />
          </div>
          {enregistrement.etat.erreur && <p role="alert" className="text-sm text-destructive">{enregistrement.etat.erreur}</p>}
          <BoutonEnvoi enCours={enregistrement.enCours} enCoursTexte="Enregistrement…">Enregistrer l’avenant signé</BoutonEnvoi>
        </form>
      )}
    </div>
  );
}
