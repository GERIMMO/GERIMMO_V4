"use client";

import { useActionState, useState, type FormEvent } from "react";
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
  // Audit final (UX-07) : la validation était laissée au navigateur — une bulle éphémère, dans la langue du navigateur,
  // sans message sous le champ ni aria-invalid. Même motif que formulaire-nouveau-mot-de-passe.tsx : le formulaire
  // vérifie lui-même les deux champs obligatoires, dit en français ce qui manque sous le champ, et y pose le focus.
  const [manquants, setManquants] = useState<Partial<Record<"nom" | "email", string>>>({});
  const marque = (champ: "nom" | "email") => ({
    "aria-invalid": manquants[champ] ? true : undefined,
    "aria-describedby": manquants[champ] ? `erreur-${champ}` : undefined,
    onChange: () => manquants[champ] && setManquants((m) => ({ ...m, [champ]: undefined })),
  });
  const sous = (champ: "nom" | "email") =>
    // Pas de role="alert" ici : le focus va au champ, qui lit ce message par aria-describedby (une alerte focalisée,
    // AlerteFormulaire, reprendrait le focus au champ).
    manquants[champ] ? <p id={`erreur-${champ}`} className="text-sm text-destructive">{manquants[champ]}</p> : null;
  function verifierAvantEnvoi(e: FormEvent<HTMLFormElement>) {
    const champs = e.currentTarget.elements;
    const nom = champs.namedItem("nom") as HTMLInputElement;
    const email = champs.namedItem("email") as HTMLInputElement;
    const erreurs: typeof manquants = {};
    if (!nom.value.trim()) erreurs.nom = "Indiquez votre nom.";
    if (!email.value.trim()) erreurs.email = "Indiquez votre adresse e-mail.";
    else if (!email.validity.valid) erreurs.email = "Cette adresse e-mail n’est pas valide (ex. prenom@exemple.fr).";
    setManquants(erreurs);
    if (erreurs.nom || erreurs.email) {
      e.preventDefault();
      (erreurs.nom ? nom : email).focus();
    }
  }

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
        {/* En erreur, la saisie est reposée via etat.valeurs (convention React 19).
            24/09 : « (facultatif) » sur chaque champ optionnel, rien sur les
            obligatoires — seul le code de parrainage le disait, et neuf champs
            paraissaient requis quand cinq ne le sont pas. */}
        <form data-saisie-libre action={action} noValidate onSubmit={verifierAvantEnvoi} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="prenom">Prénom (facultatif)</Label>
              <Input
                id="prenom"
                name="prenom"
                maxLength={100}
                autoComplete="given-name"
                defaultValue={etat.valeurs?.prenom}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nom">Nom</Label>
              <Input
                id="nom"
                name="nom"
                maxLength={100}
                autoComplete="family-name"
                required
                defaultValue={etat.valeurs?.nom}
                {...marque("nom")}
              />
              {sous("nom")}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ins-adresse">Adresse postale (facultatif)</Label>
            <Input id="ins-adresse" name="adresse" maxLength={200} autoComplete="street-address" defaultValue={etat.valeurs?.adresse} placeholder="ex. 12 rue des Lilas" />
            <p className="text-xs text-muted-foreground">
              Elle signera vos documents (baux, quittances…).
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ins-cp">Code postal (facultatif)</Label>
              <Input id="ins-cp" name="code_postal" maxLength={10} inputMode="numeric" autoComplete="postal-code" defaultValue={etat.valeurs?.code_postal} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ins-ville">Ville (facultatif)</Label>
              <Input id="ins-ville" name="ville" maxLength={100} autoComplete="address-level2" defaultValue={etat.valeurs?.ville} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ins-tel">Téléphone (facultatif)</Label>
              <Input id="ins-tel" name="telephone" maxLength={30} type="tel" autoComplete="tel" defaultValue={etat.valeurs?.telephone} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ins-qualite">Vous louez en tant que</Label>
              {/* Le gabarit du composant Input (24/09) : à côté du téléphone,
                  le menu faisait 5 px de plus, un autre arrondi, sans anneau
                  de focus. */}
              <select
                key={`qualite-${qualite}`}
                id="ins-qualite"
                name="qualite"
                defaultValue={qualite}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
              >
                {/* Liste fermée (audit 29/09) : la durée du bail nu en dépend. */}
                <option value="Personne physique">Personne physique</option>
                <option value="Indivision (personnes physiques)">Indivision (personnes physiques)</option>
                <option value="SCI familiale">SCI familiale (entre parents et alliés)</option>
                <option value="SCI">SCI (non familiale)</option>
                <option value="Personne morale">Autre personne morale (société…)</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Adresse e-mail</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              defaultValue={etat.valeurs?.email}
              {...marque("email")}
            />
            {sous("email")}
          </div>
          <div className="space-y-2">
            <Label htmlFor="code-parrainage">Code de parrainage (facultatif)</Label>
            <Input
              id="code-parrainage"
              name="code_parrainage"
              autoComplete="off"
              autoCapitalize="characters"
              placeholder="ex. ABCD1234"
              maxLength={12}
              defaultValue={etat.valeurs?.code_parrainage ?? codeParrain ?? ""}
            />
            <p className="text-xs text-muted-foreground">
              Si quelqu&apos;un vous a recommandé Gerimmo, indiquez son code
              pour faire gagner un mois à la personne qui vous recommande, dès
              votre premier paiement. Pour vous, l&apos;essai reste de{" "}
              {dureeEssai}, sans carte, comme pour tous : le code ne vous
              ouvre pas d&apos;avantage supplémentaire. Sinon, laissez vide.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Vous recevrez un lien pour confirmer votre adresse, choisir votre mot de passe et accepter les{" "}
            <Link href="/conditions" target="_blank" rel="noopener" className="lien-texte">conditions générales d&apos;utilisation et de vente</Link>.
          </p>
          {etat.erreur && <AlerteFormulaire signal={etat}>{etat.erreur}</AlerteFormulaire>}
          {/* Information RGPD au moment de la collecte (art. 13) : une phrase
              et le lien, au plus près du bouton qui envoie les données. */}
          <p className="text-xs text-muted-foreground">
            Vos données servent à créer et gérer votre compte et votre
            abonnement. Pour en savoir plus et exercer vos droits, consultez la{" "}
            <Link href="/confidentialite" target="_blank" rel="noopener" className="lien-texte">
              page confidentialité
            </Link>
            .
          </p>
          <BoutonEnvoi envoiNatif enCoursTexte="Ouverture…" className="w-full">
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
