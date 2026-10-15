// `@/app/actions/parc` est un fichier d'actions serveur (base de données, session) : il n'existe pas dans le navigateur
// du banc. Le formulaire de diagnostic ne l'appelle que par défaut, quand aucune action n'est passée en propriété ; le
// banc passe la sienne (`actionDepot`), cette version neutre ne sert donc qu'à satisfaire l'import.
export async function deposerDiagnostic(): Promise<Record<string, never>> {
  return {};
}
