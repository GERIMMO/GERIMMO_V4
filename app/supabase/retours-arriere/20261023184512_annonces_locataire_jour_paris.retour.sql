-- Retour de 20261023184512 (relecture adverse du 23/10) : rend à `mes_annonces_locataire` son texte de 20260905120000,
-- qui compare `visible_jusquau` au jour de la session (`current_date`, UTC en production). Effet : de minuit à 1 h ou
-- 2 h à Paris, le locataire lit de nouveau une annonce échue la veille, que la fiche agence ne montre plus. Aucune
-- donnée, aucun droit modifié ; aucun code à remettre avant (la page locataire lit la fonction telle quelle). Une seule
-- instruction DO atomique : seule en autocommit, ou intégralement annulable dans une transaction externe, qu'elle ne
-- valide jamais. Dans la chaîne « Ordre complet » du LISEZ-MOI, avant le retour de 20261014500000 (la migration cite
-- `aujourdhui_paris()`).
do $retour_atomique$
begin
  perform set_config('lock_timeout', '10s', true);

  create or replace function public.mes_annonces_locataire(p_org uuid)
  returns table (id uuid, texte text, visible_jusquau date)
  language sql stable security definer set search_path = '' as $fonction$
  select a.id, a.texte, a.visible_jusquau
  from public.annonces a
  where a.organization_id = p_org
    and a.visible_jusquau >= current_date
    and (a.bien_id is null or a.bien_id in (
      select l.bien_id from public.baux b
      join public.lots l on l.id = b.lot_id
      where b.organization_id = p_org and b.etat in ('actif', 'preavis')
        and exists (
          select 1 from public.persons p
          where p.organization_id = p_org and p.account_id = (select auth.uid())
            and (p.id = b.locataire_principal
                 or exists (select 1 from public.bail_personnes bp
                            where bp.bail_id = b.id and bp.person_id = p.id
                              and bp.role = 'colocataire')))))
    and public.ma_personne_locataire(p_org) is not null
  order by a.visible_jusquau;
$fonction$;
  revoke execute on function public.mes_annonces_locataire(uuid) from public, anon;

  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261023184512';
  end if;
end;
$retour_atomique$;
