import { ArrowRight } from "lucide-react";
import { consigneIncident, type ConsigneIncident } from "@/lib/consigne-incident";
import { LienSectionIncident } from "./lien-section-incident";

export function ConsigneIncidentProprietaire({ consigne }: { consigne: ConsigneIncident }) {
  return <section className="incident-consigne" aria-label={consigne.attente ? "En attente" : "Prochaine action"} data-attente={consigne.attente || undefined}>
    <span className="incident-consigne-repere">{consigne.repere ?? (consigne.attente ? "En attente" : "Votre prochaine étape")}</span>
    <h3>{consigne.titre}</h3><p>{consigne.texte}</p>
    {consigne.liens?.length ? <nav aria-label="Actions de cette étape">{consigne.liens.map(l=><LienSectionIncident key={l.cible} cible={l.cible}>{l.titre}<ArrowRight size={14} aria-hidden="true"/></LienSectionIncident>)}</nav> : null}
  </section>;
}

export function RepereIncidentProprietaire({ etat, decisionRequise, contestation, communs = false }: { etat: string; decisionRequise: boolean; contestation: boolean; communs?: boolean }) {
  // Le formulaire courant porte déjà son instruction. Aucun parcours abstrait à lire en plus.
  if (!["termine", "clos"].includes(etat)) return null;
  const consigne = consigneIncident(etat, decisionRequise, contestation, communs);
  return consigne ? <ConsigneIncidentProprietaire consigne={consigne}/> : null;
}
