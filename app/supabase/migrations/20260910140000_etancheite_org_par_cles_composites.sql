-- Audit du 2026-09-10 — P0 : corruption inter-agences par rattachement croisé.
--
-- Rejeu de la faille : un admin de l'agence B insère dans `encaissements` une
-- ligne portant organization_id = B et bail_id = un bail de l'agence A. La
-- politique RLS ne vérifie qu'une chose — l'appelant appartient-il à l'org de
-- la LIGNE ? — jamais la cohérence entre la ligne et l'objet qu'elle vise. La
-- FK simple bail_id → baux(id) accepte n'importe quel bail. Conséquences en
-- chaîne : le loyer de l'agence A passe « payé » (etat_loyers_bail somme les
-- encaissements par bail_id, sans filtre d'organisation), le déclencheur de
-- quittances émet alors une quittance libératoire pour un loyer jamais reçu,
-- et ecrire_encaissement estampille des écritures de l'agence A au journal
-- de l'agence B — un faux comptable déclenchable depuis l'extérieur.
--
-- Le référentiel a déjà la parade et la nomme : les clés étrangères
-- COMPOSITES `*_meme_org_fk` (baux, incidents, détentions, EDL… les portent
-- déjà). Treize tables ne l'avaient pas. On généralise, sans exception :
-- une ligne ne peut plus viser un bail ou un lot d'une autre organisation.
--
-- Vérifié avant pose, en local et en production : zéro ligne incohérente.

-- Bail : la ligne et le bail visé partagent l'organisation
alter table public.appels_loyer
  add constraint appels_loyer_bail_meme_org_fk
  foreign key (bail_id, organization_id) references public.baux (id, organization_id);

alter table public.encaissements
  add constraint encaissements_bail_meme_org_fk
  foreign key (bail_id, organization_id) references public.baux (id, organization_id);

alter table public.quittances
  add constraint quittances_bail_meme_org_fk
  foreign key (bail_id, organization_id) references public.baux (id, organization_id);

alter table public.depot_encaissements
  add constraint depot_encaissements_bail_meme_org_fk
  foreign key (bail_id, organization_id) references public.baux (id, organization_id);

alter table public.restitutions
  add constraint restitutions_bail_meme_org_fk
  foreign key (bail_id, organization_id) references public.baux (id, organization_id);

alter table public.relances
  add constraint relances_bail_meme_org_fk
  foreign key (bail_id, organization_id) references public.baux (id, organization_id);

alter table public.revisions_loyer
  add constraint revisions_loyer_bail_meme_org_fk
  foreign key (bail_id, organization_id) references public.baux (id, organization_id);

alter table public.regularisations_charges
  add constraint regularisations_charges_bail_meme_org_fk
  foreign key (bail_id, organization_id) references public.baux (id, organization_id);

alter table public.intentions_conge
  add constraint intentions_conge_bail_meme_org_fk
  foreign key (bail_id, organization_id) references public.baux (id, organization_id);

alter table public.inventaire_lignes
  add constraint inventaire_lignes_bail_meme_org_fk
  foreign key (bail_id, organization_id) references public.baux (id, organization_id);

-- Lot : même principe
alter table public.appels_charges
  add constraint appels_charges_lot_meme_org_fk
  foreign key (lot_id, organization_id) references public.lots (id, organization_id);

alter table public.lot_pieces
  add constraint lot_pieces_lot_meme_org_fk
  foreign key (lot_id, organization_id) references public.lots (id, organization_id);

-- Écritures : les deux rattachements, tous deux facultatifs (une écriture
-- peut viser un lot sans bail). Une FK composite n'est vérifiée que si
-- TOUTES ses colonnes sont non nulles — les écritures libres restent
-- possibles, celles qui visent un objet doivent viser le bon.
alter table public.ecritures
  add constraint ecritures_bail_meme_org_fk
  foreign key (bail_id, organization_id) references public.baux (id, organization_id);

alter table public.ecritures
  add constraint ecritures_lot_meme_org_fk
  foreign key (lot_id, organization_id) references public.lots (id, organization_id);

-- Défense en profondeur : même si une ligne croisée réapparaissait par une
-- voie imprévue, l'encaissé d'un bail ne compte que les encaissements de
-- l'organisation de ce bail.
create or replace function public.etat_loyers_bail_brut(p_bail uuid)
returns table (
  appel_id uuid, periode date, date_echeance date, montant_du numeric,
  cumul_du numeric, montant_couvert numeric, statut text
)
language sql stable security definer set search_path = ''
as $$
  with b as (
    select id, organization_id from public.baux where id = p_bail
  ), a as (
    select al.id, al.periode, al.date_echeance, al.montant_du,
      sum(al.montant_du) over (order by al.periode rows between unbounded preceding and current row) as cumul_du
    from public.appels_loyer al join b on b.id = al.bail_id
    where al.organization_id = b.organization_id
  ), tot as (
    select coalesce(sum(e.montant), 0) as encaisse
    from public.encaissements e join b on b.id = e.bail_id
    where e.organization_id = b.organization_id
  )
  select
    a.id, a.periode, a.date_echeance, a.montant_du, a.cumul_du,
    round(least(a.montant_du, greatest(0, tot.encaisse - (a.cumul_du - a.montant_du))), 2) as montant_couvert,
    case
      when tot.encaisse >= a.cumul_du then 'paye'
      when tot.encaisse > (a.cumul_du - a.montant_du) then 'partiel'
      when a.date_echeance < current_date then 'impaye'
      else 'attendu'
    end as statut
  from a, tot
  order by a.periode;
$$;
revoke execute on function public.etat_loyers_bail_brut(uuid) from public, anon, authenticated;

-- Fonction interne des tâches planifiées : elle pose une alerte arbitraire
-- (titre et détails compris) dans l'organisation qu'on lui nomme, sans
-- contrôle — elle n'a rien à faire dans l'API publique. Seules les fonctions
-- generer_alertes_* l'appellent, en SECURITY DEFINER.
revoke execute on function public.poser_alerte_seuil(uuid, text, text, uuid, text, public.alerte_criticite, text, jsonb, date)
  from public, anon, authenticated;
