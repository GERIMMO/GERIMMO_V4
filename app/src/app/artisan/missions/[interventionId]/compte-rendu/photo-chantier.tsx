"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  deposerPhotoChantier,
  type EtatArtisanAction,
} from "@/app/actions/artisan";
import { compresserChampFichiers } from "@/lib/compresser-image";
import { Avertissement, Erreur, Succes } from "../../../ui";

/**
 * LA PHOTO — champ central du compte rendu (RM-19.3.2), pas pièce jointe.
 *
 * Elle occupe l'écran parce qu'elle en est le sujet : sans photo « après »,
 * l'intervention ne peut pas être terminée (RM-7.5.2), donc l'agence ne peut
 * pas facturer. Trois décisions, toutes dictées par le chantier :
 *
 *  · `capture="environment"` ouvre l'appareil photo arrière directement — pas
 *    la galerie, pas un sélecteur de fichiers ;
 *  · la photo est COMPRESSÉE À LA PRISE (module 19, réseau faible) : une photo
 *    de téléphone sort à 8-15 Mo, le réseau d'une cave rarement autant ;
 *  · elle PART TOUT DE SUITE, sans bouton « envoyer » : l'envoi démarre dès
 *    que la photo est prise. C'est un envoi court, qu'on peut recommencer si
 *    le réseau lâche — plutôt qu'un gros envoi photo + texte qui échoue en
 *    bloc et fait tout ressaisir au second écran.
 */

function Etat({ dejaEnvoyee }: { dejaEnvoyee: boolean }) {
  const { pending } = useFormStatus();
  if (pending) {
    return (
      <p className="flex items-center justify-center gap-2.5 text-[0.9375rem] text-[var(--texte-secondaire)]">
        <span className="rond-attente" aria-hidden />
        Envoi de la photo…
      </p>
    );
  }
  if (dejaEnvoyee) return null;
  return (
    <p className="text-center text-[0.9375rem] text-[var(--texte-secondaire)]">
      La photo part dès que vous l&apos;avez prise.
    </p>
  );
}

export function PhotoChantier({
  interventionId,
  moment,
  dejaEnvoyee,
  titre,
  aide,
}: {
  interventionId: string;
  moment: "avant" | "pendant" | "apres";
  dejaEnvoyee: boolean;
  titre: string;
  aide?: string;
}) {
  const [etat, action] = useActionState<EtatArtisanAction, FormData>(
    deposerPhotoChantier.bind(null, interventionId),
    {}
  );
  const formulaire = useRef<HTMLFormElement>(null);
  const idChamp = useId();
  const [apercu, setApercu] = useState<string | null>(null);

  // L'URL d'objet vit le temps de l'aperçu : sans cette libération, chaque
  // reprise de photo laisserait un blob en mémoire du navigateur.
  useEffect(() => () => {
    if (apercu) URL.revokeObjectURL(apercu);
  }, [apercu]);

  const envoyee = dejaEnvoyee || Boolean(etat.succes);

  return (
    <form action={action} ref={formulaire} className="space-y-3">
      <input type="hidden" name="moment" value={moment} />

      <label
        htmlFor={idChamp}
        className={`flex min-h-40 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
          envoyee
            ? "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success-soft-foreground)]"
            : "border-[var(--encre)] bg-[var(--ardoise)] text-[var(--encre)]"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className="size-10 fill-none stroke-current stroke-[1.4]"
        >
          <path
            d="M4 8.5h3.2l1.6-2.4h6.4l1.6 2.4H20v10H4z"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="13" r="3.4" />
        </svg>
        <span className="text-[1.0625rem] font-medium">
          {envoyee ? `${titre} — envoyée` : titre}
        </span>
        {aide && <span className="text-[0.9375rem] font-normal">{aide}</span>}
        {envoyee && (
          <span className="text-[0.9375rem] font-normal">
            Toucher pour en ajouter une autre
          </span>
        )}
      </label>

      <input
        id={idChamp}
        name="photo"
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const champ = e.currentTarget;
          const fichier = champ.files?.[0];
          if (!fichier) return;
          setApercu((ancien) => {
            if (ancien) URL.revokeObjectURL(ancien);
            return URL.createObjectURL(fichier);
          });
          // Compression d'abord, envoi ensuite : `requestSubmit` doit partir
          // avec les octets allégés, sinon la compression ne sert à rien.
          void compresserChampFichiers(champ).then(() =>
            formulaire.current?.requestSubmit()
          );
        }}
      />

      {apercu && (
        // next/image ne sait pas servir une URL d'objet (`blob:`) : l'image
        // n'existe que dans ce navigateur, elle n'a pas d'URL à optimiser.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={apercu}
          alt={`Aperçu de la photo ${titre.toLowerCase()}`}
          className="h-auto w-full rounded-lg border border-border object-cover"
        />
      )}

      <Etat dejaEnvoyee={envoyee} />
      {etat.succes && <Succes>{etat.succes}</Succes>}
      {etat.avertissement && <Avertissement>{etat.avertissement}</Avertissement>}
      {etat.erreur && <Erreur>{etat.erreur}</Erreur>}
    </form>
  );
}
