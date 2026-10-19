-- RETOUR ARRIÈRE de 20261019121000_droits_anon_contact_articles_et_prospects.sql
-- Rétablit la lecture de la table entière des articles et des demandes de contact par anon (état antérieur, y compris
-- le droit sans usage sur demandes_devis), les clés étrangères sans action référentielle, l'obligation d'auteur sur
-- supervision_prospects et supervision_registre, le déclencheur d'origine (20261018061548), et retire sa seule ligne
-- d'historique. Refuse sans rien modifier si une ligne porte déjà un auteur nul (trace système ou compte supprimé) :
-- la décider (compléter ou supprimer) avant de rejouer. Aucune donnée touchée sinon.
do $retour_arriere$
begin
  if statement_timestamp() <> transaction_timestamp() then
    raise exception 'Retour arrière refusé : ce script gère sa propre transaction et ne doit pas être joué dans un lot (migrations.yml, psql --single-transaction, begin;). Voir LISEZ-MOI.md.';
  end if;
end $retour_arriere$;
begin;
set local lock_timeout = '10s';
do $retour_arriere$
begin
  if exists (select 1 from public.supervision_prospects where auteur is null)
     or exists (select 1 from public.supervision_registre where auteur is null) then
    raise exception 'Retour arrière refusé : des lignes de supervision_prospects ou supervision_registre ont un auteur nul (traces système, compte supprimé) ; les compléter ou les supprimer avant de rétablir l''obligation d''auteur.';
  end if;
end $retour_arriere$;

revoke select (id, slug, titre, chapo, corps, publie_le, updated_at, seo_description, sources, veine, facebook_image_url, statut)
  on table public.publications from anon;
grant select on table public.publications to anon;
grant select on table public.demandes_devis to anon;

alter table public.supervision_prospects drop constraint if exists supervision_prospects_demande_id_fkey;
alter table public.supervision_prospects add constraint supervision_prospects_demande_id_fkey
  foreign key (demande_id) references public.demandes_devis(id);
alter table public.supervision_prospects drop constraint if exists supervision_prospects_responsable_fkey;
alter table public.supervision_prospects add constraint supervision_prospects_responsable_fkey
  foreign key (responsable) references public.accounts(id);
alter table public.supervision_prospects drop constraint if exists supervision_prospects_auteur_fkey;
alter table public.supervision_prospects add constraint supervision_prospects_auteur_fkey
  foreign key (auteur) references public.accounts(id);
alter table public.supervision_registre drop constraint if exists supervision_registre_auteur_fkey;
alter table public.supervision_registre add constraint supervision_registre_auteur_fkey
  foreign key (auteur) references public.accounts(id);
alter table public.supervision_prospects alter column auteur set not null;
alter table public.supervision_registre alter column auteur set not null;

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
commit;
