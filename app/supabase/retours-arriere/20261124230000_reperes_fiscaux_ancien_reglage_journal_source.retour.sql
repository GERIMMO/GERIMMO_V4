-- RETOUR ARRIÈRE de 20261124230000_reperes_fiscaux_ancien_reglage_journal_source.sql (décision du 24/11/2026, Q38,
-- seconde reprise du lot D3 : le journal de l'ancien réglage des repères fiscaux dit quelle source il a effacée).
--
-- Rend à `regler_reperes_fiscaux(integer, integer)` son texte de 20261124210000, recopié tel quel : la ligne de
-- journal ne dit plus quelle source a été effacée. Le réglage lui-même ne change pas. Aucune donnée n'est modifiée ni
-- supprimée (les lignes de journal déjà écrites restent) ; droits inchangés. Indépendant du retour du code.
--
-- À JOUER AVANT le retour de 20261124210000, lui-même joué avant celui de 20261124190000 (qui supprime la colonne
-- `source`, que cette fonction lit et écrit). Joué après le retour de 20261124210000, ce retour ne touche pas la
-- fonction (il ne remet pas un texte qui écrit la colonne `source`). Sans effet si la fonction n'existe plus. Rejouable.
do $retour$
declare
  -- Vide si la fonction n'existe plus (retour de 20261123090000 déjà joué) : la lecture de son texte rend alors « vide ».
  v_fonction regprocedure := to_regprocedure('public.regler_reperes_fiscaux(integer, integer)');
begin
  if pg_get_functiondef(v_fonction) like '%source_effacee%' then
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
         source = null,  -- reprise D3 : ce réglage ne reçoit pas de source, il ne garde pas celle d'un contrôle d'avant
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
      'Ancien réglage sans source (P2-09), gardé pour le superviseur permanent : enregistre le plafond et l''abattement du micro-foncier, date la vérification du jour, VIDE la source (reprise du lot D3, Q38) et journalise le geste. L''application règle par regler_reperes_fiscaux_avec_source.';
  end if;
  delete from supabase_migrations.schema_migrations where version = '20261124230000';
end $retour$;
select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
