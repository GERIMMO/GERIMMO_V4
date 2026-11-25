"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { joindrePhotoLigneEdl, retirerPhotoLigneEdl } from "@/app/actions/edl";
import { compresserImage } from "@/lib/compresser-image";
import { Button } from "@/components/ui/button";
import { useBaseEspace } from "@/components/racine-espace-contexte";

// AUDIT PALIER 1 DU 22/11/2026, P2-01 — une photo par élément de l'état des lieux.
//
// Ce bloc vit DANS le grand formulaire de la grille : il ne contient donc aucun formulaire, et son champ de fichier n'a
// pas de nom (il n'est jamais envoyé avec la grille). La photo part seule, dès qu'elle est choisie ; la saisie en cours
// de la grille n'est ni envoyée ni perdue. Hors ligne, l'envoi échoue et le dit : une photo ne se garde pas en brouillon.
// Le champ ne force pas l'appareil photo : le téléphone propose de prendre la photo ou d'en choisir une déjà prise
// pendant la visite.
type Props = {
  orgId: string;
  bailId: string;
  edlId: string;
  ligne: { id: string; libelle: string; photo_document_id?: string | null };
  modifiable: boolean;
};

function LienPhoto({ orgId, ligne }: Pick<Props, "orgId" | "ligne">) {
  const base = useBaseEspace(orgId);
  if (!ligne.photo_document_id) return null;
  return (
    <a href={`${base}/documents/${ligne.photo_document_id}/fichier`} target="_blank" rel="noreferrer" className="lien-discret">
      Voir la photo<span className="sr-only"> — {ligne.libelle}</span>
    </a>
  );
}

// État des lieux signé : la photo se consulte seulement. Ce chemin n'utilise ni action ni navigation : la vue signée
// se rend aussi hors de l'application (tests/edl-lecture-pieces.test.ts).
export function PhotoLigneEdl(props: Props) {
  if (props.modifiable) return <PhotoModifiable {...props} />;
  if (!props.ligne.photo_document_id) return null;
  return (
    <span className="flex basis-full flex-wrap items-center gap-2 text-xs" data-photo-ligne="oui">
      <LienPhoto orgId={props.orgId} ligne={props.ligne} />
    </span>
  );
}

function PhotoModifiable({ orgId, bailId, edlId, ligne }: Props) {
  const routeur = useRouter();
  const champ = useRef<HTMLInputElement>(null);
  const [enCours, demarrer] = useTransition();
  const [retour, setRetour] = useState<{ erreur?: string; succes?: string }>({});
  const photo = ligne.photo_document_id ?? null;

  function envoyer(fichier: File) {
    setRetour({});
    demarrer(async () => {
      try {
        // Réduite sur l'appareil : une photo de téléphone dépasse souvent la limite de dépôt.
        const image = await compresserImage(fichier);
        const donnees = new FormData();
        donnees.set("photo", image);
        const r = await joindrePhotoLigneEdl(orgId, bailId, edlId, ligne.id, donnees);
        setRetour(r);
        if (r.succes) routeur.refresh();
      } catch {
        setRetour({ erreur: "La photo n’a pas pu être envoyée. Vérifiez la connexion, puis réessayez." });
      } finally {
        if (champ.current) champ.current.value = "";
      }
    });
  }

  function retirer() {
    setRetour({});
    demarrer(async () => {
      try {
        const r = await retirerPhotoLigneEdl(orgId, bailId, edlId, ligne.id);
        setRetour(r);
        if (r.succes) routeur.refresh();
      } catch {
        setRetour({ erreur: "La photo n’a pas pu être retirée. Vérifiez la connexion, puis réessayez." });
      }
    });
  }

  return (
    <span className="flex basis-full flex-wrap items-center gap-2 text-xs" data-photo-ligne={photo ? "oui" : "non"}>
      <LienPhoto orgId={orgId} ligne={ligne} />
      <input
        ref={champ}
        type="file"
        accept="image/jpeg,image/png"
        hidden
        aria-label={`Photo — ${ligne.libelle}`}
        onChange={(e) => {
          const fichier = e.currentTarget.files?.[0];
          if (fichier) envoyer(fichier);
        }}
      />
      <Button type="button" size="xs" variant="outline" disabled={enCours} onClick={() => champ.current?.click()}>
        {enCours ? "Envoi…" : photo ? "Remplacer la photo" : "Ajouter une photo"}
        <span className="sr-only"> — {ligne.libelle}</span>
      </Button>
      {photo && (
        <Button type="button" size="xs" variant="ghost" disabled={enCours} onClick={retirer}>
          Retirer la photo<span className="sr-only"> — {ligne.libelle}</span>
        </Button>
      )}
      {retour.erreur && <span role="alert" className="text-destructive">{retour.erreur}</span>}
      {retour.succes && <span role="status" className="text-success-soft-foreground">{retour.succes}</span>}
    </span>
  );
}
