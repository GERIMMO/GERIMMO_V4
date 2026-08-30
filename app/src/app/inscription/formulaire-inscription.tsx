"use client";

import { useActionState } from "react";
import Link from "next/link";
import { inscrireProprietaire, type EtatInscription } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export function FormulaireInscription() {
  const [etat, action, enCours] = useActionState<EtatInscription, FormData>(
    inscrireProprietaire,
    {}
  );

  if (etat.message) {
    return (
      <Card>
        <CardContent className="space-y-4 pt-6">
          <p className="rounded-md bg-success-soft p-3 text-sm text-success-soft-foreground">
            {etat.message}
          </p>
          <Button
            variant="outline"
            className="w-full"
            nativeButton={false}
            render={<Link href="/connexion">Retour à la connexion</Link>}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        {/* En erreur, la saisie est reposée via etat.valeurs (convention React 19) */}
        <form action={action} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="prenom">Prénom</Label>
              <Input
                id="prenom"
                name="prenom"
                autoComplete="given-name"
                defaultValue={etat.valeurs?.prenom}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nom">Nom</Label>
              <Input
                id="nom"
                name="nom"
                autoComplete="family-name"
                required
                defaultValue={etat.valeurs?.nom}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ins-adresse">Adresse postale</Label>
            <Input id="ins-adresse" name="adresse" autoComplete="street-address" defaultValue={etat.valeurs?.adresse} placeholder="12 rue des Lilas" />
            <p className="text-xs text-muted-foreground">
              Elle signera vos documents (baux, quittances…).
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ins-cp">Code postal</Label>
              <Input id="ins-cp" name="code_postal" autoComplete="postal-code" defaultValue={etat.valeurs?.code_postal} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ins-ville">Ville</Label>
              <Input id="ins-ville" name="ville" autoComplete="address-level2" defaultValue={etat.valeurs?.ville} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ins-tel">Téléphone</Label>
              <Input id="ins-tel" name="telephone" autoComplete="tel" defaultValue={etat.valeurs?.telephone} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ins-qualite">Vous louez en tant que</Label>
              <select
                id="ins-qualite"
                name="qualite"
                defaultValue={etat.valeurs?.qualite ?? "Personne physique"}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option>Personne physique</option>
                <option>SCI</option>
                <option>Indivision</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Adresse email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              defaultValue={etat.valeurs?.email}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mot-de-passe">Mot de passe</Label>
            <Input
              id="mot-de-passe"
              name="mot_de_passe"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
            />
            <p className="text-xs text-muted-foreground">12 caractères minimum.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmation">Confirmer le mot de passe</Label>
            <Input
              id="confirmation"
              name="confirmation"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
            />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="cgu"
              value="1"
              className="mt-1"
              defaultChecked={etat.valeurs?.cgu === "1"}
            />
            <span>
              J&apos;accepte les conditions d&apos;utilisation. Gerimmo tient un
              journal de gestion, pas une comptabilité : en cas d&apos;écart, le
              relevé bancaire fait foi.
            </span>
          </label>
          {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
          <Button type="submit" className="w-full" disabled={enCours}>
            {enCours ? "Ouverture…" : "Ouvrir mon espace"}
          </Button>
          <p className="text-center text-sm">
            <Link
              href="/connexion"
              className="text-muted-foreground underline-offset-4 hover:underline"
            >
              J&apos;ai déjà un compte
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
