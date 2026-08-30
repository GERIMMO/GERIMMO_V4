"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CLE_SESSION_ALERTES } from "@/components/synthese-alertes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

const MESSAGES: Record<string, { texte: string; ton: "info" | "succes" }> = {
  "session-expiree": {
    texte: "Votre session a expiré, veuillez vous reconnecter.",
    ton: "info",
  },
  "mot-de-passe-modifie": {
    texte: "Mot de passe modifié. Connectez-vous avec votre nouveau mot de passe.",
    ton: "succes",
  },
  "lien-invalide": {
    texte:
      "Ce lien est invalide, expiré ou déjà utilisé. Redemandez un email de réinitialisation.",
    ton: "info",
  },
};

export function FormulaireConnexion() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const message = MESSAGES[searchParams.get("raison") ?? ""];

  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  // Atterrir sur la page de connexion = nouvelle session utilisateur : on oublie
  // la synthèse d'alertes déjà vue, sinon une reconnexion dans le même onglet
  // ne la rouvrirait jamais (le sessionStorage survit à la déconnexion).
  useEffect(() => {
    sessionStorage.removeItem(CLE_SESSION_ALERTES);
  }, []);

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
        {message && (
          <p
            className={`mb-4 rounded-md p-3 text-sm ${
              message.ton === "succes"
                ? "bg-success-soft text-success-soft-foreground"
                : "bg-accent text-accent-foreground"
            }`}
          >
            {message.texte}
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
          <p className="text-center text-sm">
            <Link
              href="/mot-de-passe-oublie"
              className="text-muted-foreground underline-offset-4 hover:underline"
            >
              Mot de passe oublié ?
            </Link>
          </p>
          <p className="border-t border-border pt-4 text-center text-sm text-muted-foreground">
            Propriétaire bailleur ?{" "}
            <Link href="/inscription" className="text-foreground underline-offset-4 hover:underline">
              Ouvrir mon espace
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
