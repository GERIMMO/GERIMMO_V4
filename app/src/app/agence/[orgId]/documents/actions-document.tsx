import { buttonVariants } from "@/components/ui/button";

// Consultation / téléchargement : la route /fichier revérifie les droits,
// trace l'accès et sert le fichier — l'URL reste applicative et stable,
// le lien signé Supabase ne sort jamais du serveur.
export function ActionsDocument({
  orgId,
  documentId,
}: {
  orgId: string;
  documentId: string;
}) {
  const base = `/agence/${orgId}/documents/${documentId}/fichier`;
  return (
    <div className="flex items-center gap-2">
      <a
        href={base}
        target="_blank"
        rel="noopener"
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        Consulter
      </a>
      {/* Nouvel onglet : il se referme dès que le téléchargement démarre,
          et affiche la page d'erreur en français si l'accès est refusé */}
      <a
        href={`${base}?mode=telechargement`}
        target="_blank"
        rel="noopener"
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        Télécharger
      </a>
    </div>
  );
}
