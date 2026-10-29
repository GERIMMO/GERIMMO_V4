-- Grille commerciale : minimum 4,90 par bien/mois, remise annuelle comprise.
-- Aucun abonnement, échéancier Stripe ou montant déjà souscrit n'est modifié.
update public.tarif_formules f set
 mensuel_cents=v.mensuel, annuel_cents=v.annuel
from (values ('solo',599,5990),('bailleur',1770,17700),
 ('investisseur',5900,59000),('patrimoine',11800,118000)) v(code,mensuel,annuel)
where f.code=v.code;

alter table public.tarif_formules add constraint tarif_formules_plancher_490
 check (mensuel_cents >= biens_max::bigint*490
        and annuel_cents >= biens_max::bigint*490*12);

update public.tarif_tranches set
 prix_unitaire_cents=case when rang=1 then 0 else 490 end,
 forfait_cents=case when rang=1 then 4900 else 0 end
where grille='2026-09-28' and public='agence';

alter table public.tarif_tranches add constraint tarif_agence_plancher_490
 check (grille<>'2026-09-28' or public<>'agence' or
   (rang=1 and borne_haute is not null and forfait_cents>=borne_haute::bigint*490)
   or (rang>1 and prix_unitaire_cents>=490));

create or replace function public.tarif_supplement_bien_cents(p_periodicite text)
returns integer language sql immutable set search_path='' as $$
 select case when p_periodicite='annuel' then 5900 else 590 end
$$;
revoke execute on function public.tarif_supplement_bien_cents(text) from public,anon;
grant execute on function public.tarif_supplement_bien_cents(text) to authenticated,service_role;

do $plancher$
begin
 if exists(select 1 from generate_series(0,1000) n where
   public.montant_offre_cents('proprietaire_direct',n,'mensuel')<greatest(n,1)::bigint*490 or
   public.montant_offre_cents('proprietaire_direct',n,'annuel')<greatest(n,1)::bigint*490*12 or
   public.montant_offre_cents('agence',n,'mensuel')<greatest(n,10)::bigint*490)
 then raise exception 'Grille refusée : montant inférieur au plancher de 4,90 par bien et par mois.'; end if;
end $plancher$;
