"use client";

import { useActionState, useId, useState } from "react";
import { ouvrirOrganisation, type EtatOuverture } from "@/app/actions/organisations-admin";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FormulaireOuverture({
  prefill,
}: {
  prefill?: { nom?: string; email?: string; demandeId?: string };
}) {
  const [etat, action] = useActionState<EtatOuverture, FormData>(ouvrirOrganisation, {});
  const base = useId();
  // L'essai est le cas courant ; « active » n'existe que pour un contrat déjà
  // signé. Le champ « durée » disparaît alors : afficher une durée d'essai à
  // côté d'une case « active » laisse croire qu'elle s'applique quand même.
  const [active, setActive] = useState(false);
  const valeur = (n: string, defaut = "") => etat.valeurs?.[n] ?? defaut;

  return (
    <form action={action} className="space-y-4">
      {prefill?.demandeId && (
        <input type="hidden" name="demande_id" value={prefill.demandeId} />
      )}

      <div className="space-y-2">
        <Label htmlFor={`${base}-nom`}>Nom de l&apos;organisation</Label>
        <Input
          id={`${base}-nom`}
          name="nom"
          required
          defaultValue={valeur("nom", prefill?.nom ?? "")}
          placeholder="Cabinet Martin"
        />
        <p className="text-xs text-muted-foreground">
          Tel qu&apos;il apparaîtra en tête des documents générés. Il se corrige
          ensuite depuis le profil de l&apos;organisation.
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Type</legend>
        {(
          [
            ["agence", "Agence de gestion", "Son responsable est administrateur d'agence et peut créer des agents."],
            ["proprietaire_direct", "Propriétaire en gestion directe", "Un parc géré par son propriétaire, sans mandat."],
          ] as const
        ).map(([v, libelle, aide]) => (
          <label
            key={v}
            htmlFor={`${base}-${v}`}
            className="flex min-h-12 items-start gap-3 text-sm"
          >
            <input
              id={`${base}-${v}`}
              type="radio"
              name="type"
              value={v}
              defaultChecked={valeur("type", "agence") === v}
              className="mt-1 size-4 shrink-0 accent-[var(--encre)]"
            />
            <span>
              <span className="block font-medium">{libelle}</span>
              <span className="block text-xs text-muted-foreground">{aide}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor={`${base}-email`}>Adresse du premier responsable</Label>
        <Input
          id={`${base}-email`}
          name="email"
          type="email"
          required
          defaultValue={valeur("email", prefill?.email ?? "")}
          placeholder="contact@cabinet-martin.fr"
        />
        <p className="text-xs text-muted-foreground">
          Il recevra un lien pour définir son mot de passe. S&apos;il a déjà un
          compte Gerimmo (autre agence, ou espace locataire), c&apos;est
          celui-là qui est rattaché — on n&apos;en crée pas un second.
        </p>
      </div>

      <fieldset className="space-y-2 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">Démarrage</legend>
        <label htmlFor={`${base}-active`} className="flex min-h-12 items-center gap-3 text-sm">
          <input
            id={`${base}-active`}
            type="checkbox"
            name="active"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="size-5 shrink-0 accent-[var(--encre)]"
          />
          Contrat déjà signé — ouvrir directement en abonnement actif
        </label>
        {!active && (
          <div className="space-y-2">
            <Label htmlFor={`${base}-jours`}>Durée de l&apos;essai, en jours</Label>
            <Input
              id={`${base}-jours`}
              name="essai_jours"
              type="number"
              min={0}
              max={365}
              defaultValue={valeur("essai_jours", "14")}
              className="max-w-32"
            />
            <p className="text-xs text-muted-foreground">
              À son terme, le compte passe en lecture seule : l&apos;agence garde
              l&apos;accès à tout et à ses exports, mais ne saisit plus rien.
            </p>
          </div>
        )}
      </fieldset>

      {etat.erreur && (
        <p role="alert" className="text-sm text-destructive">
          {etat.erreur}
        </p>
      )}

      <BoutonEnvoi enCoursTexte="Ouverture…">Ouvrir l&apos;organisation</BoutonEnvoi>
    </form>
  );
}
