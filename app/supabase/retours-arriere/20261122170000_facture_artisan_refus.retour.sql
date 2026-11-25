-- RETOUR ARRIÈRE de 20261122170000_facture_artisan_refus.sql (audit palier 1, P1-03).
--
-- Supprime la fonction de refus et rend aux cinq fonctions retouchées leur forme d'avant (remplacement exact inverse ;
-- forme inattendue = arrêt sans rien changer). RIEN N'EST EFFACÉ : les factures refusées restent refusées, avec leur
-- date, leur auteur et leur motif (les trois colonnes et leurs deux contraintes sont conservées) ; elles ne peuvent
-- donc toujours pas être validées par erreur.
--
-- CE QUE CE RETOUR NE PEUT PAS DÉFAIRE, ET CE QU'IL FAIT ALORS :
--   · si une intervention porte déjà deux factures (une refusée et sa remplaçante), l'ancienne unicité stricte ne peut
--     pas être rétablie : l'unicité « une facture en vigueur » est gardée, et le retour le dit (NOTICE) ;
--   · le type d'événement « facture_refusee » n'est retiré de la liste fermée que si aucun dossier ne le porte.
-- APRÈS CE RETOUR, une intervention dont la seule facture est refusée ne peut plus en recevoir d'autre (le dépôt
-- redevient fermé dès qu'une facture existe) : c'était l'état d'avant la migration, sans issue. À ne jouer qu'en
-- connaissance de cause.
--
-- À JOUER APRÈS le retour du code de l'application à la version précédente. Rejouable.
do $retour$
declare
  r record;
  d text;
  n integer;
  v_def text;
begin
  for r in select * from (values
    ('public.valider_facture_artisan(uuid,uuid,text)',
     $a$  if f.validee_le is not null then return; end if;
  if f.refusee_le is not null then raise exception 'Cette facture a été refusée : l’artisan doit en déposer une nouvelle'; end if;$a$,
     $b$  if f.validee_le is not null then return; end if;$b$),
    ('public.deposer_facture_artisan(uuid,text,bigint,text,text,text,bigint,text)',
     $a$  if exists (select 1 from public.intervention_factures f where f.intervention_id = p_intervention and f.refusee_le is null) then$a$,
     $b$  if exists (select 1 from public.intervention_factures f where f.intervention_id = p_intervention) then$b$),
    ('public.dossiers_de_mes_factures_a_deposer()',
     $a$    and not exists (select 1 from public.intervention_factures f where f.intervention_id = i.id and f.refusee_le is null);$a$,
     $b$    and not exists (select 1 from public.intervention_factures f where f.intervention_id = i.id);$b$),
    ('public.mon_agenda_artisan(timestamp with time zone,timestamp with time zone)',
     $a$    exists (select 1 from public.intervention_factures f where f.intervention_id = i.id and f.refusee_le is null)$a$,
     $b$    exists (select 1 from public.intervention_factures f where f.intervention_id = i.id)$b$),
    ('public.garder_alerte_facture_ouverte()',
     $a$      and f.organization_id=old.organization_id and f.validee_le is null and f.refusee_le is null) then$a$,
     $b$      and f.organization_id=old.organization_id and f.validee_le is null) then$b$)
  ) as t(fonction, retouche, origine) loop
    if to_regprocedure(r.fonction) is null then continue; end if;
    select pg_get_functiondef(r.fonction::regprocedure) into d;
    n := (length(d) - length(replace(d, r.retouche, ''))) / length(r.retouche);
    if n = 0 then continue; end if;                       -- déjà rendue à sa forme d'avant
    if n <> 1 then
      raise exception 'Retour P1-03 : % — forme inattendue (% occurrence(s))', r.fonction, n;
    end if;
    execute replace(d, r.retouche, r.origine);
  end loop;

  drop function if exists public.refuser_facture_artisan(uuid, uuid, text);

  -- L'unicité stricte ne revient que si elle est encore vraie.
  if not exists (select 1 from pg_constraint where conrelid = 'public.intervention_factures'::regclass
                  and conname = 'intervention_factures_intervention_id_key') then
    if exists (select 1 from public.intervention_factures group by intervention_id having count(*) > 1) then
      raise notice 'Retour P1-03 : des interventions portent plusieurs factures (refusée et remplaçante) ; l''unicité « une facture en vigueur » est conservée.';
    else
      alter table public.intervention_factures add constraint intervention_factures_intervention_id_key unique (intervention_id);
      drop index if exists public.intervention_factures_une_en_vigueur;
    end if;
  end if;

  -- Le type d'événement ne quitte la liste fermée que si aucun dossier ne le porte.
  if not exists (select 1 from public.incident_evenements where type = 'facture_refusee') then
    select pg_get_constraintdef(c.oid) into v_def
      from pg_constraint c
     where c.conrelid = 'public.incident_evenements'::regclass and c.conname = 'incident_evenements_type_check';
    if v_def is not null and position(', ''facture_refusee''::text' in v_def) > 0 then
      v_def := replace(v_def, ', ''facture_refusee''::text', '');
      alter table public.incident_evenements drop constraint incident_evenements_type_check;
      execute 'alter table public.incident_evenements add constraint incident_evenements_type_check ' || v_def;
    end if;
  end if;

  delete from supabase_migrations.schema_migrations where version = '20261122170000';
end $retour$;
notify pgrst, 'reload schema';
