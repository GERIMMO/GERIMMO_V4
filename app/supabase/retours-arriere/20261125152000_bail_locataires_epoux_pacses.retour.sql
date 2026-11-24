-- RETOUR ARRIÈRE de 20261125152000_bail_locataires_epoux_pacses.sql (case « mariés ou pacsés » au bail, décision du
-- dirigeant du 24/11/2026).
--
-- Rend à `enregistrer_depart_colocataire` son texte d'avant, à l'identique (le bloc de la case est retiré) : un départ
-- s'enregistre de nouveau avec une fin de solidarité six mois après la date d'effet du congé (ou à cette date en cas de
-- remplacement), même sur un bail dont la case est cochée.
-- LA COLONNE `baux.locataires_epoux_pacses` EST GARDÉE, avec ses valeurs : la supprimer effacerait ce que les gérants ont
-- déclaré. Elle n'est plus lue par la base ; si le code de l'application n'est pas revenu en arrière, le bail imprime
-- encore la clause des époux ou partenaires de PACS pour une case cochée. Elle se supprime à la main une fois le code
-- revenu (`alter table public.baux drop column locataires_epoux_pacses`), si rien ne doit en être gardé.
-- À SAVOIR : les départs enregistrés sous la case entre-temps gardent leur fin de solidarité VIDE (aucune donnée n'est
-- modifiée) : ces colocataires restent destinataires des appels et des relances ; à revoir un par un si besoin.
-- Droits inchangés. Rejouable.

do $retour_epoux_pacses$
declare
  c_signature constant text := 'public.enregistrer_depart_colocataire(uuid,date,uuid)';
  c_ajout constant text := $n$
  -- Case « mariés ou pacsés » (décision du 24/11/2026) : une location consentie exclusivement à des époux ou à des
  -- partenaires de PACS n'est pas une colocation (article 8-1, I) ; la fin de la solidarité du VI ne la vise pas, et le
  -- texte n'en fixe pas d'autre : aucune date de fin n'est enregistrée, avec ou sans remplaçant.
  if coalesce((select b.locataires_epoux_pacses from public.baux b where b.id = v.bail_id), false) then
    v_fin := null;
  end if;$n$;
  definition text;
  corps text;
begin
  select pg_get_functiondef(p.oid), p.prosrc into definition, corps
    from pg_proc p where p.oid = to_regprocedure(c_signature) and p.prosecdef;
  if corps is null then
    raise exception 'Retour de la case « mariés ou pacsés » : fonction % introuvable ou inattendue ; rien n''est modifié', c_signature;
  end if;
  -- Déjà revenue (rejeu), ou migration jamais appliquée : rien à faire.
  if position(c_ajout in corps) = 0 then
    if position('locataires_epoux_pacses' in corps) > 0 then
      raise exception 'Retour de la case « mariés ou pacsés » : % a été réécrite depuis la migration ; rien n''est modifié', c_signature;
    end if;
    return;
  end if;
  execute replace(definition, corps, replace(corps, c_ajout, ''));
end $retour_epoux_pacses$;
