"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { nomComplet } from "@/lib/roles-personnes";

type Personne = { id: string; nom: string; prenom: string | null };

// Valeurs d'un brouillon existant — le formulaire de création passe un objet
// vide, celui d'édition les champs du bail (recette 21/08 : le brouillon
// revenait vierge, la saisie était perdue).
export type BailDefauts = {
  type?: string;
  locataire_principal?: string | null;
  date_debut?: string | null;
  loyer_hc?: number | string | null;
  charges?: number | string | null;
  charges_mode?: string;
  depot_garantie?: number | string | null;
  jour_echeance?: number;
  irl_trimestre?: string | null;
  revision_irl?: boolean;
};

const classeSelect =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";

// Les champs communs création / édition d'un bail. `prefixe` distingue les ids
// quand deux formulaires cohabitent sur une même page. `valeurs` : la saisie
// renvoyée par l'action en erreur — reposée en priorité pour que le reset
// React ne vide pas le formulaire (recette 22/08, voir lib/formulaires.ts).
export function ChampsBail({
  personnes,
  defauts = {},
  prefixe = "bail",
  valeurs,
}: {
  personnes: Personne[];
  defauts?: BailDefauts;
  prefixe?: string;
  valeurs?: Record<string, string>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`${prefixe}-type`}>Type de bail</Label>
        <select
          id={`${prefixe}-type`}
          name="type"
          defaultValue={valeurs?.type ?? defauts.type ?? "nu"}
          className={classeSelect}
        >
          <option value="nu">Nu</option>
          <option value="meuble">Meublé</option>
          <option value="colocation">Colocation</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${prefixe}-locataire`}>Locataire principal</Label>
        <select
          id={`${prefixe}-locataire`}
          name="locataire_principal"
          required
          defaultValue={valeurs?.locataire_principal ?? defauts.locataire_principal ?? ""}
          className={classeSelect}
        >
          <option value="" disabled>
            — Choisir —
          </option>
          {personnes.map((p) => (
            <option key={p.id} value={p.id}>
              {nomComplet(p)}
            </option>
          ))}
        </select>
      </div>
      {/* Recette 21/08 : la date d'entrée n'avait aucun champ — elle tombait
          au jour du clic « Activer », faussant l'échéancier. */}
      <div className="space-y-1.5">
        <Label htmlFor={`${prefixe}-debut`}>Date d&apos;entrée</Label>
        <Input
          id={`${prefixe}-debut`}
          name="date_debut"
          type="date"
          defaultValue={valeurs?.date_debut ?? defauts.date_debut ?? ""}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${prefixe}-jour`}>Jour d&apos;échéance</Label>
        <Input
          id={`${prefixe}-jour`}
          name="jour_echeance"
          type="number"
          min="1"
          max="28"
          defaultValue={valeurs?.jour_echeance ?? defauts.jour_echeance ?? 1}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${prefixe}-loyer`}>Loyer HC (€)</Label>
        <Input
          id={`${prefixe}-loyer`}
          name="loyer_hc"
          type="number"
          step="0.01"
          min="0"
          defaultValue={valeurs?.loyer_hc ?? defauts.loyer_hc ?? ""}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${prefixe}-charges`}>Charges (€)</Label>
        <Input
          id={`${prefixe}-charges`}
          name="charges"
          type="number"
          step="0.01"
          min="0"
          defaultValue={valeurs?.charges ?? defauts.charges ?? ""}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${prefixe}-charges-mode`}>Mode de charges</Label>
        <select
          id={`${prefixe}-charges-mode`}
          name="charges_mode"
          defaultValue={valeurs?.charges_mode ?? defauts.charges_mode ?? "provision"}
          className={classeSelect}
        >
          <option value="provision">Provision (régularisée chaque année)</option>
          <option value="forfait">Forfait (définitif, jamais régularisé)</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${prefixe}-depot`}>Dépôt de garantie (€)</Label>
        <Input
          id={`${prefixe}-depot`}
          name="depot_garantie"
          type="number"
          step="0.01"
          min="0"
          defaultValue={valeurs?.depot_garantie ?? defauts.depot_garantie ?? ""}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${prefixe}-irl`}>Trimestre IRL de référence</Label>
        <select
          id={`${prefixe}-irl`}
          name="irl_trimestre"
          defaultValue={valeurs?.irl_trimestre ?? defauts.irl_trimestre ?? ""}
          className={classeSelect}
        >
          <option value="">—</option>
          {["T1", "T2", "T3", "T4"].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2 pt-6">
        <input
          id={`${prefixe}-revision`}
          name="revision_irl"
          type="checkbox"
          value="on"
          defaultChecked={valeurs ? valeurs.revision_irl === "on" : defauts.revision_irl ?? true}
          className="size-4"
        />
        <Label htmlFor={`${prefixe}-revision`}>Clause de révision annuelle (IRL)</Label>
      </div>
    </div>
  );
}
