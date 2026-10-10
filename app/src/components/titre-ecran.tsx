import { Banknote, Bell, Files, House, UsersRound, Wrench, CalendarDays, MessageCircle, ShieldCheck, CircleHelp, Newspaper, Settings2, ChartNoAxesCombined, Building2, HeartPulse, MapPin, ListChecks } from "lucide-react";
import type { ReactNode } from "react";

const RUBRIQUES = {
  accueil: { icone: House, ton: "bleu" },
  supervision: { icone: ChartNoAxesCombined, ton: "bleu" },
  entreprise: { icone: Building2, ton: "or" },
  sante: { icone: HeartPulse, ton: "vert" },
  territoire: { icone: MapPin, ton: "vert" },
  suivi: { icone: ListChecks, ton: "violet" },
  profil: { icone: Settings2, ton: "violet" },
  messages: { icone: MessageCircle, ton: "bleu" },
  agenda: { icone: CalendarDays, ton: "violet" },
  abonnement: { icone: ShieldCheck, ton: "violet" },
  aide: { icone: CircleHelp, ton: "bleu" },
  journal: { icone: Newspaper, ton: "or" },
  documents: { icone: Files, ton: "bleu" },
  finances: { icone: Banknote, ton: "bleu" },
  incidents: { icone: Wrench, ton: "or" },
  alertes: { icone: Bell, ton: "or" },
  personnes: { icone: UsersRound, ton: "violet" },
  lots: { icone: House, ton: "or" },
} as const;

export type RubriqueEcran = keyof typeof RUBRIQUES;

/** Même repère de rubrique, sans remplacer les actions ou la navigation de la page. */
export function TitreEcran({ rubrique, children, id, tabIndex }: {
  rubrique: RubriqueEcran; children: ReactNode; id?: string; tabIndex?: number;
}) {
  const { icone: Icone, ton } = RUBRIQUES[rubrique];
  return <div className="titre-ecran" data-ton={ton}>
    <span className="titre-ecran-icone"><Icone size={24} strokeWidth={1.7} aria-hidden="true" /></span>
    <h1 id={id} tabIndex={tabIndex}>{children}</h1>
  </div>;
}

export function LegendeChamps() {
  return <p className="legende-champs"><span aria-hidden="true" />Pastille rouge : champ obligatoire à compléter.</p>;
}
