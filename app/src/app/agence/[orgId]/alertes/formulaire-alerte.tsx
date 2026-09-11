"use client";

import { useActionState, useEffect, useRef } from "react";
import { creerAlerte, type EtatAlerte } from "@/app/actions/alertes";
import { ASSIGNATION_TOUS } from "@/lib/alertes";
import { CRITICITES } from "@/lib/ged";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Membre = { account_id: string; email: string; role: string };

export function FormulaireAlerte({
  orgId,
  membres,
  estResponsable,
}: {
  orgId: string;
  membres: Membre[];
  // Seul le responsable de l'agence peut assigner à tout le monde
  estResponsable: boolean;
}) {
  const actionLiee = creerAlerte.bind(null, orgId);
  const [etat, action] = useActionState<EtatAlerte, FormData>(
    actionLiee,
    {}
  );
  const formulaire = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (etat.succes) formulaire.current?.reset();
  }, [etat]);

  return (
    <form ref={formulaire} action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="titre-alerte">Titre</Label>
        <Input
          id="titre-alerte"
          name="titre"
          required
          maxLength={200}
          defaultValue={etat.valeurs?.titre}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="criticite">Criticité</Label>
        <select
          id="criticite"
          name="criticite"
          defaultValue={etat.valeurs?.criticite ?? "normale"}
          className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
        >
          {Object.entries(CRITICITES).map(([valeur, libelle]) => (
            <option key={valeur} value={valeur}>
              {libelle}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Une alerte informative ne s&apos;escalade jamais.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="echeance">Échéance (facultatif)</Label>
        <Input id="echeance" name="echeance" type="date" defaultValue={etat.valeurs?.echeance} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="assignee">Assigné à</Label>
        <select
          id="assignee"
          name="assignee"
          required
          defaultValue={etat.valeurs?.assignee ?? ""}
          className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
        >
          <option value="" disabled>
            — Choisir —
          </option>
          {/* Seul le responsable de l'agence peut assigner à tout le monde */}
          {estResponsable && <option value={ASSIGNATION_TOUS}>Tout le monde</option>}
          {membres.map((m) => (
            <option key={m.account_id} value={m.account_id}>
              {m.email}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Une alerte est toujours assignée à au moins une personne.
        </p>
      </div>
      {/* Bloc d'erreur de la charte (.err), comme partout ailleurs */}
      {etat.erreur && (
        <p className="err mb-0" role="alert">
          {etat.erreur}
        </p>
      )}
      {etat.succes && (
        <p className="text-sm text-success-soft-foreground" role="status">
          {etat.succes}
        </p>
      )}
      <BoutonEnvoi className="w-full" enCoursTexte="Création…">
        Créer l&apos;alerte
      </BoutonEnvoi>
    </form>
  );
}
