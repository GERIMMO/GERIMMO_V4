import { serialiserDonnees, type DonneeStructuree } from "@/lib/donnees-structurees";

/**
 * Les données structurées d'une page publique (schema.org, JSON-LD), lues par les moteurs de recherche
 * (lib/donnees-structurees.ts). Un bloc de données, jamais exécuté par le navigateur : la politique de sécurité
 * du site n'a pas à l'autoriser. Rendu côté serveur, sans rien envoyer au navigateur d'autre que ce texte.
 */
export function DonneesStructurees({ donnees }: { donnees: DonneeStructuree | DonneeStructuree[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serialiserDonnees(donnees) }} />;
}
