"use client";

import { useActionState, useId } from "react";
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
        <input type="hidden" name="essai_jours" value="14" />
        <p className="text-sm font-medium">14 jours d’essai gratuit, sans carte bancaire</p>
        <p className="text-sm text-muted-foreground">Créer cet espace ne démarre aucun abonnement payant. Son responsable devra confirmer une souscription. Après l’essai, ses données restent consultables et exportables.</p>
      </fieldset>

      {/* Une agence amenée par une autre — ou par un propriétaire : le code
          se saisit ici, à l'ouverture, pour que Gerimmo sache qui a amené qui
          (wiki : Parrainage, 19/09). */}
      <div className="space-y-2">
        <Label htmlFor={`${base}-parrain`}>Code de recommandation (facultatif)</Label>
        <Input
          id={`${base}-parrain`}
          name="code_parrainage"
          autoComplete="off"
          autoCapitalize="characters"
          placeholder="3FA2B9C0"
          maxLength={12}
          defaultValue={valeur("code_parrainage", "")}
          className="max-w-48"
        />
      </div>

      <p className="text-xs text-muted-foreground">La recommandation est enregistrée sans ajout automatique de remise ni de jours d’essai. Les avantages déjà accordés aux comptes existants restent conservés.</p>
      {etat.erreur && (
        <p role="alert" className="text-sm text-destructive">
          {etat.erreur}
        </p>
      )}

      <BoutonEnvoi enCoursTexte="Ouverture…">Ouvrir l&apos;organisation</BoutonEnvoi>
    </form>
  );
}
