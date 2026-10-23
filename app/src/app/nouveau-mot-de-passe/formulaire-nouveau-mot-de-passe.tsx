"use client";

import { useActionState, useState } from "react";
import {
  definirNouveauMotDePasse,
  type ChampNouveauMotDePasse,
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

const CHAMPS_TEXTE_PROFIL = [
  ["prenom", "Prénom"],
  ["nom", "Nom"],
  ["telephone", "Téléphone"],
  ["adresse", "Adresse"],
  ["code_postal", "Code postal"],
  ["ville", "Ville"],
  ["code_parrainage", "Code de parrainage, si concerné"],
] as const;
/** Les champs du bloc « Vérifiez vos informations » auxquels un refus peut s'adresser. */
const CHAMPS_DU_PROFIL: ChampNouveauMotDePasse[] = ["espace", "cgu", ...CHAMPS_TEXTE_PROFIL.map(([champ]) => champ)];
const ID_ERREUR = "erreur-nouveau-mot-de-passe";
const ID_AIDE_MOT_DE_PASSE = "aide-mot-de-passe";

export function FormulaireNouveauMotDePasse({ suite = "/espaces", profilAConfirmer }: { suite?: string; profilAConfirmer?: Record<string, string> }) {
  const [etat, action] = useActionState<EtatNouveauMotDePasse, FormData>(
    definirNouveauMotDePasse,
    {}
  );
  // Seule la LONGUEUR du mot de passe est suivie, pour l'aide sous le champ. Le champ n'est pas contrôlé : le mot de
  // passe n'est jamais recopié dans le HTML, et React le vide avec la confirmation après chaque envoi — un refus ne
  // repose jamais un mot de passe, comme sur /inscription et « Mon compte ». L'aide repart de zéro avec lui (onReset).
  const [longueur, setLongueur] = useState(0);
  const tropCourt = longueur > 0 && longueur < 12;

  // Relevé du 23/10 (PRO-4) : un refus vidait le profil corrigé et décochait la case des conditions. La saisie revient
  // par etat.valeurs (lib/formulaires.ts) et l'alerte se place sous le champ fautif, qui est marqué invalide.
  const saisie = etat.valeurs ?? {};
  const valeur = (champ: string) => saisie[champ] ?? profilAConfirmer?.[champ] ?? "";
  const champsAffiches = new Set<ChampNouveauMotDePasse>(["mot_de_passe", "confirmation", ...(profilAConfirmer ? CHAMPS_DU_PROFIL : [])]);
  const champErreur = etat.erreur && etat.champ && champsAffiches.has(etat.champ) ? etat.champ : undefined;
  const alerte = etat.erreur ? (
    <div id={ID_ERREUR}>
      <AlerteFormulaire signal={etat}>{etat.erreur}</AlerteFormulaire>
    </div>
  ) : null;
  const sous = (champ: ChampNouveauMotDePasse) => (champErreur === champ ? alerte : null);
  const marque = (champ: ChampNouveauMotDePasse, aide?: string) => {
    const decrit = [aide, champErreur === champ ? ID_ERREUR : undefined].filter(Boolean).join(" ");
    return { "aria-invalid": champErreur === champ ? true : undefined, "aria-describedby": decrit || undefined };
  };
  // Les deux listes déroulantes sont REMONTÉES quand la valeur à reposer change (clé = valeur). React remet le formulaire
  // à zéro après chaque action (`form.reset()`, refus compris) : un champ de saisie a reçu entre-temps sa nouvelle valeur
  // par défaut, mais un <select> déjà monté garde l'option par défaut de son PREMIER affichage — React ne réapplique pas
  // `defaultValue` à une mise à jour. La liste reprenait donc l'usage et la qualité d'origine, et un second envoi les
  // enregistrait en silence (relecture du 23/10, PRO-4 incomplet). Remontée, la liste part de la valeur envoyée. Sans
  // script, la page est rendue par le serveur avec cette valeur : la clé n'y change rien.
  const espace = ["artisan", "proprietaire_direct"].includes(valeur("espace")) ? valeur("espace") : "invite";
  const qualite = valeur("qualite");

  return (
    <Card>
      <CardContent className="pt-6">
        <form data-saisie-libre action={action} onReset={() => setLongueur(0)} className="space-y-4">
          <input type="hidden" name="suite" value={suite} />
          {profilAConfirmer && (
            <fieldset className="space-y-3 rounded-md border p-4">
              <legend className="px-1 font-medium">Vérifiez vos informations</legend>
              <p className="text-sm text-muted-foreground">Ces informations ont été saisies avant la confirmation de votre adresse. Corrigez-les et confirmez votre choix pour terminer l’inscription.</p>
              <label className="block space-y-1 text-sm">
                <span>Vous utilisez Gerimmo pour</span>
                <select key={`espace-${espace}`} name="espace" required defaultValue={espace} {...marque("espace")} className="w-full rounded-md border bg-background px-3 py-2">
                  <option value="proprietaire_direct">Gérer mes propres biens</option>
                  <option value="artisan">Mon activité d’artisan</option>
                  <option value="invite">Accéder à un espace auquel je suis invité</option>
                </select>
              </label>
              {sous("espace")}
              {CHAMPS_TEXTE_PROFIL.map(([champ, libelle]) => (
                <div key={champ} className="space-y-1">
                  <Label htmlFor={`confirmation-${champ}`}>{libelle}</Label>
                  <Input id={`confirmation-${champ}`} name={champ} defaultValue={valeur(champ)} maxLength={champ === "code_parrainage" ? 8 : LONGUEUR_MAX[champ]} {...marque(champ)} />
                  {sous(champ)}
                </div>
              ))}
              <label className="block space-y-1 text-sm">
                <span>Qualité du bailleur, si concerné</span>
                <select key={`qualite-${qualite}`} name="qualite" defaultValue={qualite} className="w-full rounded-md border bg-background px-3 py-2">
                  <option value="">Non renseignée</option>
                  {QUALITES_BAILLEUR.map((qualite) => <option key={qualite} value={qualite}>{qualite}</option>)}
                </select>
              </label>
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input type="checkbox" name="cgu" required className="size-6 shrink-0" defaultChecked={saisie.cgu === "on"} {...marque("cgu")} />
                <span>J’accepte les <Link className="underline" href="/conditions" target="_blank" rel="noopener">conditions générales d&apos;utilisation et de vente</Link>.</span>
              </label>
              {sous("cgu")}
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
              onChange={(e) => setLongueur(e.target.value.length)}
              {...marque("mot_de_passe", ID_AIDE_MOT_DE_PASSE)}
            />
            <p
              id={ID_AIDE_MOT_DE_PASSE}
              className={`text-xs ${tropCourt ? "text-destructive" : "text-muted-foreground"}`}
            >
              {tropCourt
                ? `Encore ${12 - longueur} caractère(s) : 12 minimum.`
                : "12 caractères minimum."}
            </p>
            {sous("mot_de_passe")}
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
              {...marque("confirmation")}
            />
            {sous("confirmation")}
          </div>
          {!champErreur && alerte}
          <BoutonEnvoi envoiNatif enCoursTexte="Enregistrement…" className="w-full">
            Changer le mot de passe
          </BoutonEnvoi>
        </form>
      </CardContent>
    </Card>
  );
}
