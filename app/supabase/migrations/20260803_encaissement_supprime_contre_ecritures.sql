-- A-03 — Supprimer un encaissement laissait ses écritures dans le journal.
--
-- L'agent peut supprimer un encaissement (bouton « Supprimer » sur la fiche du
-- bail). Le déclencheur qui écrit au journal était en AFTER INSERT seulement :
-- le loyer et les honoraires restaient donc comptabilisés alors que la recette
-- n'existait plus. Le rapport de gestion surévaluait les recettes du mandant.
--
-- Deux pièces manquaient :
--
-- 1. Le lien écriture → encaissement. Rapprocher par « même bail, même date »
--    est ambigu : deux règlements le même jour sur le même bail sont courants
--    (un partiel puis un complément). Sans référence explicite, on ne sait pas
--    quoi annuler.
--
-- 2. La contre-passation. Les écritures sont immuables par conception (RLS :
--    select et insert seulement). On n'efface donc pas : on inscrit l'écriture
--    inverse, comme en comptabilité.

alter table public.ecritures
  add column if not exists encaissement_id uuid;

create index if not exists ecritures_encaissement_idx on public.ecritures (encaissement_id);

-- Rattachement des écritures déjà présentes, quand le couple bail + date est
-- sans ambiguïté. Celles qui restent sans lien ne seront pas contre-passées :
-- c'est le comportement d'avant, pas une régression.
update public.ecritures e set encaissement_id = k.id
  from public.encaissements k
 where e.encaissement_id is null
   and e.bail_id = k.bail_id
   and e.date_piece = k.date_paiement
   and e.categorie in ('loyer', 'honoraires')
   and e.contre_ecriture_de is null;

create or replace function public.ecrire_encaissement()
returns trigger language plpgsql security definer set search_path to '' as $function$
declare v_lot uuid; v_taux numeric; v_mandat uuid;
begin
  select lot_id into v_lot from public.baux where id = new.bail_id;
  insert into public.ecritures
    (organization_id, bail_id, lot_id, categorie, sens, montant, date_piece, date_imputation,
     libelle, encaissement_id)
  values (new.organization_id, new.bail_id, v_lot, 'loyer', 'recette', new.montant,
          new.date_paiement, new.date_paiement, 'Encaissement de loyer', new.id);

  select ml.taux_honoraires, ml.mandat_id into v_taux, v_mandat
  from public.mandat_lignes ml
  where ml.lot_id = v_lot and ml.date_debut <= new.date_paiement
    and (ml.date_fin is null or ml.date_fin >= new.date_paiement)
  order by ml.date_debut desc limit 1;

  if v_taux is not null and v_taux > 0 then
    insert into public.ecritures
      (organization_id, bail_id, lot_id, mandat_id, categorie, sens, montant,
       date_piece, date_imputation, libelle, systeme, encaissement_id)
    values (new.organization_id, new.bail_id, v_lot, v_mandat, 'honoraires', 'depense',
            round(new.montant * v_taux / 100, 2), new.date_paiement, new.date_paiement,
            'Honoraires de gestion', true, new.id);
  end if;
  return new;
end $function$;

create or replace function public.contre_passer_encaissement()
returns trigger language plpgsql security definer set search_path to '' as $function$
declare e record;
begin
  for e in
    select * from public.ecritures o
     where o.encaissement_id = old.id
       and o.contre_ecriture_de is null
       and not exists (select 1 from public.ecritures c where c.contre_ecriture_de = o.id)
  loop
    insert into public.ecritures
      (organization_id, bail_id, lot_id, mandat_id, categorie, sens, montant,
       date_piece, date_imputation, libelle, systeme, contre_ecriture_de)
    values (e.organization_id, e.bail_id, e.lot_id, e.mandat_id, e.categorie,
            case when e.sens = 'recette' then 'depense' else 'recette' end,
            e.montant, current_date, current_date,
            'Annulation — encaissement supprimé', true, e.id);
  end loop;
  return old;
end $function$;

drop trigger if exists encaissement_contre_ecritures on public.encaissements;
create trigger encaissement_contre_ecritures
  before delete on public.encaissements
  for each row execute function public.contre_passer_encaissement();
