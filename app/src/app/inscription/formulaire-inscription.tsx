"use client";

import { useActionState } from "react";
import Link from "next/link";
import { inscrireProprietaire, type EtatInscription } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { AlerteFormulaire } from "@/components/alerte-formulaire";

// `dureeEssai` vient de la page (calculé côté serveur, à la date du jour) :
// le texte du formulaire suit l'offre de lancement sans écart d'hydratation.
export function FormulaireInscription({
  codeParrain,
  dureeEssai,
}: {
  codeParrain?: string | null;
  dureeEssai: string;
}) {
  const [etat, action] = useActionState<EtatInscription, FormData>(
    inscrireProprietaire,
    {}
  );

  // Relecture du 23/10 (même défaut que PRO-4) : React remet le formulaire à zéro après chaque action, et un <select>
  // déjà monté ne reprend pas un nouveau `defaultValue`. Après un refus, la liste revenait à « Personne physique » et un
  // second envoi enregistrait une autre qualité que celle choisie. La clé, égale à la valeur à reposer, remonte la
  // liste quand cette valeur change : elle part de la qualité envoyée. Sans script, le HTML du serveur la porte déjà.
  const qualite = etat.valeurs?.qualite ?? "Personne physique";

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
        <form data-saisie-libre action={action} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nom">Votre nom</Label>
            <Input id="nom" name="nom" maxLength={100} autoComplete="family-name" required defaultValue={etat.valeurs?.nom} className="min-h-11" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Adresse e-mail</Label>
            <Input
              className="min-h-11"
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              defaultValue={etat.valeurs?.email}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ins-qualite">Vous louez en tant que</Label>
            <select key={`qualite-${qualite}`} id="ins-qualite" name="qualite" defaultValue={qualite} className="min-h-11 w-full rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm">
              <option value="Personne physique">Particulier</option>
              <option value="SCI">SCI</option>
              <option value="SCI familiale">SCI familiale</option>
              <option value="Indivision (personnes physiques)">Indivision entre particuliers</option>
              <option value="Personne morale">Autre société</option>
            </select>
          </div>
          <details key={`parrain-${etat.valeurs?.code_parrainage ?? codeParrain ?? ""}`} open={!!(etat.valeurs?.code_parrainage ?? codeParrain)} className="rounded-lg border border-border/70 px-3 text-sm">
            <summary className="flex min-h-11 cursor-pointer items-center text-muted-foreground">Vous avez un code de parrainage ?</summary>
            <div className="space-y-2 pb-3">
              <Label htmlFor="code-parrainage">Code de parrainage (facultatif)</Label>
              <Input id="code-parrainage" name="code_parrainage" autoComplete="off" autoCapitalize="characters" placeholder="Ex. : ABCD1234" maxLength={12} className="min-h-11" defaultValue={etat.valeurs?.code_parrainage ?? codeParrain ?? ""} />
              <p className="text-xs text-muted-foreground">Le code identifie votre parrain. Votre essai reste de {dureeEssai}, sans carte et sans abonnement automatique.</p>
            </div>
          </details>
          <p className="text-sm text-muted-foreground">
            Confirmez votre e-mail, puis choisissez votre mot de passe et acceptez les{" "}
            <Link href="/conditions" target="_blank" rel="noopener" className="lien-texte">conditions générales d&apos;utilisation et de vente</Link>.
          </p>
          {etat.erreur && <AlerteFormulaire signal={etat}>{etat.erreur}</AlerteFormulaire>}
          {/* Information RGPD au moment de la collecte (art. 13) : une phrase
              et le lien, au plus près du bouton qui envoie les données. */}
          <p className="text-xs text-muted-foreground">
            Vos données servent à gérer votre compte. Vos droits : consultez la{" "}
            <Link href="/confidentialite" target="_blank" rel="noopener" className="lien-texte">
              page confidentialité
            </Link>
            .
          </p>
          <BoutonEnvoi envoiNatif enCoursTexte="Ouverture…" className="min-h-11 w-full">
            Ouvrir mon espace
          </BoutonEnvoi>
          {/* Cible de 44 px au doigt (24/09), sans changer l'allure du texte. */}
          <p className="text-center text-sm">
            <Link
              href="/connexion"
              className="inline-flex min-h-11 items-center text-muted-foreground underline-offset-4 hover:underline"
            >
              J&apos;ai déjà un compte
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
