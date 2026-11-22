-- CHARGES DE COPROPRIÉTÉ : UNE NATURE « RÉCUPÉRABLE » PROPOSÉE PAR LA MACHINE NE VAUT RIEN TANT QU'ELLE N'EST PAS
-- CONFIRMÉE (audit palier 1 du 22/11/2026, P0-03, relevé C1).
--
-- LE DÉFAUT. À la saisie d'un poste d'un appel du syndic, l'application devinait sa nature d'après des mots de son
-- intitulé et l'écrivait telle quelle (`propose = true`). `valider_ventilation` ne retenait que les postes « à
-- qualifier » : un poste deviné « récupérable » passait sans que personne ne le confirme, puis entrait dans la
-- régularisation des charges du locataire (`charges_recuperables_exercice`). « Travaux ascenseur » ou « Création
-- jardin » étaient ainsi mis à la charge du locataire.
--
-- LA CORRECTION, EN DEUX ENDROITS.
--   · L'application (même lot) : un poste naît désormais « à qualifier » ; la grille ne fait plus que suggérer à
--     l'écran. Aucun nouveau poste ne naît donc « récupérable ».
--   · La base (cette migration) : `valider_ventilation` refuse un appel dont un poste est encore « récupérable »
--     PAR PROPOSITION (`propose = true`), c'est-à-dire jamais confirmé. Cela couvre les postes saisis avant ce lot et
--     toute écriture qui ne passerait pas par l'écran. Le geste « Qualifier » pose `propose = false` : confirmer la
--     nature proposée, ou la corriger, lève le refus.
--
-- CE QUI NE CHANGE PAS : les droits, le refus des postes « à qualifier », l'égalité entre le total des postes et le total
-- de l'appel, le refus d'un appel figé. Aucune donnée n'est modifiée : les postes déjà saisis gardent leur nature ; les
-- appels déjà validés ou figés ne sont pas rouverts (la question de les revoir est posée au dirigeant, QUESTIONS.md).
-- Une proposition « non récupérable » non confirmée ne bloque pas : elle ne met rien à la charge du locataire.
--
-- Retour arrière : supabase/retours-arriere/20261122230000_charges_proposees_a_confirmer.retour.sql.

create or replace function public.valider_ventilation(p_appel uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v record; v_somme numeric; v_aqualifier integer; v_proposes integer;
begin
  select * into v from public.appels_charges where id = p_appel;
  if v.id is null then raise exception 'Appel introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.statut = 'fige' then raise exception 'Appel figé : plus de ventilation possible'; end if;
  select coalesce(sum(montant), 0), count(*) filter (where nature = 'a_qualifier'),
         count(*) filter (where propose and nature = 'recuperable')
    into v_somme, v_aqualifier, v_proposes
    from public.appel_charges_postes where appel_id = p_appel;
  if v_aqualifier > 0 then
    raise exception '% poste(s) restent à qualifier — ventilation bloquée (RM-0c.3.3)', v_aqualifier;
  end if;
  -- P0-03 (22/11/2026) : une nature « récupérable » devinée d'après l'intitulé doit être confirmée poste par poste.
  if v_proposes > 0 then
    raise exception '% poste(s) proposé(s) « récupérable » attendent votre confirmation : choisissez leur nature puis « Qualifier »', v_proposes;
  end if;
  if round(v_somme, 2) <> round(v.total, 2) then
    raise exception 'Total des postes (% €) différent du total de l''appel (% €) — bloquant (RM-0c.2.2)',
      round(v_somme, 2), round(v.total, 2);
  end if;
  update public.appels_charges set statut = 'ventile' where id = p_appel;
end $$;
revoke execute on function public.valider_ventilation(uuid) from public, anon;

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
