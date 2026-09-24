"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ouvrirEspaceProprietaire, type EtatOuvertureEspace } from "@/app/actions/auth";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * « Que voulez-vous faire ? » — l'écran d'un compte connecté sans aucun espace.
 *
 * Trois situations, trois cartes, dans l'ordre de fréquence : je gère mes
 * propres biens (on ouvre l'espace ici, en une étape) ; je suis artisan (on
 * inscrit l'entreprise) ; je suis locataire ou mon bien est confié à une
 * agence (c'est l'agence qui invite — on le dit, sans bouton). Avant le 24/09,
 * la page ne disait que « rapprochez-vous de votre agence » : une impasse.
 */
export function ChoixEspace({
  nomInitial,
  prenomInitial,
}: {
  nomInitial?: string;
  prenomInitial?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [etat, action] = useActionState<EtatOuvertureEspace, FormData>(ouvrirEspaceProprietaire, {});
  const v = etat.valeurs ?? {};

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground">
        Votre compte est créé, mais il n&apos;est encore rattaché à aucun espace.
      </p>

      {/* 1. Je gère mes propres biens — l'espace s'ouvre ici, en une étape. */}
      <div className="carte-espace flex-col items-stretch gap-3">
        <button
          type="button"
          onClick={() => setOuvert(true)}
          aria-expanded={ouvert}
          className="flex w-full items-center gap-3 text-left"
        >
          <span className="pastille-marque flex size-9.5 shrink-0 items-center justify-center rounded-full text-[13px]">
            PR
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Je gère mes propres biens</span>
            <span className="block text-xs text-muted-foreground">
              Ouvrir mon espace propriétaire — gratuit pendant 14 jours
            </span>
          </span>
          {!ouvert && <span className="text-sm font-medium text-[var(--marque-sombre)]">Ouvrir →</span>}
        </button>
        {ouvert && (
          <form action={action} className="space-y-3 border-t border-[var(--filet)] pt-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ouv-prenom">Prénom</Label>
                <Input id="ouv-prenom" name="prenom" autoComplete="given-name" defaultValue={v.prenom ?? prenomInitial} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ouv-nom">Nom</Label>
                <Input id="ouv-nom" name="nom" required autoComplete="family-name" defaultValue={v.nom ?? nomInitial} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ouv-qualite">Vous êtes</Label>
              <select
                id="ouv-qualite"
                name="qualite"
                defaultValue={v.qualite ?? "Personne physique"}
                className="h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
              >
                <option>Personne physique</option>
                <option>SCI</option>
                <option>Indivision</option>
              </select>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="cgu" required className="mt-1" />
              {/* Nouvel onglet (24/09), comme à l'inscription : dans le même
                  onglet, lire les conditions coûtait la saisie en cours, et
                  « ← Retour » ramenait sur la vitrine, pas sur ce formulaire. */}
              <span>
                J&apos;accepte les{" "}
                <Link href="/conditions" target="_blank" rel="noopener" className="underline underline-offset-4">
                  conditions d&apos;utilisation
                </Link>
                .
              </span>
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <BoutonEnvoi>Ouvrir mon espace</BoutonEnvoi>
              {etat.erreur && (
                <p role="alert" className="text-sm text-destructive">
                  {etat.erreur}
                </p>
              )}
            </div>
          </form>
        )}
      </div>

      {/* 2. Je suis artisan — l'entreprise s'inscrit depuis ce même compte. */}
      <Link href="/artisan/inscription" className="carte-espace">
        <span className="pastille-marque flex size-9.5 shrink-0 items-center justify-center rounded-full text-[13px]">
          AR
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Je suis artisan</span>
          <span className="block text-xs text-muted-foreground">
            Inscrire mon entreprise pour recevoir des demandes de devis et des missions
          </span>
        </span>
        <span className="text-sm font-medium text-[var(--marque-sombre)]">Inscrire →</span>
      </Link>

      {/* 3. Locataire, ou propriétaire dont le bien est confié à une agence :
          rien à faire ici, c'est l'agence qui invite. Pas de bouton, donc pas
          de fausse promesse. */}
      <div className="carte-espace indisponible cursor-default">
        <span className="pastille-marque flex size-9.5 shrink-0 items-center justify-center rounded-full text-[13px]">
          AG
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Je suis locataire, ou mon bien est confié à une agence</span>
          <span className="block text-xs text-muted-foreground">
            C&apos;est votre agence qui vous envoie l&apos;invitation, à cette adresse e-mail. Vérifiez vos
            courriers, ou demandez-la-lui.
          </span>
        </span>
      </div>

      <p className="pt-1 text-xs text-muted-foreground">
        Vous êtes une agence ?{" "}
        <Link href="/#agences" className="underline underline-offset-4">
          Demandez un devis
        </Link>{" "}
        : nous ouvrons votre espace avec vous.
      </p>
    </div>
  );
}
