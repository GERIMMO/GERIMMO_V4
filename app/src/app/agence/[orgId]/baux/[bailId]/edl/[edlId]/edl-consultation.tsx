import { ETATS_ELEMENT } from "./grille-edl";
import type { Compteur, Cle } from "./edl-annexes";

type Mentions = { personnes_presentes: string | null; detecteur_fumee_present: boolean | null; detecteur_fumee_etat: string | null; attestation_assurance_fournie: boolean | null; adresse_restitution_depot: string | null; observations: string | null };
const ouiNon = (v: boolean | null) => v == null ? "Non renseigné" : v ? "Oui" : "Non";
export function EdlConsultation({ mentions, lignes, compteurs, cles, indisponibles = {} }: {
  mentions: Mentions; indisponibles?: {lignes?: boolean; compteurs?: boolean; cles?: boolean};
  lignes: {id: string; piece: string | null; libelle: string; etat: string | null; commentaire: string | null}[];
  compteurs: Compteur[]; cles: Cle[];
}) {
  return <div className="space-y-5">
    <section className="rounded-xl border bg-card p-4"><h2 className="font-semibold">Mentions du document</h2>
      <dl className="mt-3 space-y-3 text-sm">{[
        ["Personnes présentes", mentions.personnes_presentes],
        ["Détecteur de fumée présent", ouiNon(mentions.detecteur_fumee_present)],
        ["État du détecteur", mentions.detecteur_fumee_etat],
        ["Attestation d’assurance fournie", ouiNon(mentions.attestation_assurance_fournie)],
        ["Adresse de restitution du dépôt", mentions.adresse_restitution_depot],
        ["Observations", mentions.observations],
      ].map(([titre, valeur]) => <div key={titre}><dt className="text-muted-foreground">{titre}</dt><dd>{valeur || "Non renseigné"}</dd></div>)}</dl>
    </section>
    <section className="rounded-xl border bg-card p-4"><h2 className="font-semibold">Constats enregistrés</h2>
      {indisponibles.lignes ? <p role="alert">Constats indisponibles.</p> : lignes.length ? <ul className="divide-y">{lignes.map(l => <li key={l.id} className="py-3 text-sm"><p className="font-medium">{l.piece && `${l.piece} · `}{l.libelle} · {l.etat ? ETATS_ELEMENT[l.etat] ?? l.etat : "État non renseigné"}</p>{l.commentaire && <p>{l.commentaire}</p>}</li>)}</ul> : <p className="mt-2 text-sm">Aucun constat disponible.</p>}
    </section>
    <section className="rounded-xl border bg-card p-4"><h2 className="font-semibold">Compteurs et clés</h2>
      <ul className="mt-3 space-y-3 text-sm">{!indisponibles.compteurs && compteurs.map(c => <li key={c.id}>{({electricite:"Électricité", gaz:"Gaz", eau_froide:"Eau froide", eau_chaude:"Eau chaude"} as Record<string,string>)[c.type] ?? c.type}{c.numero && ` · n° ${c.numero}`} · relevé {c.releve ?? "non renseigné"}</li>)}{!indisponibles.cles && cles.map(c => <li key={c.id}>{c.libelle} · {c.nombre ?? "Nombre non renseigné"}{c.reference && ` · ${c.reference}`}</li>)}</ul>
      {indisponibles.compteurs && <p role="alert">Compteurs indisponibles.</p>}{!indisponibles.compteurs && !compteurs.length && <p className="mt-2 text-sm">Aucun compteur disponible.</p>}{indisponibles.cles && <p role="alert">Clés indisponibles.</p>}{!indisponibles.cles && !cles.length && <p className="mt-2 text-sm">Aucune clé disponible.</p>}
    </section>
  </div>;
}
