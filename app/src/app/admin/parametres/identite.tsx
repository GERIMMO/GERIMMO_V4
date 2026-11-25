"use client";
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import { AIDES_EDITEUR, CHAMPS_EDITEUR, CHAMPS_MULTILIGNES, CHOIX_TYPE_VENDEUR } from "@/lib/identite-editeur";
import { CHAMPS_PRESTATAIRES } from "@/lib/editeur";
import { enregistrerIdentite } from "@/app/actions/identite-editeur";
import { ConsoleSection } from "@/components/console-section";

// Reprise du 24/11/2026 (relecture D7R-02) : les conditions générales impriment le nom, l'adresse et l'e-mail de
// contact (formulaire de rétractation). Les changer après l'archivage des conditions change le contrat : les premières
// souscriptions des particuliers attendent alors une nouvelle version. La rubrique le dit AVANT la saisie. Le
// médiateur, le téléphone et les autres champs ne sont plus dans ce cas (lib/editeur.ts, identiteDesConditions).
const GROUPES = [
  { titre: "Contact et entreprise", description: "Les coordonnées affichées à vos utilisateurs. Elles doivent être complètes pour ouvrir les souscriptions payantes. Choisissez d’abord le type de vendeur. Entrepreneur individuel : nom et prénom suivis de « EI », capital laissé vide. Attention : le nom, l’adresse et l’e-mail de contact sont imprimés dans les conditions générales. Les modifier après l’archivage des conditions suspend les premières souscriptions des particuliers, jusqu’à la publication d’une nouvelle version des conditions (une intervention technique). Les autres champs se modifient sans cet effet.", champs: ["typeVendeur", "denomination", "email", "telephone", "siege", "forme", "siret", "rcs", "directeurPublication", "capital", "tvaIntracommunautaire"] },
  { titre: "Médiateur de la consommation", description: "Tant que ces champs sont vides, les pages légales et les courriels disent qu’aucun médiateur n’est désigné, et la première souscription d’un particulier reste fermée, sauf décision de votre part (carte « Blocage des abonnements », plus bas). Après signature de la convention, saisissez ensemble le nom, l’adresse postale et le site officiel du médiateur désigné : ils s’affichent aussitôt dans les mentions légales, l’écran d’abonnement et les courriels. Cette saisie ne suspend aucune souscription et ne demande pas de nouvelle version des conditions.", champs: ["mediateurNom", "mediateurAdresse", "mediateurSite"] },
  { titre: "Prestataires", description: "Coordonnées et localisation des services utilisés par Gerimmo.", champs: Object.keys(CHAMPS_PRESTATAIRES) },
];

export function IdentiteEditeur({ valeurs, revision }: { valeurs: Record<string, string | null>; revision: number }) {
  const [etat, action, pending] = useActionState<{ erreur?: string; succes?: string; revision?: number }, FormData>(async (previous, form) => ({ ...previous, erreur: undefined, succes: undefined, ...await enregistrerIdentite(previous, form) }), {});
  return <form action={action} onReset={e => e.preventDefault()} data-saisie-confirmee>
    <input type="hidden" name="revision" value={etat.revision ?? revision}/>
    {GROUPES.map((g, i) => <ConsoleSection key={g.titre} titre={g.titre} description={g.description} ouverte={i === 0} ton={i === 1 ? "ambre" : i === 2 ? "violet" : "bleu"} icone={i === 2 ? "sante" : "documents"}>
      <div className="grid gap-4 sm:grid-cols-2">{g.champs.map(k => <label key={k} className="min-w-0 text-sm">{CHAMPS_EDITEUR[k]}{k === "typeVendeur"
        // Seconde reprise du 24/11/2026 (T4R-03) : un choix dans une liste, pas une devinette sur un champ libre.
        ? <select className="champ mt-1 w-full" name={k} defaultValue={valeurs[k] ?? ""}><option value="">— À choisir —</option>{CHOIX_TYPE_VENDEUR.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        : CHAMPS_MULTILIGNES.has(k)
        ? <textarea className="champ mt-1 w-full" name={k} defaultValue={valeurs[k] ?? ""} maxLength={1000} rows={3}/>
        : <input className="champ mt-1 w-full" name={k} defaultValue={valeurs[k] ?? ""} maxLength={1000} type={k === "email" ? "email" : k === "mediateurSite" ? "url" : "text"}/>}
        {/* L'aide suit le champ (relecture D7R-07 et D7R-12) : le libellé reste sur une ligne, les champs d'une rangée restent alignés. */}
        {AIDES_EDITEUR[k] && <span className="mt-1 block text-xs text-muted-foreground">{AIDES_EDITEUR[k]}</span>}</label>)}</div>
    </ConsoleSection>)}
    <p className="my-4 text-sm text-muted-foreground">Les changements seront visibles sur les pages légales. Les champs vides restent signalés à compléter ; chaque modification est conservée dans l’historique.</p>
    <button className="btn-or" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer les modifications"}</button>
    {etat.erreur && <p role="alert" className="err mt-3">{etat.erreur}</p>}{etat.succes && <p role="status" className="mt-3">{etat.succes}</p>}
  </form>;
}
