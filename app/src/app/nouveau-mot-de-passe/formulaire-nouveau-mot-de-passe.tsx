"use client";

import { useActionState, useState } from "react";
import {
  definirNouveauMotDePasse,
  type EtatNouveauMotDePasse,
} from "@/app/actions/auth";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { AlerteFormulaire } from "@/components/alerte-formulaire";
import Link from "next/link";
import { LONGUEUR_MAX } from "@/lib/limites-saisie";
import { QUALITES_BAILLEUR } from "@/lib/qualite-bailleur";

export function FormulaireNouveauMotDePasse({ suite = "/espaces", profilAConfirmer }: { suite?: string; profilAConfirmer?: Record<string, string> }) {
  const [etat, action] = useActionState<EtatNouveauMotDePasse, FormData>(
    definirNouveauMotDePasse,
    {}
  );
  const [motDePasse, setMotDePasse] = useState("");

  const tropCourt = motDePasse.length > 0 && motDePasse.length < 12;

  return (
    <Card>
      <CardContent className="pt-6">
        <form data-saisie-libre action={action} className="space-y-4">
          <input type="hidden" name="suite" value={suite} />
          {profilAConfirmer && (
            <fieldset className="space-y-3 rounded-md border p-4">
              <legend className="px-1 font-medium">Vérifiez vos informations</legend>
              <p className="text-sm text-muted-foreground">Ces informations ont été saisies avant la confirmation de votre adresse. Corrigez-les et confirmez votre choix pour terminer l’inscription.</p>
              <label className="block space-y-1 text-sm">
                <span>Vous utilisez Gerimmo pour</span>
                <select name="espace" required defaultValue={["artisan", "proprietaire_direct"].includes(profilAConfirmer.espace) ? profilAConfirmer.espace : "invite"} className="w-full rounded-md border bg-background px-3 py-2">
                  <option value="proprietaire_direct">Gérer mes propres biens</option>
                  <option value="artisan">Mon activité d’artisan</option>
                  <option value="invite">Accéder à un espace auquel je suis invité</option>
                </select>
              </label>
              {([ ["prenom", "Prénom"], ["nom", "Nom"], ["telephone", "Téléphone"], ["adresse", "Adresse"], ["code_postal", "Code postal"], ["ville", "Ville"], ["code_parrainage", "Code de parrainage, si concerné"] ] as const).map(([champ, libelle]) => (
                <div key={champ} className="space-y-1">
                  <Label htmlFor={`confirmation-${champ}`}>{libelle}</Label>
                  <Input id={`confirmation-${champ}`} name={champ} defaultValue={profilAConfirmer[champ] ?? ""} maxLength={champ === "code_parrainage" ? 8 : LONGUEUR_MAX[champ]} />
                </div>
              ))}
              <label className="block space-y-1 text-sm">
                <span>Qualité du bailleur, si concerné</span>
                <select name="qualite" defaultValue={profilAConfirmer.qualite ?? ""} className="w-full rounded-md border bg-background px-3 py-2">
                  <option value="">Non renseignée</option>
                  {QUALITES_BAILLEUR.map((qualite) => <option key={qualite} value={qualite}>{qualite}</option>)}
                </select>
              </label>
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input type="checkbox" name="cgu" required className="size-6 shrink-0" />
                <span>J’accepte les <Link className="underline" href="/conditions" target="_blank" rel="noopener">conditions générales d&apos;utilisation et de vente</Link>.</span>
              </label>
            </fieldset>
          )}
          <div className="space-y-2">
            <Label htmlFor="mot_de_passe">Nouveau mot de passe</Label>
            <Input
              id="mot_de_passe"
              name="mot_de_passe"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
            />
            <p
              className={`text-xs ${tropCourt ? "text-destructive" : "text-muted-foreground"}`}
            >
              {tropCourt
                ? `Encore ${12 - motDePasse.length} caractère(s) : 12 minimum.`
                : "12 caractères minimum."}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmation">Confirmation</Label>
            <Input
              id="confirmation"
              name="confirmation"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
            />
          </div>
          {etat.erreur && <AlerteFormulaire signal={etat}>{etat.erreur}</AlerteFormulaire>}
          <BoutonEnvoi envoiNatif enCoursTexte="Enregistrement…" className="w-full">
            Changer le mot de passe
          </BoutonEnvoi>
        </form>
      </CardContent>
    </Card>
  );
}
