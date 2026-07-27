"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export function FormulaireConnexion() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionExpiree = searchParams.get("raison") === "session-expiree";

  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function seConnecter(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: motDePasse,
    });
    if (error) {
      setErreur("Identifiants invalides.");
      setEnCours(false);
      return;
    }
    router.push("/espaces");
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="pt-6">
        {sessionExpiree && (
          <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Votre session a expiré, veuillez vous reconnecter.
          </p>
        )}
        <form onSubmit={seConnecter} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Adresse email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mot-de-passe">Mot de passe</Label>
            <Input
              id="mot-de-passe"
              type="password"
              autoComplete="current-password"
              required
              minLength={12}
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
            />
          </div>
          {erreur && <p className="text-sm text-destructive">{erreur}</p>}
          <Button type="submit" className="w-full" disabled={enCours}>
            {enCours ? "Connexion…" : "Se connecter"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
