"use client";
import { useState } from "react";
import { useActionStateProtegee } from "@/lib/use-action-state-protegee";
import { modifierCollaborateur } from "@/app/actions/organisation";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";

type Membre = { account_id: string; email: string; role: string };

export function GestionCollaborateur({ orgId, membre, equipe }: { orgId: string; membre: Membre; equipe: Membre[] }) {
  const [operation, choisir] = useState("");
  const [etat, envoyer] = useActionStateProtegee(modifierCollaborateur.bind(null, orgId, membre.account_id), {});
  return <details className="basis-full">
    <summary className="min-h-11 cursor-pointer content-center py-2 text-sm font-semibold">Gérer l’accès de {membre.email}</summary>
    <form data-saisie-confirmee action={envoyer} className="grid max-w-md gap-3 py-3">
      <label>Action sur cet accès
        <select name="operation" required value={operation} onChange={e => choisir(e.target.value)} className="block w-full">
          <option value="">Choisir une action</option>
          <option value="retirer">Retirer l’accès à cette agence</option>
          {membre.role === "agent" ? <option value="admin_agence">Donner les droits de responsable</option> : <option value="agent">Limiter aux droits d’agent</option>}
        </select>
      </label>
      {operation === "retirer" && <label>Confier les mandats en cours à
        <select name="repreneur" required defaultValue="" className="block w-full">
          <option value="">Choisir un membre actif</option>
          {equipe.filter(m => m.account_id !== membre.account_id).map(m => <option key={m.account_id} value={m.account_id}>{m.email}</option>)}
        </select>
      </label>}
      {operation && <label key={operation}><input type="checkbox" name="confirme" value="oui" required/> Je confirme cette modification pour {membre.email}.</label>}
      <BoutonEnvoi disabled={!operation} enCoursTexte="Modification…">Appliquer</BoutonEnvoi>
      {etat.erreur && <p role="alert" className="err">{etat.erreur}</p>}
      {etat.succes && <p role="status">{etat.succes}</p>}
    </form>
  </details>;
}
