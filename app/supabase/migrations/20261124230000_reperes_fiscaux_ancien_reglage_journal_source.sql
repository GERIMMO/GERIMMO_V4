-- Décision du dirigeant du 24/11/2026 (Q38), seconde reprise du lot D3 (point 5 de la relecture) — le journal de
-- l'ancien réglage des repères fiscaux dit quelle source il a effacée.
--
-- LE DÉFAUT. Depuis 20261124210000, l'ancien réglage à deux arguments `regler_reperes_fiscaux(plafond, abattement)`
-- vide la source d'un contrôle d'avant. Sa ligne de journal (supervision, action « reperes_fiscaux ») ne le disait
-- pas : pour savoir qu'une source avait été effacée, il fallait relire le geste précédent.
--
-- LA CORRECTION. La ligne de journal porte une information de plus, « source_effacee » : la source qui était
-- enregistrée juste avant (vide s'il n'y en avait pas). Le texte de la fonction est celui de 20261124210000, avec
-- cette seule ligne de plus, marquée « seconde reprise D3 ». Le réglage lui-même ne change pas ; droits inchangés.
--
-- Aucune donnée n'est écrite par cette migration. Rejouable.
-- Retour arrière : supabase/retours-arriere/20261124230000_reperes_fiscaux_ancien_reglage_journal_source.retour.sql
-- À SAVOIR : rejouer SEULE l'ancienne migration 20261123090000 ou 20261124210000 remet l'ancien texte ; rejouer
-- ensuite celle-ci.

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
                             'verification_precedente', r.verifie_le,
                             'source_effacee', r.source));  -- seconde reprise D3 : la source que ce geste efface
end;
$$;
comment on function public.regler_reperes_fiscaux(integer, integer) is
  'Ancien réglage sans source (P2-09), gardé pour le superviseur permanent : enregistre le plafond et l''abattement du micro-foncier, date la vérification du jour, VIDE la source et journalise le geste avec la source effacée (reprises du lot D3, Q38). L''application règle par regler_reperes_fiscaux_avec_source.';
revoke all on function public.regler_reperes_fiscaux(integer, integer) from public, anon, service_role;
grant execute on function public.regler_reperes_fiscaux(integer, integer) to authenticated;

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
