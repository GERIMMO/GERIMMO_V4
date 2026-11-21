-- UN BAIL REPRIS EN COURS NE RÉCLAME PAS LES LOYERS D'AVANT SON ARRIVÉE SUR GERIMMO (date de bascule, 20/11/2026).
--
-- LE DÉFAUT CONSTATÉ. La décision B du 20/11/2026 (20261120190000) laisse un propriétaire activer le bail d'un
-- locataire déjà en place. Or l'échéancier partait toujours de la date d'entrée : rejoué sur le banc, un bail entré le
-- 01/11/2024 à 750 € recevait, au premier « Générer l'échéancier » ou au cycle du 1er du mois, 25 termes d'un coup —
-- 18 750 € affichés « impayés », une alerte d'impayé, et autant de relances possibles si le bailleur les a
-- automatisées. Rien de tout cela n'est vrai : ces loyers ont été payés avant Gerimmo.
--
-- LA RÈGLE. À l'activation d'un bail dont le mois d'entrée est ANTÉRIEUR au mois en cours (jour de Paris), Gerimmo
-- note le mois en cours comme premier mois suivi (`baux.loyers_suivis_depuis`) ; l'échéancier n'appelle que les
-- termes à partir de ce mois. C'est la « date de bascule » des maquettes de reprise de portefeuille, ramenée au bail.
--
-- CE QUI NE CHANGE PAS.
--   · Un bail activé le mois de son entrée, ou avant : `loyers_suivis_depuis` reste vide, l'échéancier part de
--     l'entrée, prorata compris — comme avant.
--   · Les baux déjà actifs : aucun n'est touché (colonne vide). En production au 20/11/2026 : aucun bail actif.
--   · Le calcul d'un terme (prorata d'entrée et de sortie, échéance, terme échu) : inchangé. Le premier terme suivi
--     d'un bail repris est un mois plein, puisque le locataire y était déjà.
--   · `activer_bail`, `cycle_mensuel_interne`, `generer_appels_loyer` : inchangées. Le cycle du 1er du mois passe par
--     le même générateur : il suit donc la même règle.
--
-- CE QUE LA RÈGLE NE FAIT PAS. Elle ne reprend aucune dette d'avant Gerimmo : un arriéré antérieur au premier mois
-- suivi n'existe pas dans l'outil (les soldes d'ouverture relèvent du chantier « reprise de portefeuille »).
--
-- SA CONTREPARTIE : LA RÉGULARISATION DES CHARGES. Elle compare les charges réelles de l'exercice, au prorata des jours
-- d'occupation, aux provisions APPELÉES dans Gerimmo (`provisions_charges_annee`). Pour un exercice commencé avant le
-- premier mois suivi, les provisions versées avant n'y sont pas : le calcul mettrait à la charge du locataire des
-- sommes qu'il a déjà payées. Un tel exercice ne se régularise donc pas ici (geste 5) ; le premier exercice
-- régularisable est celui de la bascule si elle tombe en janvier, le suivant sinon.
--
-- CINQ GESTES, rejouables :
--   1. `baux.loyers_suivis_depuis` : le premier mois suivi, toujours un 1er du mois.
--   2. `premier_mois_suivi(date)` : la règle, en un seul endroit.
--   3. Le déclencheur `baux_loyers_suivis_depuis` : pose la valeur au passage « brouillon → actif », d'où qu'il vienne.
--   4. `generer_appels_loyer_interne` : part du premier mois suivi quand il existe.
--   5. Le déclencheur `regularisations_avant_bascule` : refuse la régularisation d'un exercice commencé avant.
--
-- RETOUR ARRIÈRE : supabase/retours-arriere/20261120200000_loyers_suivis_depuis.retour.sql

-- 1. Le premier mois dont Gerimmo suit le loyer. Vide = depuis l'entrée du locataire.
alter table public.baux add column if not exists loyers_suivis_depuis date;

comment on column public.baux.loyers_suivis_depuis is
  'Date de bascule (20/11/2026) : premier mois dont Gerimmo appelle le loyer, pour un bail repris en cours. Toujours un 1er du mois. Vide : l''échéancier part de la date d''entrée. Posée à l''activation, jamais par un client.';

do $contrainte$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.baux'::regclass and conname = 'baux_loyers_suivis_depuis_premier_du_mois'
  ) then
    alter table public.baux add constraint baux_loyers_suivis_depuis_premier_du_mois
      check (loyers_suivis_depuis is null or extract(day from loyers_suivis_depuis) = 1);
  end if;
end $contrainte$;

-- 2. La règle : le mois en cours, pour un bail dont le mois d'entrée est déjà passé ; rien sinon.
create or replace function public.premier_mois_suivi(p_date_debut date)
returns date
language sql
stable
set search_path = ''
as $$
  select case
    when p_date_debut is not null
     and date_trunc('month', p_date_debut::timestamp)::date < date_trunc('month', public.aujourdhui_paris()::timestamp)::date
    then date_trunc('month', public.aujourdhui_paris()::timestamp)::date
  end
$$;

