-- Textes officiels, lot T4 (24/11/2026), écart R31-A1 — les factures d'abonnement se gardent DIX ans, et non plus six.
--
-- LE TEXTE. Recueil fourni par le dirigeant le 24/11/2026 (source et version déclarées, non recontrôlé par nous) :
-- loi n° 2026-534 du 25 juin 2026, article 36. À l'article L. 102 B du livre des procédures fiscales, les mots
-- « doivent être conservés pendant un délai de six » sont remplacés par « sont conservés pendant un délai de dix ».
-- « Le présent article s'applique aux documents et aux pièces dont le délai de conservation expire après le
-- 1er janvier 2027. » Aucune facture de Gerimmo n'atteint six ans avant cette date : toutes sont concernées.
--
-- CE QUE LA BASE FAISAIT. Une seule fonction donne l'échéance d'une facture archivée, `echeance_facture_archivee` ;
-- son plancher était de 72 mois. La purge des archives de comptes fermés, la garde des archives et la liste des
-- suppressions à faire la lisent toutes. `clients_stripe_au_terme` faisait supprimer la fiche du client chez le
-- prestataire de paiement — et ses factures avec elle — six ans après la fin du dernier abonnement payé.
-- Rien n'a pu être supprimé à ce titre à ce jour (aucune facture n'a six ans) ; la règle programmée était devenue fausse.
--
-- LA CORRECTION (on allonge, on ne raccourcit rien, on ne supprime rien) :
--  1. catalogue des durées : la règle « archive:facture » passe à 120 mois, plancher 120 (le réglage du superadmin ne
--     peut plus descendre dessous) ; une ligne au journal des durées dit le changement (relecture T4R-10) ;
--  2. `echeance_facture_archivee` : plancher de 120 mois, pour TOUTES les archives, y compris celles déjà constituées
--     avec 72 mois (elles ne sont pas réécrites : une archive ne se modifie pas) ;
--  3. `archives_comptes_echeances` : une nouvelle archive enregistre 120 mois au moins ; valeur par défaut de la colonne ;
--  4. `clients_stripe_au_terme` : dix ans après la fin du dernier abonnement payé, et jamais avant l'échéance RECALCULÉE
--     de la dernière facture encore archivée (la date enregistrée sur une ancienne archive peut dater d'avant ce lot).
-- Textes des fonctions : ceux de 20261024140000, 20261024105901 et 20261024130000, recopiés avec ces seuls changements,
-- marqués « lot T4 ». Droits inchangés, aucun droit ouvert, aucune règle d'accès modifiée.
--
-- Rejouable. Retour arrière : supabase/retours-arriere/20261125103000_factures_conservation_dix_ans.retour.sql
-- À SAVOIR : rejouer SEULE l'une des trois anciennes migrations citées remet l'ancien texte ; rejouer ensuite celle-ci.

-- 1. Le catalogue. La révision avance pour qu'un formulaire de réglage resté ouvert soit rechargé.
-- Seconde reprise du 24/11/2026 (relecture T4R-10) : l'écran des durées de conservation (/admin/conservation) tire son
-- historique du journal (action « conservation_regle_modifiee ») et affirme, quand il est vide, qu'aucune durée n'a
-- changé depuis la publication. Le passage à 120 mois y laisse donc une ligne, écrite ICI parce que seule cette
-- instruction connaît l'ancienne durée. Sans auteur (changement fait par la mise à jour, pas par une personne). Aucune
-- ligne si la durée ne change pas (rejeu, ou durée déjà réglée à 120 mois et plus).
with avant as (
  select r.id, r.data_type, r.libelle, r.duree_mois, r.actif
    from public.retention_rules r
   where r.data_type = 'archive:facture'
     and (r.duree_mois < 120 or r.duree_initiale_mois < 120 or r.minimum_mois < 120)
     for update
), apres as (
  update public.retention_rules r
     set duree_mois = greatest(r.duree_mois, 120),
         duree_initiale_mois = greatest(r.duree_initiale_mois, 120),
         minimum_mois = 120,
         revision = r.revision + 1
    from avant
   where r.id = avant.id
  returning r.id, r.duree_mois
)
insert into public.audit_log (action, details)
select 'conservation_regle_modifiee', jsonb_build_object(
         'categorie', avant.data_type, 'libelle', avant.libelle, 'ancienne_duree_mois', avant.duree_mois,
         'nouvelle_duree_mois', apres.duree_mois, 'actif', avant.actif,
         'motif', 'Mise à jour de Gerimmo du 24/11/2026, sans intervention d''une personne : factures d''abonnement conservées dix ans (livre des procédures fiscales, article L. 102 B, modifié par l''article 36 de la loi n° 2026-534 du 25 juin 2026). La durée ne peut plus être réglée en dessous de 120 mois.')
  from avant join apres on apres.id = avant.id
 where apres.duree_mois <> avant.duree_mois;

-- 2. L'échéance d'une facture archivée : dix ans après la fin de son exercice (`exercice_clos_le`, quand l'archive le
-- porte) ou, à défaut, après la fin du dernier abonnement payé, jamais moins de dix ans après son émission.
create or replace function public.echeance_facture_archivee(p_facture jsonb, p_fin_dernier_abonnement_paye date, p_mois integer)
returns date
language sql
stable
set search_path = ''
as $$
  select (greatest((p_facture ->> 'emise_le')::date,
                   coalesce((p_facture ->> 'exercice_clos_le')::date, p_fin_dernier_abonnement_paye))
          + make_interval(months => greatest(coalesce(p_mois, 120), 120)))::date;  -- lot T4 : 120 mois au lieu de 72
$$;
revoke all on function public.echeance_facture_archivee(jsonb, date, integer) from public, anon, authenticated;
grant execute on function public.echeance_facture_archivee(jsonb, date, integer) to service_role;

-- 3. Une nouvelle archive enregistre la durée appliquée à ses factures : 120 mois au moins.
alter table public.archives_comptes alter column factures_duree_mois set default 120;
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
  new.factures_duree_mois := greatest(120, coalesce(v_mois, 120));  -- lot T4 : 120 mois au lieu de 72
  -- Preuve d'un contrat conclu par voie électronique : dix ans (code de la consommation, L. 213-1, D. 213-1 et
  -- D. 213-2), comptés de la fin du dernier abonnement payé (plan du 23/10, choix 5 ; décision du 23/10).
  -- À relire par le juriste (source non ouverte le 23/10/2026).
  new.preuve_conservee_jusqu_au := (new.fin_dernier_abonnement_paye + make_interval(months => greatest(120, coalesce((select duree_mois from public.retention_rules where data_type = 'archive:preuve_contrat'), 120))))::date;
  -- Factures : voir echeance_facture_archivee (dix ans, livre des procédures fiscales, L. 102 B, modifié par
  -- l'article 36 de la loi n° 2026-534). Échéance de la dernière ; chacune se retire à la sienne.
  new.factures_conservees_jusqu_au := (select max(public.echeance_facture_archivee(e, new.fin_dernier_abonnement_paye, v_mois))
                                         from jsonb_array_elements(new.factures) e);
  new.factures_purgees_le := null;
  return new;
end $$;
revoke execute on function public.archives_comptes_echeances() from public, anon, authenticated;

-- 4. Les clients à supprimer chez le prestataire de paiement, avec leurs factures : jamais avant dix ans après la fin
-- du dernier abonnement payé, ni avant l'échéance recalculée de la dernière facture encore archivée.
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
      -- lot T4 : l'échéance des factures encore archivées, recalculée avec le plancher de dix ans.
      left join lateral (select max(public.echeance_facture_archivee(e, a.fin_dernier_abonnement_paye, a.factures_duree_mois)) as echeance
                           from jsonb_array_elements(a.factures) e) f on true
     where a.stripe_customer_id is not null
       and not exists (select 1 from public.clients_stripe_supprimes s where s.stripe_customer_id = a.stripe_customer_id)
       and not exists (select 1 from public.abonnements b where b.stripe_customer_id = a.stripe_customer_id)
     group by a.stripe_customer_id
    having max(greatest(coalesce(f.echeance, a.factures_conservees_jusqu_au, (a.archive_le at time zone 'Europe/Paris')::date),
                        (a.fin_dernier_abonnement_paye + interval '10 years')::date)) < v_jour  -- lot T4 : dix ans au lieu de six
     order by 1
     limit greatest(1, least(coalesce(p_limite, 50), 500));
end $$;
revoke all on function public.clients_stripe_au_terme(integer) from public, anon, authenticated;
grant execute on function public.clients_stripe_au_terme(integer) to service_role;

comment on table public.clients_stripe_supprimes is
  'Clients Stripe supprimés au terme de la conservation des factures (dix ans, LPF L. 102 B modifié par l''article 36 de la loi n° 2026-534 ; lot T4 du 24/11/2026).';

select public.fermer_fonctions_a_anon();
