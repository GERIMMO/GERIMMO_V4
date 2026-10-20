-- Instruction atomique ; participe à une transaction externe sans la valider.
do $retour_atomique$
begin
 execute $instructions_retour$
-- RETOUR ARRIÈRE de 20261019121000_droits_anon_contact_articles_et_prospects.sql
-- Rétablit la lecture de la table entière des articles et des demandes de contact par anon (état antérieur, y compris
-- le droit sans usage sur demandes_devis), la clé `supervision_prospects.demande_id → demandes_devis` sans action
-- référentielle et le déclencheur d'origine (20261018061548) ; retire sa seule ligne d'historique. Les clés vers les
-- comptes et l'obligation d'auteur n'ont pas bougé (décision Q2 du 19/10) et le chemin « système » du déclencheur
-- n'écrit rien au registre : aucune ligne sans auteur n'existe jamais, ce retour est toujours jouable. Aucune donnée touchée.

set local lock_timeout = '10s';

revoke select (id, slug, titre, chapo, corps, publie_le, updated_at, seo_description, sources, veine, facebook_image_url, statut)
  on table public.publications from anon;
grant select on table public.publications to anon;
grant select on table public.demandes_devis to anon;

alter table public.supervision_prospects drop constraint if exists supervision_prospects_demande_id_fkey;
alter table public.supervision_prospects add constraint supervision_prospects_demande_id_fkey
  foreign key (demande_id) references public.demandes_devis(id);

create or replace function public.supervision_tracer_modification() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.revision<>old.revision+1 then raise exception 'Version périmée : rechargez avant de modifier';end if;
  new.modifie_le:=now();
 end if;
 if tg_table_name='supervision_identite' then new.modifie_par:=(select auth.uid());end if;
 insert into public.supervision_registre(objet,objet_id,avant,apres)
 values(tg_table_name,coalesce(to_jsonb(new)->>'id','identite'),case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return new;
end $$;
revoke all on function public.supervision_tracer_modification() from public,anon,authenticated;

do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261019121000';
  end if;
end $retour_arriere$;
$instructions_retour$;
end $retour_atomique$;
