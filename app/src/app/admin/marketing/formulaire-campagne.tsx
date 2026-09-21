"use client";

import { useActionState } from "react";
import { programmerCampagne, type EtatCampagne } from "./actions";

const ETAT: EtatCampagne = {};

export function FormulaireCampagne() {
  const [etat, action, attente] = useActionState(programmerCampagne, ETAT);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <label className="sm:col-span-2"><span className="libelle-champ">Nom de la campagne</span><input name="nom" minLength={3} maxLength={160} required placeholder="Ex. Lancement dans le Nord" /></label>
      <label><span className="libelle-champ">Date et heure</span><input type="datetime-local" name="publication_prevue_le" required /></label>
      <label><span className="libelle-champ">Objectif</span><select name="objectif" defaultValue="notoriete"><option value="notoriete">Faire connaître Gerimmo</option><option value="trafic">Amener des visites</option><option value="prospects">Obtenir des contacts</option><option value="conversion">Obtenir des inscriptions</option></select></label>
      <label><span className="libelle-champ">Diffusion</span><select name="nature" defaultValue="organique"><option value="organique">Publication gratuite</option><option value="sponsorisee">Publicité sponsorisée</option></select></label>
      <label><span className="libelle-champ">Budget total en euros</span><input name="budget" inputMode="decimal" placeholder="0 pour une publication gratuite" /></label>
      <label className="sm:col-span-2"><span className="libelle-champ">Message et angle</span><textarea name="description" rows={3} maxLength={1200} placeholder="Ce que Gerimmo doit raconter, à qui et pourquoi." /></label>
      <div className="sm:col-span-2 flex flex-wrap items-center gap-3"><button className="btn-or" disabled={attente}>{attente ? "Enregistrement…" : "Programmer"}</button>{etat.erreur && <p role="alert" className="err">{etat.erreur}</p>}{etat.succes && <p role="status" className="text-sm text-[var(--success)]">{etat.succes}</p>}</div>
    </form>
  );
}