comment on function public.premier_mois_suivi(date) is
  'Date de bascule (20/11/2026) : pour un bail activé aujourd''hui, le premier mois dont Gerimmo suivra le loyer — le mois en cours si le mois d''entrée est déjà passé (jour de Paris), rien sinon (l''échéancier part alors de l''entrée).';

revoke all on function public.premier_mois_suivi(date) from public, anon;
grant execute on function public.premier_mois_suivi(date) to authenticated, service_role;

-- 3. La valeur se pose au passage « brouillon → actif », quel que soit le geste qui active (dépôt du contrat signé
--    aujourd'hui, signature en ligne demain). Recalculée à chaque activation : « Corriger » ne ramène un bail en
--    brouillon que s'il n'a ni terme appelé ni encaissement (`devalider_bail`), donc rien ne dépend de l'ancienne valeur.
create or replace function public.poser_loyers_suivis_depuis()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.etat = 'brouillon'::public.bail_etat and new.etat = 'actif'::public.bail_etat then
    new.loyers_suivis_depuis := public.premier_mois_suivi(new.date_debut);
  end if;
  return new;
end;
$$;

comment on function public.poser_loyers_suivis_depuis() is
  'Date de bascule (20/11/2026) : à l''activation d''un bail, note le premier mois dont Gerimmo suivra le loyer (premier_mois_suivi).';

revoke all on function public.poser_loyers_suivis_depuis() from public, anon, authenticated;

drop trigger if exists baux_loyers_suivis_depuis on public.baux;
create trigger baux_loyers_suivis_depuis
  before update of etat on public.baux
  for each row execute function public.poser_loyers_suivis_depuis();

-- 4. L'échéancier part du premier mois suivi quand il existe. La fonction est modifiée EN RELISANT sa définition en
--    vigueur (comme 20261014120000) : une définition inattendue arrête la migration ; la marque du correctif, présente
--    dans la définition, rend le rejeu sans effet.
do $correctif$
declare
  v_def text;
  v_ancre text;
begin
  select pg_get_functiondef('public.generer_appels_loyer_interne(uuid)'::regprocedure) into v_def;
  if position('Date de bascule (20/11/2026)' in v_def) > 0 then return; end if;

  v_ancre := $ancre$
  v_mois := date_trunc('month', v.date_debut)::date;
$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Date de bascule : définition inattendue de generer_appels_loyer_interne (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$
  -- Date de bascule (20/11/2026) : un bail repris en cours n'appelle que les loyers suivis dans Gerimmo, à partir du
  -- mois de son activation (baux.loyers_suivis_depuis). Sans date de bascule, rien ne change : on part de l'entrée.
  v_mois := greatest(date_trunc('month', v.date_debut)::date,
                     coalesce(v.loyers_suivis_depuis, date_trunc('month', v.date_debut)::date));
$nouveau$);
  execute v_def;
end $correctif$;

-- Droits : inchangés. Fonction INTERNE (20260911200000) : seuls le cycle mensuel et l'enveloppe publique
-- `generer_appels_loyer`, qui contrôle l'accès, l'appellent. On les redit pour qu'un rejeu ne les élargisse jamais.
revoke all on function public.generer_appels_loyer_interne(uuid) from public, anon, authenticated;
grant execute on function public.generer_appels_loyer_interne(uuid) to service_role;

-- 5. Un exercice commencé avant le premier mois suivi ne se régularise pas dans Gerimmo. Le refus est posé sur la
--    TABLE, pas dans une fonction : deux chemins y écrivent (`regulariser_charges`, et la régularisation tirée des
--    factures de fourniture, `consommations_interne.emettre_regularisation`) ; le déclencheur les couvre tous les deux,
--    et tout chemin à venir. Il lit le bail sous les droits de son propriétaire : aucun réglage d'accès ne le contourne.
create or replace function public.refuser_regularisation_avant_bascule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_debut date;
  v_depuis date;
begin
  select b.date_debut, b.loyers_suivis_depuis into v_debut, v_depuis from public.baux b where b.id = new.bail_id;
  if v_depuis is not null
     and greatest(coalesce(v_debut, make_date(new.annee, 1, 1)), make_date(new.annee, 1, 1)) < v_depuis then
    raise exception 'Exercice % : Gerimmo ne suit les loyers de ce bail que depuis % %. Les provisions versées avant ne lui sont pas connues ; régularisez cet exercice en dehors de Gerimmo. Premier exercice régularisable ici : %',
      new.annee,
      (array['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'])[extract(month from v_depuis)::int],
      extract(year from v_depuis)::int,
      extract(year from v_depuis)::int + case when extract(month from v_depuis)::int = 1 then 0 else 1 end;
  end if;
  return new;
end;
$$;

comment on function public.refuser_regularisation_avant_bascule() is
  'Date de bascule (20/11/2026) : refuse la régularisation des charges d''un exercice commencé avant le premier mois suivi du bail (les provisions versées avant Gerimmo ne sont pas connues).';

revoke all on function public.refuser_regularisation_avant_bascule() from public, anon, authenticated;

drop trigger if exists regularisations_avant_bascule on public.regularisations_charges;
create trigger regularisations_avant_bascule
  before insert on public.regularisations_charges
  for each row execute function public.refuser_regularisation_avant_bascule();

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
