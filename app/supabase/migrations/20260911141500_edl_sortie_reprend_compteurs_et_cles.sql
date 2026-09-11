-- L'état des lieux de sortie reprend les compteurs et les clés de l'entrée.
--
-- Constat (relevé de parcours du 11/09, « EDL de sortie → restitution »).
-- L'écran de l'EDL annonce « Relevés de compteurs et clés/badges remis — repris
-- à l'état des lieux de sortie pour comparaison » (edl/[edlId]/page.tsx), mais
-- `generer_grille_edl` ne copie QUE `edl_lignes` depuis l'entrée signée : elle
-- RETOURNE juste après (version du 23/08, section 2). Sur un logement à cinq
-- compteurs et trois clés, l'agent retapait donc huit lignes — type, numéro,
-- libellé, référence — une par une, chacune avec son propre « Ajouter » :
-- huit envois pour des données déjà dans la base, et l'index d'entrée n'était
-- affiché nulle part en regard pour comparer.
--
-- Ce qui est copié, et ce qui ne l'est PAS.
-- Copier la STRUCTURE est exactement ce que demande RM-1.13.1 (« la grille de
-- sortie porte exactement les mêmes lignes que l'entrée », wiki/concepts/État
-- des lieux.md) et RM-1.13.5 (« relevés de compteurs aux deux EDL »). Rien
-- dans le wiki n'exige de retaper un numéro de compteur.
-- En revanche AUCUN CONSTAT n'est présumé :
--   · `releve` reste NULL — un index de sortie recopié de l'entrée serait un
--     faux, et c'est ce chiffre qui fonde la facture de régularisation ;
--   · `nombre` de clés part à 0 — le wiki décrit les clés comme « nombre +
--     références, REMISE PUIS RESTITUTION » : ce que la sortie établit, c'est
--     ce qui revient, pas ce qui avait été remis. L'écran affiche le nombre
--     d'entrée en regard ; l'agent compte et saisit.
-- Un compteur remplacé en cours de bail porte un autre numéro : l'ajout et le
-- retrait de lignes restent inchangés, ce sont eux qui corrigent la structure.

-- ============================================================
-- 1. generer_grille_edl : la sortie copie aussi les annexes de l'entrée
--    (reprise intégrale de la version 20260823113000, section 2 — seul le
--    bloc « annexes » est neuf.)
-- ============================================================
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

  -- Sortie : la structure du comparatif est celle de l'entrée signée
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

      -- Compteurs et clés : la structure suit, jamais le constat.
      -- Une régénération ne doit pas écraser des relevés déjà saisis : on ne
      -- copie que dans une annexe encore vide (la grille, elle, se remplace —
      -- l'écran l'annonce avant de régénérer, revue 23/08).
      if not exists (select 1 from public.edl_compteurs c where c.edl_id = p_edl) then
        insert into public.edl_compteurs (organization_id, edl_id, type, numero, releve)
        select v.organization_id, p_edl, c.type, c.numero, null::numeric
        from public.edl_compteurs c where c.edl_id = v_entree
        order by c.created_at, c.type;
      end if;
      if not exists (select 1 from public.edl_cles k where k.edl_id = p_edl) then
        insert into public.edl_cles (organization_id, edl_id, libelle, nombre, reference)
        select v.organization_id, p_edl, k.libelle, 0, k.reference
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

-- ============================================================
-- 2. Enregistrer les relevés et les clés rendues en un seul geste
--    Sans elle, une structure copiée serait un piège : les lignes existent
--    mais aucun chemin d'écriture ne permettait de les renseigner — seuls
--    l'insertion (ajouterCompteur / ajouterCle) et le retrait existaient.
--    Surface volontairement étroite : cette fonction n'écrit QUE les deux
--    faits que la sortie établit (l'index relevé, le nombre de clés rendues).
--    Un type, un numéro ou une référence erronés se corrigent toujours en
--    retirant la ligne et en la rajoutant — un compteur remplacé en cours de
--    bail n'est pas le même compteur.
-- ============================================================
create or replace function public.enregistrer_annexes_edl(
  p_edl uuid,
  p_compteurs jsonb default '[]'::jsonb,
  p_cles jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_ligne record;
begin
  select e.organization_id, e.etat into v
  from public.etats_des_lieux e where e.id = p_edl;
  if not found then raise exception 'EDL introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  -- Même refus que le trigger edl_annexe_verifier_non_signe, dit tôt et en
  -- français : un EDL signé est figé, compteurs et clés compris (RM-1.12.3).
  if v.etat = 'signe' then
    raise exception 'État des lieux signé : il est figé, compteurs et clés compris';
  end if;

  for v_ligne in
    select * from jsonb_to_recordset(coalesce(p_compteurs, '[]'::jsonb)) as x(id uuid, releve numeric)
  loop
    update public.edl_compteurs
       set releve = v_ligne.releve
     where id = v_ligne.id
       and edl_id = p_edl
       and organization_id = v.organization_id;
  end loop;

  for v_ligne in
    select * from jsonb_to_recordset(coalesce(p_cles, '[]'::jsonb)) as x(id uuid, nombre integer)
  loop
    update public.edl_cles
       set nombre = greatest(coalesce(v_ligne.nombre, 0), 0)
     where id = v_ligne.id
       and edl_id = p_edl
       and organization_id = v.organization_id;
  end loop;
end;
$$;
revoke execute on function public.enregistrer_annexes_edl(uuid, jsonb, jsonb) from public, anon;
