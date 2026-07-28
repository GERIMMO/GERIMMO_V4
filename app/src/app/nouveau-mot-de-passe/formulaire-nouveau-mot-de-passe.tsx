"use client";

import { useActionState, useState } from "react";
import {
  definirNouveauMotDePasse,
  type EtatNouveauMotDePasse,
} from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export function FormulaireNouveauMotDePasse() {
  const [etat, action, enCours] = useActionState<EtatNouveauMotDePasse, FormData>(
    definirNouveauMotDePasse,
    {}
  );
  const [motDePasse, setMotDePasse] = useState("");

  const tropCourt = motDePasse.length > 0 && motDePasse.length < 12;

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={action} className="space-y-4">
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
          {etat.erreur && (
            <p className="text-sm text-destructive">{etat.erreur}</p>
          )}
          <Button type="submit" className="w-full" disabled={enCours}>
            {enCours ? "Enregistrement…" : "Changer le mot de passe"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
