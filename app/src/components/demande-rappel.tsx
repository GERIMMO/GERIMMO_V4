"use client";

import { useActionState, useId } from "react";
import { Phone } from "lucide-react";
import { demanderRappel } from "@/app/actions/devis";
import type { EtatDevis } from "@/app/actions/devis";
import { Spinner } from "@/components/ui/spinner";
import { CRENEAUX_RAPPEL } from "@/lib/demande-rappel";

/**
 * « Être rappelé » (20/11/2026) : la carte où un visiteur laisse son numéro pour qu'on l'appelle. Posée sur l'accueil,
 * sous chaque outil gratuit et sous chaque article du journal ; `origine` dit d'où vient la demande.
 *
 * Le visiteur donne lui-même son numéro et coche son accord : c'est sa demande (décision 8 du 23/10). Même porte
 * d'écriture, même pot de miel et même limite de débit que le formulaire de contact (actions/devis.ts).
 * `data-appel-inscription` : la carte s'efface pour une personne venue de son espace, comme l'invitation à l'essai.
 * Le bouton est un bouton d'envoi natif, comme celui du formulaire de contact : l'action serveur est passée telle
 * quelle, le navigateur sait l'envoyer avant la fin du chargement des scripts.
 */
export function DemandeRappel({ origine, titre = "Vous préférez en parler ?" }: { origine: string; titre?: string }) {
  const [etat, action, enCours] = useActionState<EtatDevis, FormData>(demanderRappel, {});
  const id = useId();
  const champ = (nom: string) => `${id}-${nom}`;

  return (
    <section data-appel-inscription className="demande-rappel print:hidden" aria-labelledby={champ("titre")}>
      <div className="demande-rappel-texte">
        <span className="demande-rappel-icone" aria-hidden>
          <Phone size={20} />
        </span>
        <div>
          <h2 id={champ("titre")}>{titre}</h2>
          <p>
            Laissez votre numéro : le fondateur de Gerimmo vous rappelle sous un jour ouvré pour répondre à vos questions
            et, si vous le souhaitez, ouvrir votre espace avec vous. Gratuit, sans engagement.
          </p>
        </div>
      </div>

      {etat.succes ? (
        <p className="demande-rappel-succes" role="status">
          ✓ {etat.succes}
        </p>
      ) : (
        <form data-saisie-libre action={action} className="demande-rappel-formulaire">
          {/* Pot de miel anti-robot : invisible, doit rester vide */}
          <input type="text" name="site" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
          <input type="hidden" name="origine" value={origine} />
          <div>
            <label htmlFor={champ("nom")}>Votre nom</label>
            <input id={champ("nom")} name="nom" required maxLength={200} autoComplete="name" />
          </div>
          <div>
            <label htmlFor={champ("telephone")}>Votre téléphone</label>
            <input id={champ("telephone")} name="telephone" type="tel" required maxLength={40} autoComplete="tel" inputMode="tel" placeholder="06 12 34 56 78" />
          </div>
          <div>
            <label htmlFor={champ("email")}>Votre e-mail</label>
            <input id={champ("email")} name="email" type="email" required maxLength={320} autoComplete="email" />
          </div>
          <div>
            <label htmlFor={champ("creneau")}>Quand vous appeler ?</label>
            <select id={champ("creneau")} name="creneau" defaultValue="indifferent">
              {Object.entries(CRENEAUX_RAPPEL).map(([valeur, libelle]) => (
                <option key={valeur} value={valeur}>{libelle}</option>
              ))}
            </select>
          </div>
          <label className="demande-rappel-accord" htmlFor={champ("accord")}>
            <input id={champ("accord")} name="accord" type="checkbox" value="oui" required />
            <span>J&apos;accepte que Gerimmo m&apos;appelle à ce numéro au sujet de ma demande.</span>
          </label>
          {etat.erreur && (
            <p role="alert" className="demande-rappel-erreur">
              {etat.erreur}
            </p>
          )}
          <div className="demande-rappel-envoi">
            <button type="submit" disabled={enCours} className="btn-or">
              {enCours ? <><Spinner className="size-3" /> Envoi…</> : "Être rappelé"}
            </button>
            <p>
              Votre numéro sert uniquement à vous rappeler, jamais cédé ni revendu. Les durées de conservation figurent dans
              notre{" "}
              <a href="/confidentialite" className="underline underline-offset-2">
                politique de confidentialité
              </a>
              .
            </p>
          </div>
        </form>
      )}
    </section>
  );
}
