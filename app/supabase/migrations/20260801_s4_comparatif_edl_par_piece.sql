-- Correctif : le comparatif joignait les lignes d'entrée et de sortie sur le
-- seul libellé. Depuis la grille par pièce, « Sols » / « Murs » existent dans
-- CHAQUE pièce : la jointure produisait un produit cartésien et donc des écarts
-- faux — or c'est ce comparatif qui fonde les retenues sur le dépôt (RM-1.13.2).
-- La jointure porte désormais sur (pièce, libellé) et la pièce est restituée.
drop function if exists public.comparatif_edl(uuid);

create function public.comparatif_edl(p_bail uuid)
returns table (
  piece text, libelle text, categorie text,
  etat_entree public.etat_element, etat_sortie public.etat_element, ecart boolean
)
language sql
security invoker
set search_path = ''
stable
as $$
  select
    coalesce(e.piece, s.piece) as piece,
    coalesce(e.libelle, s.libelle) as libelle,
    coalesce(e.categorie, s.categorie) as categorie,
    e.etat as etat_entree, s.etat as etat_sortie,
    (e.etat is distinct from s.etat) as ecart
  from (
    select l.piece, l.libelle, l.categorie, l.etat, l.ordre
    from public.edl_lignes l
    join public.etats_des_lieux ed on ed.id = l.edl_id
    where ed.bail_id = p_bail and ed.type = 'entree'
  ) e
  full outer join (
    select l.piece, l.libelle, l.categorie, l.etat
    from public.edl_lignes l
    join public.etats_des_lieux ed on ed.id = l.edl_id
    where ed.bail_id = p_bail and ed.type = 'sortie'
  ) s
    on coalesce(e.piece, '') = coalesce(s.piece, '')
   and e.libelle = s.libelle
   and coalesce(e.categorie, '') = coalesce(s.categorie, '')
  order by 1 nulls first, 3, 2;
$$;
