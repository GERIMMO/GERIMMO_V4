-- RETOUR ARRIÈRE de 20261119200000 (SCI-2). À jouer APRÈS celui de 20261119200100. Rétablit l'unicité stricte de
-- l'adresse e-mail par espace. Refusé dès qu'une société et une personne physique vivantes d'un même espace partagent une
-- adresse (cas que la migration a rendu possible, et que toute SCI ouverte depuis produit) : conserver alors l'index par
-- nature et corriger en avant ; aucune fiche n'est modifiée ni archivée par ce retour. Remettre aussi le code d'avant
-- (app/actions/personnes.ts et parc.ts : contrôle d'unicité toutes natures confondues).
do $retour$
begin
  if strpos(pg_get_functiondef('public.initialiser_espace_proprietaire()'::regprocedure),
            'case when v_societe is null then v_prenom end, v_email, v_telephone,') > 0 then
    raise exception 'Retour refusé : jouer d''abord le retour de 20261119200100 (la fiche de la société reçoit encore l''e-mail du compte).';
  end if;
  if exists (
    select 1 from public.persons p
     where p.email is not null and p.archived_at is null
     group by p.organization_id, lower(p.email)
    having count(*) > 1
  ) then
    raise exception 'Retour refusé : des fiches vivantes d''un même espace partagent une adresse e-mail. Conserver l''index par nature et corriger en avant.';
  end if;
  create unique index if not exists persons_email_unique_par_agence
    on public.persons (organization_id, lower(email))
    where email is not null and archived_at is null;
  drop index if exists public.persons_email_unique_par_agence_et_nature;
  delete from supabase_migrations.schema_migrations where version = '20261119200000';
end $retour$;
