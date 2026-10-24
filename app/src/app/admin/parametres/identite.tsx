"use client";
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import { CHAMPS_EDITEUR, CHAMPS_MULTILIGNES } from "@/lib/identite-editeur";
import { CHAMPS_PRESTATAIRES } from "@/lib/editeur";
import { enregistrerIdentite } from "@/app/actions/identite-editeur";
import { ConsoleSection } from "@/components/console-section";

const GROUPES = [
  { titre: "Contact et entreprise", description: "Les coordonnées affichées à vos utilisateurs.", champs: ["denomination", "email", "telephone", "siege", "forme", "siret", "rcs", "directeurPublication", "capital", "tvaIntracommunautaire"] },
  { titre: "Médiateur de la consommation", description: "Nom, adresse et site de votre médiateur.", champs: ["mediateurNom", "mediateurAdresse", "mediateurSite"] },
  { titre: "Prestataires", description: "Coordonnées et localisation des services utilisés par Gerimmo.", champs: Object.keys(CHAMPS_PRESTATAIRES) },
];

export function IdentiteEditeur({ valeurs, revision }: { valeurs: Record<string, string | null>; revision: number }) {
  const [etat, action, pending] = useActionState<{ erreur?: string; succes?: string; revision?: number }, FormData>(async (previous, form) => ({ ...previous, erreur: undefined, succes: undefined, ...await enregistrerIdentite(previous, form) }), {});
  return <form action={action} onReset={e => e.preventDefault()} data-saisie-confirmee>
    <input type="hidden" name="revision" value={etat.revision ?? revision}/>
    {GROUPES.map((g, i) => <ConsoleSection key={g.titre} titre={g.titre} description={g.description} ouverte={i === 0} ton={i === 1 ? "ambre" : i === 2 ? "violet" : "bleu"} icone={i === 2 ? "sante" : "documents"}>
      <div className="grid gap-4 sm:grid-cols-2">{g.champs.map(k => <label key={k} className="min-w-0 text-sm">{CHAMPS_EDITEUR[k]}{CHAMPS_MULTILIGNES.has(k)
        ? <textarea className="champ mt-1 w-full" name={k} defaultValue={valeurs[k] ?? ""} maxLength={1000} rows={3}/>
        : <input className="champ mt-1 w-full" name={k} defaultValue={valeurs[k] ?? ""} maxLength={1000} type={k === "email" ? "email" : k === "mediateurSite" ? "url" : "text"}/>}</label>)}</div>
    </ConsoleSection>)}
    <p className="my-4 text-sm text-muted-foreground">Les changements seront visibles sur les pages légales. Les champs vides restent signalés à compléter ; chaque modification est conservée dans l’historique.</p>
    <button className="btn-or" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer les modifications"}</button>
    {etat.erreur && <p role="alert" className="err mt-3">{etat.erreur}</p>}{etat.succes && <p role="status" className="mt-3">{etat.succes}</p>}
  </form>;
}
