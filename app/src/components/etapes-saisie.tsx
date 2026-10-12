"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { NavigationParcours, type EtapeParcours } from "./navigation-parcours";
import styles from "./presentation-parcours.module.css";

/** Les panneaux restent montés : changer d’étape ne réinitialise aucun champ.
 * Les champs masqués restent soumis ; une erreur native ouvre leur panneau. */
export function EtapesSaisie({ titre, etapes, contenus, conclusion, activer = true }: {
  titre: string;
  etapes: EtapeParcours[];
  contenus: ReactNode[];
  conclusion?: ReactNode;
  activer?: boolean;
}) {
  const [erreur, setErreur] = useState("");
  const [etape, setEtape] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  function changer(i: number) {
    setErreur("");
    setEtape(i);
    requestAnimationFrame(() => {
      document.getElementById(id)?.focus({ preventScroll: true });
      root.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }
  function suivant() {
    const panneau = root.current?.querySelector(`[data-panneau="${etape}"]`);
    // Les formulaires indépendants d’un état des lieux se valident à leur
    // propre enregistrement, pas au passage vers la rubrique suivante.
    const formulaire = root.current?.closest("form");
    const invalide = formulaire ? panneau?.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input:invalid, select:invalid, textarea:invalid") : null;
    if (invalide) { invalide.reportValidity(); return; }
    changer(etape + 1);
  }
  if (!activer) return <>{contenus}{conclusion}</>;
  return <div ref={root} className={`${styles.presentation} space-y-5 scroll-mt-24`} onKeyDown={event => {
    if (event.key === "Enter" && event.target instanceof HTMLInputElement && root.current?.closest("form") && etape < etapes.length - 1) { event.preventDefault(); suivant(); }
  }} onInvalidCapture={event => {
    event.preventDefault();
    const cible = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    const premier = (cible.form ?? root.current)?.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input:invalid, select:invalid, textarea:invalid");
    const panneau = premier?.closest<HTMLElement>("[data-panneau]");
    if (premier) setErreur(premier.validationMessage);
    if (panneau) { setEtape(Number(panneau.dataset.panneau)); requestAnimationFrame(() => { premier?.focus(); }); }
  }}>
    <NavigationParcours titre={titre} label={`Étapes : ${titre}`} etapes={etapes} etape={etape} changer={changer} />
    <div data-corps-etapes className="rounded-2xl border border-[var(--filet)] bg-[var(--papier)] p-4 sm:p-6">
      <p className="eyebrow">Étape {etape + 1} / {etapes.length}</p>
      <h2 id={id} tabIndex={-1} className="mt-1 text-xl">{etapes[etape].titre}</h2>
      <p className="mb-5 mt-1 text-sm text-muted-foreground">{etapes[etape].detail}</p>
      {erreur && <p role="alert" className="mb-4 text-sm text-destructive">{erreur}</p>}
      {contenus.map((contenu, i) => <div key={i} data-panneau={i} hidden={i !== etape} className="space-y-4">{contenu}</div>)}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--filet)] pt-4">
        {etape > 0 ? <button type="button" className="btn-secondaire" onClick={() => changer(etape - 1)}>Précédent</button> : <span />}
        {etape < etapes.length - 1 ? <button type="button" className="btn-or" onClick={suivant}>Suivant →</button> : conclusion}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Vos saisies restent en place entre les étapes, pendant que cette page est ouverte.</p>
    </div>
  </div>;
}
