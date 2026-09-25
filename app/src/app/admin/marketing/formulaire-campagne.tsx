"use client";

import { useActionState } from "react";
import { programmerCampagne, type EtatCampagne } from "./actions";

const ETAT: EtatCampagne = {};

// Les champs portent enfin un cadre (24/09) : sans classe, ils n'avaient ni
// bordure ni fond et restaient sur la ligne de leur libellé — on ne voyait pas
// où saisir. Même habillage que les autres formulaires de la console
// (retours/decisions-retour.tsx).
const champ = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

// Les objectifs viennent de la page, qui les affiche aussi dans le calendrier :
// une seule table, un seul libellé par objectif (24/09).
export function FormulaireCampagne({ objectifs }: { objectifs: [string, string][] }) {
  const [etat, action, attente] = useActionState(programmerCampagne, ETAT);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
      <label className="grid gap-1 sm:col-span-2 xl:col-span-1"><span className="libelle-champ">Nom de l’intention</span><input className={champ} name="nom" minLength={3} maxLength={160} required placeholder="Ex. Lancement dans le Nord" /></label>
      <label className="grid gap-1"><span className="libelle-champ">Date visée (heure de Paris)</span><input className={champ} type="datetime-local" name="publication_prevue_le" required /></label>
      <label className="grid gap-1"><span className="libelle-champ">Objectif</span><select className={champ} name="objectif" defaultValue="notoriete">{objectifs.map(([valeur, libelle]) => <option key={valeur} value={valeur}>{libelle}</option>)}</select></label>
      {/* La diffusion n'est plus un choix (25/09) : la publicité payante n'est
          pas ouverte, et le champ « Budget » laissait croire le contraire. */}
      <div className="grid gap-1 sm:col-span-2 xl:col-span-1"><span className="libelle-champ">Diffusion</span><p className={`${champ} text-[var(--texte-secondaire)]`}>Publication gratuite sur la Page Facebook. La publicité payante n’est pas encore ouverte : les droits Meta Ads sont en attente.</p><input type="hidden" name="nature" value="organique" /></div>
      <label className="grid gap-1 sm:col-span-2 xl:col-span-1"><span className="libelle-champ">Message et angle</span><textarea className={champ} name="description" rows={3} maxLength={1200} placeholder="Ce que Gerimmo doit raconter, à qui et pourquoi." /></label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 xl:col-span-1"><button className="btn-or" disabled={attente}>{attente ? "Enregistrement…" : "Noter l’intention"}</button>{etat.erreur && <p role="alert" className="err">{etat.erreur}</p>}{etat.succes && <p role="status" className="text-sm text-[var(--success)]">{etat.succes}</p>}</div>
    </form>
  );
}
