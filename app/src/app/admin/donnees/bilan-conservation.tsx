"use client";
import { useState, useTransition } from "react";
import { simulerConservation, type BilanConservation } from "@/app/actions/retention";

// Le bilan sans suppression couvre toutes les catégories du catalogue (plan de conformité du 23/10, lot 2) : c'est lui
// qu'on lit avant d'activer une règle, une à une (« Afficher le bilan sans supprimer », puis noter les nombres).
export function BilanConservationContacts() {
  const [bilan, setBilan] = useState<BilanConservation | null>(null);
  const [enCours, lancer] = useTransition();
  return <section className="loc-carte space-y-3" id="conservation-contacts" aria-labelledby="titre-conservation-contacts">
    <h2 id="titre-conservation-contacts">Durées de conservation et nettoyages</h2>
    <p className="text-sm text-muted-foreground">Voir, catégorie par catégorie, ce qui a atteint sa durée de conservation. Ce bilan ne supprime rien. Une règle désactivée ne s’applique qu’après son activation, une à une, après lecture de ce bilan.</p>
    <button className="btn-secondaire" disabled={enCours} onClick={() => lancer(async () => {
      try { setBilan(await simulerConservation()); }
      catch { setBilan({ erreur: "Le bilan est indisponible. Aucun nettoyage n’a été lancé." }); }
    })}>{enCours ? "Lecture…" : "Afficher le bilan sans supprimer"}</button>
    {bilan?.erreur && <p role="alert" className="err">{bilan.erreur}</p>}
    {bilan?.categories && <div role="status" className="space-y-3 text-sm">
      <p><strong>Aucune suppression.</strong> {bilan.preuves_protegees} pièce(s) de signature protégée(s) tant que le bail qu’elles prouvent n’est pas arrivé au terme de sa conservation.</p>
      <ul className="divide-y">{bilan.categories.map(c => <li className="py-2" key={c.categorie}><strong>{c.libelle}</strong> · {c.echus === null ? "nombre non calculé" : `${c.echus} arrivé(s) à échéance`} · durée : {c.duree_mois} mois
        <p className="text-muted-foreground">{c.echus === null ? "Nettoyage pas encore écrit dans le code : rien n’est supprimé" : c.actif ? "Nettoyage programmé selon le catalogue" : "Nettoyage désactivé — durée préparée, à valider avant activation"}</p></li>)}</ul>
    </div>}
  </section>;
}
