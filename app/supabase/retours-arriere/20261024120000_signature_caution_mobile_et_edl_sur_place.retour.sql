-- Retour de 20261024120000 (conformité V1, lot 1D tel que la décision du 23/10 le remplace : la caution confirme
-- elle-même son mobile ; l'état des lieux porte la confirmation « établi contradictoirement, sur place »).
-- Remettre d'abord le code précédent : l'envoi d'un acte de cautionnement, la page publique /signature/caution/… et la
-- confirmation de l'état des lieux appellent les fonctions retirées ici.
--
-- Ce qui est défait :
--  · le déclencheur `signature_garde_caution_edl` et sa fonction (un circuit repart sans confirmation : c'est le
--    comportement d'avant, où le numéro saisi par le bailleur servait au cautionnement) ;
--  · `demander_confirmation_mobile_caution`, `consommer_confirmation_mobile_caution`, `confirmer_edl_sur_place` ;
--  · la table `confirmations_mobile_caution` (déclencheurs, fonction de garde), SEULEMENT SI ELLE EST VIDE. Une table
--    qui porte des liens envoyés est CONSERVÉE telle quelle, sa garde comprise : c'est la preuve de la confirmation du
--    numéro par la caution ; son sort revient au dirigeant. Le script dit alors ce qu'il garde.
-- Ce qui est conservé : la colonne `bail_signature_circuits.confirmation_sur_place` et sa contrainte (preuve des
-- confirmations déjà données ; le code précédent l'ignore).
--
-- Une seule instruction DO atomique : seule en autocommit, ou intégralement annulable dans une transaction externe,
-- qu'elle ne valide jamais. Rejouée, elle ne fait rien de plus. Hors de la chaîne « Ordre complet » du LISEZ-MOI (la
-- migration ne cite pas `aujourdhui_paris()`). La marche avant se rejoue ensuite sans rien perdre.
do $retour_atomique$
declare
  v_liens bigint := 0;
begin
  perform set_config('lock_timeout', '10s', true);

  -- 1. Garde de l'envoi.
  drop trigger if exists signature_garde_caution_edl on public.bail_signature_circuits;
  drop function if exists public.garder_envoi_signature_caution_edl();

  -- 2. Fonctions.
  drop function if exists public.demander_confirmation_mobile_caution(uuid, uuid, text);
  drop function if exists public.consommer_confirmation_mobile_caution(text, text);
  drop function if exists public.confirmer_edl_sur_place(uuid, uuid, date);

  -- 3. La table des liens, si elle est vide.
  if to_regclass('public.confirmations_mobile_caution') is not null then
    execute 'select count(*) from public.confirmations_mobile_caution' into v_liens;
    if v_liens = 0 then
      drop table public.confirmations_mobile_caution;
      drop function if exists public.confirmations_mobile_caution_garde();
    else
      raise notice 'public.confirmations_mobile_caution conservée : % lien(s) envoyé(s) à une caution (preuves ; décision du dirigeant requise avant toute suppression).', v_liens;
    end if;
  end if;

  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261024120000';
  end if;
end;
$retour_atomique$;
