"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { reglerOuvertureReseau, rattacherArtisanReseau } from "@/app/actions/reseau";
import { RetourReseau } from "@/components/disponibilite-reseau";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import type { LignePilotageReseau } from "@/lib/reseau";

import { statutCandidat, type CandidatReseau } from "@/lib/reseau";
const champ = "min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm";

export function ReglagesReseau({ communes, metier, departement, candidats }: { communes: LignePilotageReseau[]; metier: string; departement: string; candidats: CandidatReseau[] }) {
  const [selection, choisir] = useState<string[]>([]);
  const [recherche, rechercher] = useState("");
  const [filtre, filtrer] = useState("toutes");
  const [operation, changerOperation] = useState("oui");
  const [accord, confirmer] = useState(false);
  const [etat, action] = useActionState(reglerOuvertureReseau, {});
  const [etatArtisan, actionArtisan] = useActionState(rattacherArtisanReseau, {});
  const id = useId();
  const visibles = communes.filter(c => c.nom.toLocaleLowerCase("fr").includes(recherche.toLocaleLowerCase("fr")) && (filtre === "toutes" || (filtre === "ouvertes" ? c.ouverte : filtre === "interets" ? c.interets > 0 : !c.ouverte)));
  const champsSelection = <><input type="hidden" name="metier" value={metier} />{selection.map(c => <input key={c} type="hidden" name="communes" value={c} />)}</>;
  return <div className="space-y-6">
    <section className="loc-carte space-y-4">
      <div className="entete-carte"><h2>1. Choisir les communes</h2><span className="puce puce-encre" role="status">{selection.length} sélectionnée{selection.length > 1 ? "s" : ""}</span></div>
      <p className="text-sm text-muted-foreground">La sélection concerne uniquement le métier affiché. Choisir tout un département ne l’ouvre pas : une décision explicite reste nécessaire ci-dessous.</p>
      <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm" htmlFor={`${id}-recherche`}><span>Rechercher une commune</span><input id={`${id}-recherche`} value={recherche} onChange={e => rechercher(e.target.value)} className={champ} /></label><label className="space-y-1 text-sm" htmlFor={`${id}-filtre`}><span>Afficher</span><select id={`${id}-filtre`} value={filtre} onChange={e => filtrer(e.target.value)} className={champ}><option value="toutes">Toutes les communes</option><option value="ouvertes">Ouvertes</option><option value="fermees">Fermées</option><option value="interets">Avec des intérêts exprimés</option></select></label></div>
      <div className="flex flex-wrap gap-3 text-sm"><button type="button" className="btn-secondaire min-h-11" onClick={() => { choisir([...new Set([...selection, ...visibles.map(c => c.commune_code)])]); confirmer(false); }}>Sélectionner les {visibles.length} communes affichées</button><button type="button" className="btn-lien min-h-11" onClick={() => { choisir([]); confirmer(false); }}>Tout désélectionner</button></div>
      <div className="max-h-[32rem] overflow-auto rounded-xl border border-[var(--filet)]" tabIndex={0} role="region" aria-label="Communes et demande locale">
        <table className="tableau w-full min-w-[42rem] text-sm"><caption className="sr-only">Couverture pour le métier sélectionné ; intérêts et demandes d’intervention séparés</caption><thead><tr><th>Commune</th><th>Ouverture</th><th>Artisans éligibles / rattachés</th><th>Intérêts / biens</th><th>Demandes réseau</th></tr></thead><tbody>{visibles.map(c => <tr key={c.commune_code}><td><label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={selection.includes(c.commune_code)} onChange={e => { choisir(e.target.checked ? [...selection, c.commune_code] : selection.filter(x => x !== c.commune_code)); confirmer(false); }} className="size-4" aria-label={`Sélectionner ${c.nom}`} /><span><Link href={`/admin/couverture?departement=${departement}&metier=${metier}&commune=${c.commune_code}#artisans-commune`} className="underline underline-offset-4">{c.nom}</Link><small className="block text-muted-foreground">Code commune {c.commune_code}</small></span></label></td><td><span className={`puce ${c.ouverte && c.eligibles > 0 ? "puce-loue" : c.ouverte ? "puce-prep" : "puce-grise"}`}>{c.ouverte ? c.eligibles > 0 ? "Ouverte" : "Ouverte · indisponible" : c.preparee ? "Fermée par décision" : "Fermée par défaut"}</span></td><td>{c.eligibles} / {c.artisans}</td><td>{c.interets} / {c.biens_interesses}</td><td>{c.demandes}</td></tr>)}</tbody></table>
        {visibles.length === 0 && <p className="p-4 text-sm">Aucune commune ne correspond à ces filtres.</p>}
      </div>
      <p className="text-xs text-muted-foreground">Les intérêts ne sont ni des interventions ni des promesses de contact. Un même bien peut intéresser plusieurs utilisateurs. Les demandes réseau comptent les sollicitations réellement envoyées depuis la mise en place de ce suivi ; les anciens dossiers restent dans leur historique.</p>
    </section>
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="loc-carte space-y-4"><h2 className="font-heading text-xl">2. Rattacher un artisan</h2><p className="text-sm text-muted-foreground">Vous confirmez ses communes d’intervention pour ce métier. Un rattachement n’ouvre aucune commune. La validation de son inscription reste dans « Artisans à valider ».</p><form action={actionArtisan} className="space-y-3">{champsSelection}<label htmlFor={`${id}-artisan`} className="block text-sm">Artisan parmi les résultats ci-dessous</label><select id={`${id}-artisan`} name="artisan" required defaultValue="" className={champ}><option value="" disabled>Choisir un artisan</option>{candidats.map(a => <option key={a.id} value={a.id}>{a.raison_sociale} · {statutCandidat(a)}</option>)}</select><p className="text-xs text-muted-foreground">Utilisez la recherche d’artisans plus bas si son nom ne figure pas dans cette sélection.</p><label className="block text-sm" htmlFor={`${id}-rattacher`}>Action sur les communes sélectionnées</label><select id={`${id}-rattacher`} name="rattacher" className={champ}><option value="oui">Rattacher à ces communes</option><option value="non">Retirer de ces communes</option></select><BoutonEnvoi disabled={!selection.length || !candidats.length} enCoursTexte="Enregistrement…">Enregistrer le rattachement</BoutonEnvoi><RetourReseau etat={etatArtisan} /></form></section>
      <section className="loc-carte space-y-4"><h2 className="font-heading text-xl">3. Décider de l’ouverture</h2><p className="text-sm text-muted-foreground">Chaque commune doit compter au moins un artisan validé, public, avec un SIRET vérifié et un compte artisan pour le métier choisi. Les assurances restent contrôlées selon les travaux.</p><form action={action} className="space-y-3">{champsSelection}<label htmlFor={`${id}-operation`} className="block text-sm">Décision sur les communes sélectionnées</label><select id={`${id}-operation`} name="ouverte" value={operation} onChange={e => { changerOperation(e.target.value); confirmer(false); }} className={champ}><option value="oui">Ouvrir ce métier</option><option value="non">Fermer ce métier</option></select>{operation === "oui" ? <label className="flex gap-2 text-sm"><input className="mt-1 size-4 shrink-0" type="checkbox" name="confirmation" value="oui" checked={accord} required onChange={e => confirmer(e.target.checked)} /><span>Je valide l’ouverture commerciale de ce métier dans les {selection.length} communes sélectionnées.</span></label> : <p className="text-sm">La fermeture bloque les nouvelles mises en relation du réseau. Les demandes déjà engagées et les contacts personnels restent accessibles.</p>}<BoutonEnvoi disabled={!selection.length || (operation === "oui" && !accord)} enCoursTexte="Enregistrement…">{operation === "oui" ? "Ouvrir les communes sélectionnées" : "Fermer les communes sélectionnées"}</BoutonEnvoi><RetourReseau etat={etat} /></form></section>
    </div>
  </div>;
}
