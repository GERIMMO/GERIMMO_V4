"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  demanderReinitialisation,
  type EtatReinitialisation,
} from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export function FormulaireReinitialisation() {
  const [etat, action, enCours] = useActionState<EtatReinitialisation, FormData>(
    demanderReinitialisation,
    {}
  );

  return (
    <Card>
      <CardContent className="pt-6">
        {etat.message ? (
          <div className="space-y-4">
            <p className="rounded-md bg-success-soft p-3 text-sm text-success-soft-foreground">
              {etat.message}
            </p>
            <Button
              variant="outline"
              className="w-full"
              render={<Link href="/connexion">Retour à la connexion</Link>}
            />
          </div>
        ) : (
          <form action={action} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Adresse email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </div>
            {etat.erreur && (
              <p className="text-sm text-destructive">{etat.erreur}</p>
            )}
            <Button type="submit" className="w-full" disabled={enCours}>
              {enCours ? "Envoi…" : "Envoyer le lien"}
            </Button>
            <p className="text-center text-sm">
              <Link href="/connexion" className="text-muted-foreground underline-offset-4 hover:underline">
                Retour à la connexion
              </Link>
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
