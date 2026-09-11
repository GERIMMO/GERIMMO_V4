-- Une clé non comptée n'est pas une clé non rendue.
--
-- La migration 20260911141500 fait reprendre à l'état des lieux de SORTIE les
-- clés recensées à l'entrée, pour que l'agent n'ait plus à les retaper. Elle
-- posait `nombre = 0` en écrivant « aucun constat n'est présumé ». C'était
-- faux, et la chaîne documentaire le prouvait (vérification du 11/09) :
--
--   · lib/documents/modeles/edl.ts imprime la colonne « Nombre » par
--     `String(c.nombre)` — « 0 » s'imprime comme un fait, dans la section
--     « Clés et moyens d'accès restitués » d'un document que LES DEUX PARTIES
--     SIGNENT ;
--   · le relevé de compteur, lui, est nullable : non saisi, il s'imprime en
--     pointillés ET remonte dans la liste « Restés en libellé » que l'écran
--     montre à l'agent avant de générer. Le nombre de clés n'y entrait jamais.
--
-- Un agent qui laisse le champ tel qu'il l'a trouvé — et un champ prérempli se
-- lit comme déjà renseigné, à la différence d'un champ vide — signait donc un
-- état des lieux attestant que le locataire n'a rendu AUCUNE clé. C'est
-- précisément le fait qui fonde une retenue de remplacement de serrure.
--
-- La symétrie qui manquait est rétablie : `nombre` devient nullable, NULL veut
-- dire « pas encore compté », et la copie ne présume plus rien. La contrainte
-- `nombre >= 0` reste (elle laisse passer NULL), et l'ajout manuel d'une clé
-- continue d'exiger un nombre : à l'entrée, on compte ce qu'on remet.

alter table public.edl_cles alter column nombre drop not null;

comment on column public.edl_cles.nombre is
  'Nombre de clés ou badges. NULL = pas encore compté (ligne reprise de l''entrée sur un EDL de sortie) ; 0 = compté, aucune rendue. La distinction est imprimée au document.';

-- generer_grille_edl : seule la ligne de copie des clés change (0 → null).
-- Reprise intégrale de la version 20260911141500 pour rester lisible d'un bloc.
create or replace function public.generer_grille_edl(p_edl uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_crees int := 0;
  v_ordre int := 0;
  v_piece record;
  v_element text;
  v_equip record;
  v_a_pieces boolean;
  v_entree uuid;
  v_elements text[] := array['Sols','Murs','Plafonds','Fenêtres et volets','Portes','Prises électriques','Éclairage et interrupteurs'];
begin
  select e.organization_id, e.etat, e.type, e.bail_id, b.lot_id into v
  from public.etats_des_lieux e
  join public.baux b on b.id = e.bail_id
  where e.id = p_edl;
  if not found then raise exception 'EDL introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.etat <> 'brouillon' then
    raise exception 'La grille ne se régénère pas sur un EDL signé';
  end if;

  delete from public.edl_lignes where edl_id = p_edl;

  if v.type = 'sortie' then
    select e.id into v_entree from public.etats_des_lieux e
    where e.bail_id = v.bail_id and e.type = 'entree' and e.etat = 'signe'
    order by e.created_at desc limit 1;
    if v_entree is not null then
      insert into public.edl_lignes (organization_id, edl_id, categorie, piece, libelle, ordre)
      select v.organization_id, p_edl, l.categorie, l.piece, l.libelle, l.ordre
      from public.edl_lignes l where l.edl_id = v_entree
      order by l.ordre;
      get diagnostics v_crees = row_count;

      -- La structure suit, jamais le constat : ni l'index relevé, ni le nombre
      -- de clés rendues. Une régénération n'écrase pas une annexe déjà remplie.
      if not exists (select 1 from public.edl_compteurs c where c.edl_id = p_edl) then
        insert into public.edl_compteurs (organization_id, edl_id, type, numero, releve)
        select v.organization_id, p_edl, c.type, c.numero, null
        from public.edl_compteurs c where c.edl_id = v_entree
        order by c.created_at, c.type;
      end if;
      if not exists (select 1 from public.edl_cles k where k.edl_id = p_edl) then
        insert into public.edl_cles (organization_id, edl_id, libelle, nombre, reference)
        select v.organization_id, p_edl, k.libelle, null, k.reference
        from public.edl_cles k where k.edl_id = v_entree
        order by k.created_at, k.libelle;
      end if;

      return v_crees;
    end if;
  end if;

  select exists (select 1 from public.lot_pieces lp where lp.lot_id = v.lot_id) into v_a_pieces;

  if v_a_pieces then
    for v_piece in select nom from public.lot_pieces where lot_id = v.lot_id order by ordre, nom loop
      foreach v_element in array v_elements loop
        insert into public.edl_lignes (organization_id, edl_id, categorie, piece, libelle, ordre)
        values (v.organization_id, p_edl, 'piece', v_piece.nom, v_element, v_ordre);
        v_ordre := v_ordre + 1; v_crees := v_crees + 1;
      end loop;
    end loop;
  else
    foreach v_element in array v_elements loop
      insert into public.edl_lignes (organization_id, edl_id, categorie, libelle, ordre)
      values (v.organization_id, p_edl, 'general', v_element, v_ordre);
      v_ordre := v_ordre + 1; v_crees := v_crees + 1;
    end loop;
  end if;

  for v_equip in
    select ec.nom from public.lot_equipements le
    join public.equipements_catalogue ec on ec.id = le.equipement_id
    where le.lot_id = v.lot_id order by ec.nom
  loop
    insert into public.edl_lignes (organization_id, edl_id, categorie, libelle, ordre)
    values (v.organization_id, p_edl, 'equipement', v_equip.nom, v_ordre);
    v_ordre := v_ordre + 1; v_crees := v_crees + 1;
  end loop;

  return v_crees;
end;
$$;
revoke execute on function public.generer_grille_edl(uuid) from public, anon;
