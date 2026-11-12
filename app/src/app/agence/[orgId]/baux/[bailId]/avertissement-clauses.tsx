export function AvertissementClauses({ id }: { id: string }) {
  return (
    <p id={id} className="text-xs text-muted-foreground">
      Les frais de relance et d’envoi des quittances restent à la charge du bailleur.
      Le bail ne peut imposer le prélèvement automatique ni prévoir de pénalité en cas de manquement du locataire.{" "}
      <a className="underline" href="https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000047900082" target="_blank" rel="noreferrer">
        Consulter les clauses interdites (article 4)
      </a>
    </p>
  );
}
