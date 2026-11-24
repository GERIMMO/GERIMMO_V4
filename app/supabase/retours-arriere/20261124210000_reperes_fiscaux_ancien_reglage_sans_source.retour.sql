-- RETOUR ARRIÈRE de 20261124210000_reperes_fiscaux_ancien_reglage_sans_source.sql (décision du 24/11/2026, Q38,
-- reprise du lot D3 : l'ancien réglage des repères fiscaux vide la source).
--
-- Rend à `regler_reperes_fiscaux(integer, integer)` son texte de 20261123090000, recopié tel quel. RÉINTRODUIT le
-- défaut corrigé : après un réglage « avec source », l'ancien réglage change les valeurs et la date en gardant
-- l'ancienne source. Aucune donnée n'est modifiée ni supprimée ; droits inchangés. Indépendant du retour du code
-- (l'application n'appelle pas cette fonction).
--
-- À JOUER AVANT le retour de 20261124190000 : celui-ci supprime la colonne `source`, que la fonction de ce lot écrit
-- (tant que ce retour-ci n'est pas joué, l'ancien réglage s'arrêterait sur une colonne absente).
-- Sans effet sur une base où la fonction n'existe plus (retour de 20261123090000 déjà joué). Rejouable.
do $retour$
begin
  if to_regprocedure('public.regler_reperes_fiscaux(integer, integer)') is not null then
    create or replace function public.regler_reperes_fiscaux(p_plafond_euros integer, p_abattement_pourcent integer)
    returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.reperes_fiscaux_reglage;
  v_jour date := public.aujourdhui_paris();
begin
  if public.is_permanent_super_admin() is not true then
    raise exception 'Supervision permanente et double vérification requises';
  end if;
  if p_plafond_euros is null or p_plafond_euros < 1000 or p_plafond_euros > 1000000 then
    raise exception 'Plafond du micro-foncier : un nombre entier d''euros, entre 1 000 et 1 000 000';
  end if;
  if p_abattement_pourcent is null or p_abattement_pourcent < 1 or p_abattement_pourcent > 99 then
    raise exception 'Abattement du micro-foncier : un pourcentage entier, entre 1 et 99';
  end if;
  insert into public.reperes_fiscaux_reglage (singleton) values (true) on conflict (singleton) do nothing;
  select * into r from public.reperes_fiscaux_reglage where singleton for update;
  update public.reperes_fiscaux_reglage
     set micro_foncier_plafond_euros = p_plafond_euros,
         micro_foncier_abattement_pourcent = p_abattement_pourcent,
         verifie_le = v_jour,
         modifie_le = now(),
         modifie_par = auth.uid()
   where singleton;
  insert into public.supervision_operations (objet, action, auteur, details)
  values (null, 'reperes_fiscaux', auth.uid(),
          jsonb_build_object('plafond_euros', p_plafond_euros, 'abattement_pourcent', p_abattement_pourcent,
                             'verifie_le', v_jour,
                             'plafond_precedent', r.micro_foncier_plafond_euros,
                             'abattement_precedent', r.micro_foncier_abattement_pourcent,
                             'verification_precedente', r.verifie_le));
end;
$$;
    comment on function public.regler_reperes_fiscaux(integer, integer) is
      'Le superviseur permanent enregistre le plafond et l''abattement du micro-foncier qu''il vient de contrôler (P2-09) ; la vérification est datée du jour, le geste journalisé (supervision_operations, action « reperes_fiscaux »).';
  end if;
  delete from supabase_migrations.schema_migrations where version = '20261124210000';
end $retour$;
select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
