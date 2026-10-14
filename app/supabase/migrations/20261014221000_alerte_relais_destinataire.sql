-- D09 (audit du 13 octobre 2026, fiche SUP-03) : seul le destinataire d'une alerte de relais peut en
-- accuser réception.
--
-- Avant : accuser_alerte_vacances ne comparait pas auth.uid() au destinataire. N'importe quel
-- superviseur permanent, créateur du plan compris, pouvait passer une alerte adressée à un autre
-- responsable à « accusée » : une urgence du mode vacances « accusée » sans que le responsable l'ait
-- vue. L'écran ne disait pas non plus par qui.
--
-- Après : seul le destinataire accuse. Une escalade (traiter_vacances) change déjà `destinataire`
-- pour la personne vers qui l'alerte est escaladée : c'est donc elle, et elle seule, qui peut
-- l'accuser. Un superviseur qui n'est pas le destinataire reçoit un refus explicite (avant : un
-- succès silencieux de ce qui n'aurait pas dû passer). Une alerte déjà accusée ou inconnue ne fait
-- rien, comme avant.
-- Cas particulier, signalé au dirigeant : une alerte « non acheminée » est adressée à quelqu'un qui
-- n'est plus habilité, donc qui ne peut plus rien faire ; elle reste reprenable par un autre
-- superviseur permanent, sinon elle ne pourrait jamais être refermée. Si son destinataire est de
-- nouveau habilité, lui seul l'accuse.
--
-- Rien ici ne touche une ligne existante, aucune table, aucun droit. La fonction est modifiée EN
-- RELISANT sa définition en vigueur (pg_get_functiondef), comme le fait 20261013120000 : une
-- réécriture à la main écraserait une garde qu'une autre migration y aurait injectée. Si la définition
-- n'est pas celle attendue, la migration s'arrête. Elle se rejoue sans effet : le bloc cherche la
-- marque de son correctif dans la définition en vigueur et ne fait alors rien.
--
-- À appliquer par `migrations.yml` (simulation d'abord), comme toute migration. Retour arrière :
-- app/supabase/retours-arriere/20261014221000_alerte_relais_destinataire.retour.sql.

do $correctif$
declare v_def text;
begin
  select pg_get_functiondef('public.accuser_alerte_vacances(uuid)'::regprocedure) into v_def;
  if position('Audit du 14/10 (SUP-03)' in v_def) > 0 then return; end if;

  if (length(v_def) - length(replace(v_def, $ancre$update public.supervision_alertes_internes set statut='accusee',accusee_le=now(),accusee_par=auth.uid() where id=p_id and statut<>'accusee';$ancre$, '')))
     <> length($ancre$update public.supervision_alertes_internes set statut='accusee',accusee_le=now(),accusee_par=auth.uid() where id=p_id and statut<>'accusee';$ancre$) then
    raise exception 'Correctif SUP-03 : définition inattendue (ancre 1 absente ou répétée)';
  end if;
  v_def := replace(v_def, $ancre$update public.supervision_alertes_internes set statut='accusee',accusee_le=now(),accusee_par=auth.uid() where id=p_id and statut<>'accusee';$ancre$, $nouveau$-- Audit du 14/10 (SUP-03) : décision D09, seul le destinataire accuse réception. Après une
 -- escalade, `destinataire` est la personne vers qui l'alerte a été escaladée. Une alerte non
 -- acheminée (destinataire plus habilité) reste reprenable, faute de quoi nul ne pourrait la fermer.
 update public.supervision_alertes_internes set statut='accusee',accusee_le=now(),accusee_par=auth.uid() where id=p_id and statut<>'accusee'
  and (destinataire=auth.uid() or (statut='non_acheminee' and not public.responsable_supervision_habilite(destinataire)));$nouveau$);

  if (length(v_def) - length(replace(v_def, $ancre$if found then insert into public.supervision_operations(objet,action,auteur) values(p_id,'alerte_accusee',auth.uid()); end if;$ancre$, '')))
     <> length($ancre$if found then insert into public.supervision_operations(objet,action,auteur) values(p_id,'alerte_accusee',auth.uid()); end if;$ancre$) then
    raise exception 'Correctif SUP-03 : définition inattendue (ancre 2 absente ou répétée)';
  end if;
  v_def := replace(v_def, $ancre$if found then insert into public.supervision_operations(objet,action,auteur) values(p_id,'alerte_accusee',auth.uid()); end if;$ancre$, $nouveau$if found then insert into public.supervision_operations(objet,action,auteur) values(p_id,'alerte_accusee',auth.uid());
 elsif exists(select 1 from public.supervision_alertes_internes where id=p_id and statut<>'accusee') then
  raise exception 'Cette alerte est adressée à un autre responsable : seul son destinataire peut en accuser réception';
 end if;$nouveau$);

  execute v_def;
end $correctif$;

select public.fermer_fonctions_a_anon();
