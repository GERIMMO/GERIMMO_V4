-- ══════════════════════════════════════════════════════════════════════════
-- Le PDF d'un devis se dépose même sans mission en cours (audit du 27/09)
-- ══════════════════════════════════════════════════════════════════════════
--
-- LE DÉFAUT. La politique storage `ged_insert_artisan` n'ouvrait l'écriture
-- sous `<organization_id>/…` qu'aux organisations de `orgs_de_mes_missions()`
-- (missions acceptée, planifiée ou en cours). Or une demande de devis n'est
-- pas une mission : pour une agence nouvelle, ou une fois ses missions
-- terminées, joindre le PDF du devis échouait (« new row violates row-level
-- security policy », preuve aap-st2.sql). Le banc ne le montrait pas, parce
-- que l'artisan de démonstration avait justement une mission acceptée.
--
-- LA CORRECTION. Une seconde source d'organisations : celles où l'artisan a
-- une sollicitation qui ATTEND son devis (`envoyee`). Rien de plus large :
-- une demande déclinée, expirée ou déjà chiffrée ne rouvre pas l'écriture.
-- `deposer_devis` revérifie de toute façon le préfixe et l'état.
--
-- Rejouable : `create or replace` et `drop policy if exists`.

create or replace function public.orgs_de_mes_sollicitations_ouvertes()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct s.organization_id
  from public.incident_sollicitations s
  where s.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
    and s.statut = 'envoyee';
$$;

revoke execute on function public.orgs_de_mes_sollicitations_ouvertes() from public, anon;
grant execute on function public.orgs_de_mes_sollicitations_ouvertes() to authenticated;

drop policy if exists ged_insert_artisan on storage.objects;
create policy ged_insert_artisan on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (
      (storage.foldername(name))[1] in (select o::text from public.orgs_de_mes_missions() o)
      or (storage.foldername(name))[1] in (select o::text from public.orgs_de_mes_sollicitations_ouvertes() o)
      or (public.mon_artisan_id() is not null
          and name like 'artisans/' || public.mon_artisan_id()::text || '/%')
    )
  );

select public.fermer_fonctions_a_anon();
