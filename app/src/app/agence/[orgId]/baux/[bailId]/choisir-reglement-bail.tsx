"use client";

import { useId } from "react";
import { utiliserReglementExistantBail } from "@/app/actions/reglement-existant-bail";
import { useActionFormulaire } from "@/lib/use-action-formulaire";
import { Label } from "@/components/ui/label";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import styles from "./documents-bail.module.css";

export function ChoisirReglementBail({ orgId, bailId, documents }: {
  orgId: string;
  bailId: string;
  documents: { id: string; titre: string | null }[];
}) {
  const id = useId();
  const { etat, soumettre, enCours } = useActionFormulaire(utiliserReglementExistantBail.bind(null, orgId, bailId));
  if (documents.length === 0) return null;
  return <form data-saisie-confirmee onSubmit={soumettre} className="space-y-3">
    <div className="space-y-2">
      <Label htmlFor={`${id}-document`}>Règlement déjà enregistré</Label>
      <select id={`${id}-document`} name="document_id" required className={styles.select}
        defaultValue={documents.length === 1 ? documents[0].id : ""}
        disabled={enCours || Boolean(etat.succes)} aria-describedby={etat.erreur ? `${id}-erreur` : undefined}>
        <option value="" disabled>Choisir un PDF…</option>
        {documents.map(document => <option key={document.id} value={document.id}>{document.titre || "Règlement de copropriété"}</option>)}
      </select>
    </div>
    {etat.erreur && <p id={`${id}-erreur`} role="alert" className="text-sm text-destructive">{etat.erreur}</p>}
    {etat.succes && <p role="status" className="text-sm text-success-soft-foreground">{etat.succes}</p>}
    <BoutonEnvoi enCours={enCours} disabled={Boolean(etat.succes)} variant="outline">Utiliser ce PDF</BoutonEnvoi>
  </form>;
}
