-- Revenir au code précédent avant ce retour. Le journal et ses références sont conservés.
do $retour_arriere$
begin
  if statement_timestamp() <> transaction_timestamp() then
    raise exception 'Retour arrière refusé : ce script gère sa propre transaction.';
  end if;
end $retour_arriere$;
begin;
set local lock_timeout = '10s';
do $$ begin
  if exists(select 1 from public.abonnement_evenements where traite_le is null and charge is not null) then
    raise exception 'Retour refusé : des réceptions durables restent à traiter';
  end if;
end; $$;
drop function if exists public.stripe_evenement_lecture_differee(text,boolean);
drop function if exists public.stripe_evenement_appliquer(text,uuid,text,jsonb);
drop function if exists public.stripe_evenement_finir(text,uuid,boolean,text);
drop function if exists public.stripe_evenement_prendre(text,text,jsonb,uuid);
drop function if exists public.stripe_controles_a_faire(integer);
drop function if exists public.stripe_controle_enregistrer(uuid,text[]);
drop function if exists public.supervision_stripe_controles();
drop index if exists public.abonnement_evenements_reprise;
-- Les dates et résultats de contrôle sont conservés pour l'historique.
alter table public.abonnement_evenements drop column if exists verrou_jeton,drop column if exists verrou_jusqua,
  drop column if exists tentatives,drop column if exists reprendre_apres,drop column if exists avis_debut_le,drop column if exists avis_a_verifier;
delete from supabase_migrations.schema_migrations where version='20261020020000';
commit;
