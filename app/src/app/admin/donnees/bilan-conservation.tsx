"use client";
import { useState, useTransition } from "react";
import { simulerConservation, type BilanConservation } from "@/app/actions/retention";

export function BilanConservationContacts() {
  const [bilan, setBilan] = useState<BilanConservation | null>(null);
  const [enCours, lancer] = useTransition();
  return <section className="loc-carte space-y-3" id="conservation-contacts" aria-labelledby="titre-conservation-contacts">
    <h2 id="titre-conservation-contacts">Invitations et contacts anciens</h2>
    <p className="text-sm text-muted-foreground">Voir ce qui a atteint sa durée de conservation. Les invitations acceptées, les comptes et les preuves de signature sont conservés par ce contrôle.</p>
    <button className="btn-secondaire" disabled={enCours} onClick={() => lancer(async () => {
      try { setBilan(await simulerConservation()); }
      catch { setBilan({ erreur: "Le bilan est indisponible. Aucun nettoyage n’a été lancé." }); }
    })}>{enCours ? "Lecture…" : "Afficher le bilan sans supprimer"}</button>
    {bilan?.erreur && <p role="alert" className="err">{bilan.erreur}</p>}
    {bilan?.categories && <div role="status" className="space-y-3 text-sm">
      <p><strong>Aucune suppression.</strong> {bilan.preuves_protegees} pièce(s) de signature protégée(s) du nettoyage automatique.</p>
      <ul className="divide-y">{bilan.categories.map(c => <li className="py-2" key={c.categorie}><strong>{c.libelle}</strong> · {c.echus} arrivé(s) à échéance après {c.duree_mois} mois<p className="text-muted-foreground">{c.actif ? "Nettoyage programmé selon le catalogue" : "Nettoyage désactivé — durée préparée, à valider avant activation"}</p></li>)}</ul>
    </div>}
  </section>;
}
