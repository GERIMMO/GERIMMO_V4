-- Décision du dirigeant du 24/11/2026 (Q38), reprise du lot D3 (M2) — l'ancien réglage des repères fiscaux ne laisse
-- plus une source périmée.
--
-- LE DÉFAUT. Depuis 20261124190000, le réglage « avec source » enregistre où les deux valeurs ont été lues. L'ancien
-- réglage à deux arguments, `regler_reperes_fiscaux(plafond, abattement)` (20261123090000), existe toujours : il
-- change les valeurs et la date de vérification, mais ne touchait pas la source. Exemple : réglage avec source
-- (15 000 €, 30 %, « page A »), puis ancien réglage (16 000 €, 35 %) : l'écran affichait 16 000 € et 35 % « vérifiés »
-- avec la source « page A », qui ne les justifie pas.
--
-- LA CORRECTION. L'ancien réglage remet la source à vide : un contrôle enregistré sans source s'affiche sans source.
-- Son texte est celui de 20261123090000, avec une ligne de plus, marquée « reprise D3 ». La source effacée n'est pas
-- perdue : le journal de la supervision la garde dans le geste « avec source » qui l'avait enregistrée. L'application
-- n'appelle plus cette fonction (elle règle « avec source ») ; elle reste ouverte au superviseur permanent, comme
-- avant. Droits inchangés.
--
-- Aucune donnée n'est écrite par cette migration. Rejouable.
-- Retour arrière : supabase/retours-arriere/20261124210000_reperes_fiscaux_ancien_reglage_sans_source.retour.sql
-- À SAVOIR : rejouer SEULE l'ancienne migration 20261123090000 remet l'ancien texte (source non vidée) ; rejouer
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
                             'verification_precedente', r.verifie_le));
end;
$$;
comment on function public.regler_reperes_fiscaux(integer, integer) is
  'Ancien réglage sans source (P2-09), gardé pour le superviseur permanent : enregistre le plafond et l''abattement du micro-foncier, date la vérification du jour, VIDE la source (reprise du lot D3, Q38) et journalise le geste. L''application règle par regler_reperes_fiscaux_avec_source.';
revoke all on function public.regler_reperes_fiscaux(integer, integer) from public, anon, service_role;
grant execute on function public.regler_reperes_fiscaux(integer, integer) to authenticated;

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
