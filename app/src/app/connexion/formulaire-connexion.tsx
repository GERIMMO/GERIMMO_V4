"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { destinationSure } from "@/lib/destination-sure";
import { CLE_SESSION_ALERTES } from "@/components/synthese-alertes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
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
      "Ce lien est invalide, expiré ou déjà utilisé. Redemandez un e-mail de réinitialisation.",
    ton: "info",
  },
};

/**
 * Le visiteur renvoyé ici depuis une page protégée (24/09) : il arrivait sur
 * l'écran de connexion sans un mot. On lui dit pourquoi, et qu'il sera ramené
 * à la page demandée. Même garde que la redirection finale : un chemin
 * externe ne produit aucun message.
 */
function messageDeSuite(suite: string | null) {
  const destination = destinationSure(suite, "");
  if (!destination) return undefined;
  return {
    texte: destination.startsWith("/assistance")
      ? "Connectez-vous pour accéder à l'aide et aux retours ; vous y serez ramené."
      : "Connectez-vous pour ouvrir la page demandée ; vous y serez ramené.",
    ton: "info" as const,
  };
}

export function FormulaireConnexion() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const message =
    MESSAGES[searchParams.get("raison") ?? ""] ?? messageDeSuite(searchParams.get("suite"));

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
      // Trois causes, trois gestes : l'adresse à confirmer, le réseau à
      // retenter, ou la saisie à corriger. « Identifiants invalides » pour
      // tout laissait chercher une faute de frappe qui n'existait pas.
      if (error.code === "email_not_confirmed") {
        setErreur(
          "Votre adresse e-mail n'est pas encore confirmée. Ouvrez le lien reçu par e-mail, puis reconnectez-vous."
        );
      } else if (error.name === "AuthRetryableFetchError" || error.status === 0) {
        setErreur("Connexion au serveur impossible. Vérifiez votre accès à Internet et réessayez.");
      } else {
        setErreur("Identifiants invalides.");
      }
      setEnCours(false);
      return;
    }
    // Retour à la destination demandée avant la connexion, s'il y en avait
    // une — filtrée par destinationSure (aucune URL externe ne peut passer).
    router.push(destinationSure(searchParams.get("suite")));
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
            <Label htmlFor="email">Adresse e-mail</Label>
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
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
            />
          </div>
          {erreur && (
            <p className="text-sm text-destructive" role="alert">
              {erreur}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={enCours}>
            {enCours ? <><Spinner /> Connexion…</> : "Se connecter"}
          </Button>
          {/* Cibles de 44 px au doigt (24/09) : ces liens texte n'en
              faisaient que 20, sous un bouton qui en fait 44. Le style du
              texte ne change pas ; l'espacement se resserre d'autant. */}
          <p className="-mt-2 text-center text-sm">
            <Link
              href="/mot-de-passe-oublie"
              className="inline-flex min-h-11 items-center text-muted-foreground underline-offset-4 hover:underline"
            >
              Mot de passe oublié ?
            </Link>
          </p>
          <p className="border-t border-border pt-2 text-center text-sm text-muted-foreground">
            Propriétaire bailleur ?{" "}
            <Link
              href="/inscription"
              className="inline-flex min-h-11 items-center text-foreground underline underline-offset-4"
            >
              Ouvrir mon espace
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
