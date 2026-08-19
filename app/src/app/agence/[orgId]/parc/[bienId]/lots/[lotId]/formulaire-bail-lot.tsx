"use client";

import { useActionState } from "react";
import { creerBail, type EtatBail } from "@/app/actions/baux";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { nomComplet } from "@/lib/roles-personnes";

type Personne = { id: string; nom: string; prenom: string | null };

export function FormulaireBailLot({
  orgId,
  bienId,
  lotId,
  personnes,
}: {
  orgId: string;
  bienId: string;
  lotId: string;
  personnes: Personne[];
}) {
  const action = creerBail.bind(null, orgId, lotId, bienId);
  const [etat, formAction, enCours] = useActionState<EtatBail, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="bail-type">Type de bail</Label>
          <select
            id="bail-type"
            name="type"
            defaultValue="nu"
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="nu">Nu</option>
            <option value="meuble">Meublé</option>
            <option value="colocation">Colocation</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bail-locataire">Locataire principal</Label>
          <select
            id="bail-locataire"
            name="locataire_principal"
            required
            defaultValue=""
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
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
        <div className="space-y-1.5">
          <Label htmlFor="bail-loyer">Loyer HC (€)</Label>
          <Input id="bail-loyer" name="loyer_hc" type="number" step="0.01" min="0" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bail-charges">Charges (€)</Label>
          <Input id="bail-charges" name="charges" type="number" step="0.01" min="0" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bail-charges-mode">Mode de charges</Label>
          <select
            id="bail-charges-mode"
            name="charges_mode"
            defaultValue="provision"
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="provision">Provision (régularisée chaque année)</option>
            <option value="forfait">Forfait (définitif, jamais régularisé)</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bail-depot">Dépôt de garantie (€)</Label>
          <Input id="bail-depot" name="depot_garantie" type="number" step="0.01" min="0" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bail-jour">Jour d&apos;échéance</Label>
          <Input id="bail-jour" name="jour_echeance" type="number" min="1" max="28" defaultValue="1" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bail-irl">Trimestre IRL de référence</Label>
          <select
            id="bail-irl"
            name="irl_trimestre"
            defaultValue=""
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
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
            id="bail-revision"
            name="revision_irl"
            type="checkbox"
            value="on"
            defaultChecked
            className="size-4"
          />
          <Label htmlFor="bail-revision">Clause de révision annuelle (IRL)</Label>
        </div>
      </div>
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
      <Button type="submit" size="sm" disabled={enCours}>
        {enCours ? "Création…" : "Créer le bail"}
      </Button>
    </form>
  );
}
