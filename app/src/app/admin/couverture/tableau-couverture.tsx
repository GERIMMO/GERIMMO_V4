"use client";

import Link from "next/link";
import { useId, useState } from "react";
import type { LignePilotageReseau } from "@/lib/reseau";

const champ = "min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm";

/**
 * Couverture constatée du réseau, commune par commune, pour un métier (décision du dirigeant du 23/10/2026) : chaque
 * artisan choisit sa zone et ses métiers ; la supervision ne décide plus d'aucune ouverture. Lecture seule.
 * Colonnes de `reseau_pilotage` depuis 20261023180000 : `ouverte` = au moins un artisan proposé ; `preparee` = au moins
 * un artisan avec compte déclaré pour ce métier et cette zone ; `eligibles` = proposés ; `artisans` = déclarés.
 */
export function TableauCouverture({ communes, metier, departement }: { communes: LignePilotageReseau[]; metier: string; departement: string }) {
  const [recherche, rechercher] = useState("");
  const [filtre, filtrer] = useState("toutes");
  const id = useId();
  const visibles = communes.filter(c => c.nom.toLocaleLowerCase("fr").includes(recherche.toLocaleLowerCase("fr"))
    && (filtre === "toutes" || (filtre === "couvertes" ? c.ouverte : filtre === "interets" ? c.interets > 0 : filtre === "a_suivre" ? c.preparee && !c.ouverte : !c.ouverte)));
  return <section className="loc-carte space-y-4">
    <div className="entete-carte"><h2>Couverture par commune</h2><span className="puce puce-encre" role="status">{visibles.length} commune{visibles.length > 1 ? "s" : ""}</span></div>
    <p className="text-sm text-muted-foreground">Un artisan est compté dans une commune quand sa zone (code postal ou département) couvre au moins un de ses codes postaux. Pour un bien, la base vérifie ensuite le code postal exact du bien, la décennale selon les travaux et les listes noires.</p>
    <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm" htmlFor={`${id}-recherche`}><span>Rechercher une commune</span><input id={`${id}-recherche`} value={recherche} onChange={e => rechercher(e.target.value)} className={champ} /></label><label className="space-y-1 text-sm" htmlFor={`${id}-filtre`}><span>Afficher</span><select id={`${id}-filtre`} value={filtre} onChange={e => filtrer(e.target.value)} className={champ}><option value="toutes">Toutes les communes</option><option value="couvertes">Couvertes</option><option value="sans">Sans artisan proposé</option><option value="a_suivre">Artisan déclaré, pas encore proposé</option><option value="interets">Avec des intérêts exprimés</option></select></label></div>
    <div className="max-h-[32rem] overflow-auto rounded-xl border border-[var(--filet)]" tabIndex={0} role="region" aria-label="Communes, artisans et demande locale">
      <table className="tableau w-full min-w-[42rem] text-sm"><caption className="sr-only">Couverture constatée pour le métier sélectionné ; intérêts et demandes d’intervention séparés</caption><thead><tr><th>Commune</th><th>Couverture</th><th>Artisans proposés / déclarés</th><th>Intérêts / biens</th><th>Demandes réseau</th></tr></thead><tbody>{visibles.map(c => <tr key={c.commune_code}><td><Link href={`/admin/couverture?departement=${departement}&metier=${metier}&commune=${c.commune_code}#artisans-commune`} className="underline underline-offset-4">{c.nom}</Link><small className="block text-muted-foreground">Code commune {c.commune_code}</small></td><td><span className={`puce ${c.ouverte ? "puce-loue" : c.preparee ? "puce-prep" : "puce-grise"}`}>{c.ouverte ? "Couverte" : c.preparee ? "Artisan à valider ou privé" : "Sans artisan"}</span></td><td>{c.eligibles} / {c.artisans}</td><td>{c.interets} / {c.biens_interesses}</td><td>{c.demandes}</td></tr>)}</tbody></table>
      {visibles.length === 0 && <p className="p-4 text-sm">Aucune commune ne correspond à ces filtres.</p>}
    </div>
    <p className="text-xs text-muted-foreground">Les intérêts ne sont ni des interventions ni des promesses de contact. Un même bien peut intéresser plusieurs utilisateurs. Les demandes réseau comptent les sollicitations réellement envoyées depuis la mise en place de ce suivi ; les anciens dossiers restent dans leur historique.</p>
  </section>;
}
