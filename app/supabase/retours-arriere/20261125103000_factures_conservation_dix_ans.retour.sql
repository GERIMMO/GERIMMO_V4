-- RETOUR ARRIÈRE de 20261125103000_factures_conservation_dix_ans.sql (textes officiels, lot T4 du 24/11/2026, écart
-- R31-A1 : conservation des factures d'abonnement portée de six à dix ans).
--
-- CE RETOUR NE RACCOURCIT AUCUNE DURÉE ENREGISTRÉE ET NE SUPPRIME RIEN.
--  · Il rend aux trois fonctions leur texte d'avant (plancher de 72 mois ; six ans pour la fiche du client chez le
--    prestataire de paiement), recopié tel quel de 20261024140000, 20261024105901 et 20261024130000.
--  · Il rend au catalogue son plancher de 72 mois pour la règle « archive:facture », mais LAISSE la durée à 120 mois :
--    la réduire redevient possible, à la main, depuis l'écran de conservation, avec un motif. Les archives constituées
--    entre-temps gardent leurs 120 mois.
--  · La valeur par défaut de la colonne revient à 72.
-- À ne jouer que si le texte qui fonde les dix ans (loi n° 2026-534, article 36) s'avère inapplicable : après ce
-- retour, les archives constituées AVANT le lot retrouvent une échéance à six ans. Déployer d'abord le code précédent
-- (la page confidentialité et les conditions annoncent dix ans). Rejouable.
-- À JOUER AVANT le retour de 20261024105901 (réglages de conservation) : ces fonctions lisent et écrivent la colonne
-- `archives_comptes.factures_duree_mois`, que ce retour-là retire ; il refuse d'ailleurs tant qu'une archive porte une
-- autre durée que 72 mois ou qu'une durée du catalogue diffère de sa durée initiale.

update public.retention_rules set minimum_mois = 72, revision = revision + 1
 where data_type = 'archive:facture' and minimum_mois <> 72;

create or replace function public.echeance_facture_archivee(p_facture jsonb, p_fin_dernier_abonnement_paye date, p_mois integer)
returns date
language sql
stable
set search_path = ''
as $$
  select (greatest((p_facture ->> 'emise_le')::date,
                   coalesce((p_facture ->> 'exercice_clos_le')::date, p_fin_dernier_abonnement_paye))
          + make_interval(months => greatest(coalesce(p_mois, 72), 72)))::date;
$$;
revoke all on function public.echeance_facture_archivee(jsonb, date, integer) from public, anon, authenticated;
grant execute on function public.echeance_facture_archivee(jsonb, date, integer) to service_role;

alter table public.archives_comptes alter column factures_duree_mois set default 72;
create or replace function public.archives_comptes_echeances()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_mois integer;
begin
  if exists (select 1 from jsonb_array_elements(new.factures) e
              where jsonb_typeof(e) <> 'object' or coalesce(e ->> 'emise_le', '') !~ '^\d{4}-\d{2}-\d{2}$'
                 or (e ? 'exercice_clos_le' and coalesce(e ->> 'exercice_clos_le', '') !~ '^\d{4}-\d{2}-\d{2}$')) then
    raise exception 'Chaque facture archivée porte sa date d''émission (emise_le, AAAA-MM-JJ) et, le cas échéant, la fin de son exercice (exercice_clos_le, AAAA-MM-JJ)' using errcode = '22023';
  end if;
  select r.duree_mois into v_mois from public.retention_rules r where r.data_type = 'archive:facture';
  new.archive_le := now();
  new.factures_duree_mois := greatest(72, coalesce(v_mois, 72));
  -- Preuve d'un contrat conclu par voie électronique : dix ans (code de la consommation, L. 213-1, D. 213-1 et
  -- D. 213-2), comptés de la fin du dernier abonnement payé (plan du 23/10, choix 5 ; décision du 23/10).
  -- À relire par le juriste (source non ouverte le 23/10/2026).
  new.preuve_conservee_jusqu_au := (new.fin_dernier_abonnement_paye + make_interval(months => greatest(120, coalesce((select duree_mois from public.retention_rules where data_type = 'archive:preuve_contrat'), 120))))::date;
  -- Factures : voir echeance_facture_archivee (six ans, livre des procédures fiscales, L. 102 B ; éditeur non
  -- commerçant, décision du 23/10). Échéance de la dernière ; chacune se retire à la sienne.
  new.factures_conservees_jusqu_au := (select max(public.echeance_facture_archivee(e, new.fin_dernier_abonnement_paye, v_mois))
                                         from jsonb_array_elements(new.factures) e);
  new.factures_purgees_le := null;
  return new;
end $$;
revoke execute on function public.archives_comptes_echeances() from public, anon, authenticated;

create or replace function public.clients_stripe_au_terme(p_limite integer default 50)
returns table (stripe_customer_id text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_jour date := (now() at time zone 'Europe/Paris')::date;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Accès réservé au traitement' using errcode = '42501';
  end if;
  return query
    select a.stripe_customer_id
      from public.archives_comptes a
     where a.stripe_customer_id is not null
       and not exists (select 1 from public.clients_stripe_supprimes s where s.stripe_customer_id = a.stripe_customer_id)
       and not exists (select 1 from public.abonnements b where b.stripe_customer_id = a.stripe_customer_id)
     group by a.stripe_customer_id
    having max(greatest(coalesce(a.factures_conservees_jusqu_au, (a.archive_le at time zone 'Europe/Paris')::date),
                        (a.fin_dernier_abonnement_paye + interval '6 years')::date)) < v_jour
     order by 1
     limit greatest(1, least(coalesce(p_limite, 50), 500));
end $$;
revoke all on function public.clients_stripe_au_terme(integer) from public, anon, authenticated;
grant execute on function public.clients_stripe_au_terme(integer) to service_role;

comment on table public.clients_stripe_supprimes is
  'Clients Stripe supprimés au terme de la conservation des factures (six ans, LPF L. 102 B ; éditeur non commerçant, décision du 23/10/2026). Relecture du 24/10.';

select public.fermer_fonctions_a_anon();

-- Registre des migrations (essai de publication « retours » du 25/11/2026, constat RET-01) : la version est retirée
-- en DERNIER, une fois tout le reste joué. Avec `psql -v ON_ERROR_STOP=1 -f`, une erreur plus haut arrête le fichier
-- avant ce bloc : la version reste, et le chantier « Migrations Supabase » ne rejoue pas une migration à moitié
-- défaite. Sans ce bloc, ce chantier refuserait de rejouer la migration (« version déjà enregistrée »).
do $registre$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261125103000';
  end if;
end $registre$;
