"use client";

import { useState } from "react";
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { changerStatutAgence, type EtatListeAttenteAdmin } from "@/app/actions/liste-attente-agences-admin";
import type { StatutListeAttente } from "@/lib/liste-attente-agences";

type Geste = { statut: StatutListeAttente; libelle: string };
const CONTACTEE: Geste = { statut: "contactee", libelle: "Marquer comme contactée" };
const EN_ATTENTE: Geste = { statut: "en_attente", libelle: "Remettre en attente" };
const CONVERTIE: Geste = { statut: "convertie", libelle: "Devenue cliente" };
const RETIREE: Geste = { statut: "retiree", libelle: "Retirée à sa demande" };

/** Les gestes offerts depuis chaque statut ; le premier est le geste principal. */
export const GESTES_LISTE_ATTENTE: Record<StatutListeAttente, Geste[]> = {
  en_attente: [CONTACTEE, CONVERTIE, RETIREE],
  contactee: [EN_ATTENTE, CONVERTIE, RETIREE],
  convertie: [EN_ATTENTE],
  retiree: [EN_ATTENTE],
};

// Un seul formulaire pour les gestes d'une agence (modèle : admin/devis/bouton-traite.tsx) : pendant l'envoi, tous ses
// boutons sont inertes — pas de double clic, pas deux statuts à la fois — et seul le bouton pressé montre la roue.
export function BoutonsStatutAgence({ id, statut }: { id: string; statut: StatutListeAttente }) {
  const [choisi, setChoisi] = useState<StatutListeAttente | null>(null);
  const [etat, action, enCours] = useActionState<EtatListeAttenteAdmin, FormData>(
    (_etat, formData) => changerStatutAgence(id, String(formData.get("statut") ?? "")),
    {},
  );
  return (
    <form data-saisie-confirmee action={action} className="flex flex-wrap items-center gap-2">
      {GESTES_LISTE_ATTENTE[statut].map((g, i) => (
        <BoutonEnvoi
          key={g.statut}
          name="statut"
          value={g.statut}
          size="sm"
          variant={i === 0 && statut === "en_attente" ? "default" : "outline"}
          disabled={enCours}
          enCours={enCours && choisi === g.statut}
          onClick={() => setChoisi(g.statut)}
        >
          {g.libelle}
        </BoutonEnvoi>
      ))}
      {etat.erreur && <span role="alert" className="text-xs text-destructive">{etat.erreur}</span>}
      {etat.succes && <span role="status" className="text-xs">{etat.succes}</span>}
    </form>
  );
}
