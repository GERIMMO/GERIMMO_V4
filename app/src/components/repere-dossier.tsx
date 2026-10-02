import { Check, ChevronRight, Circle, House, Lightbulb } from "lucide-react";
import Image from "next/image";

export type EtapeDossier = { titre: string; detail: string; href: string; renseignee: boolean; inconnue?: boolean };

/** Repères de saisie uniquement : ne remplace jamais les contrôles de mise en location. */
export function RepereDossier({ etapes }: { etapes: EtapeDossier[] }) {
  const faites = etapes.filter((e) => e.renseignee && !e.inconnue).length;
  const suivante = etapes.find((e) => !e.renseignee || e.inconnue);
  return <aside className="dossier-reperes" aria-label="Préparation du dossier">
    <section className="dossier-panneau">
      <div className="dossier-panneau-titre"><House size={18} aria-hidden="true" /><h2>Votre dossier</h2></div>
      <p className="text-sm text-muted-foreground">{faites} repère{faites > 1 ? "s" : ""} renseigné{faites > 1 ? "s" : ""} sur {etapes.length}</p>
      <progress className="dossier-progression" value={faites} max={etapes.length} aria-label="Repères renseignés" />
      <nav aria-label="Rubriques du dossier"><ol className="dossier-etapes">
        {etapes.map((e, i) => <li key={e.href}><a href={e.href} className={e === suivante ? "a-poursuivre" : undefined}>
          <span className={`dossier-numero ${e.renseignee && !e.inconnue ? "fait" : ""}`} aria-hidden="true">{e.renseignee && !e.inconnue ? <Check size={14} /> : i + 1}</span>
          <span><strong>{e.titre}</strong><small>{e.inconnue ? "Lecture à réessayer" : e.detail}</small></span><ChevronRight size={15} aria-hidden="true" />
        </a></li>)}
      </ol></nav>
      {suivante && <a className="btn-or dossier-poursuivre" href={suivante.href}>Poursuivre le dossier <ChevronRight size={16} aria-hidden="true" /></a>}
    </section>
    <section className="dossier-conseil"><Lightbulb size={20} aria-hidden="true" /><div><h2>À votre rythme</h2><p>Chaque rubrique s’enregistre séparément. Retrouvez ici les informations déjà enregistrées et les éléments à compléter.</p><p className="mt-2">Ces repères ne valent pas validation : les contrôles du bail et de mise en location restent nécessaires.</p></div></section>
  </aside>;
}

export function PlanCreationBien() {
  return <aside className="dossier-reperes" aria-label="Les étapes de votre location">
    <section className="dossier-panneau"><div className="dossier-panneau-titre"><House size={18} aria-hidden="true" /><h2>Le début de votre location</h2></div>
      <figure className="mb-4 overflow-hidden rounded-lg"><Image src="/illustrations/interieur-gerimmo-2026.jpg" width={560} height={320} sizes="(min-width: 1200px) 235px, 100vw" alt="" className="h-32 w-full object-cover" /><figcaption className="mt-1 text-xs text-muted-foreground">Illustration · votre bien se renseigne dans le formulaire.</figcaption></figure>
      <ol className="dossier-etapes dossier-plan">
        {[['Le bien et ses lots', 'Adresse, caractéristiques et surfaces'], ['Le logement', 'Propriété, pièces et équipements'], ['Les diagnostics', 'Pièces à déposer selon le bien'], ['Le locataire et le bail', 'Personnes, conditions et documents'], ['La mise en location', 'Contrôles et bail signé']].map(([titre, detail], i) => <li key={titre}><span className={`dossier-numero ${i === 0 ? 'courant' : ''}`} aria-hidden="true">{i === 0 ? '1' : <Circle size={13} />}</span><span><strong>{titre}</strong><small>{detail}</small></span></li>)}
      </ol><p className="text-sm text-muted-foreground">Vous commencez par le bien. La suite se prépare depuis la fiche de chaque lot.</p>
    </section>
    <section className="dossier-conseil"><Lightbulb size={20} aria-hidden="true" /><div><h2>Une seule saisie</h2><p>L’adresse et les caractéristiques renseignées ici seront reprises dans votre dossier. Les suggestions d’adresse sont facultatives.</p></div></section>
  </aside>;
}
