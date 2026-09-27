-- Audit métier du 27/09 — le forfait de charges était accepté sur un bail nu
-- hors colocation.
--
-- Wiki [[Régularisation des charges]] (RM-3.9.8 et encadré) : « pour un bail
-- vide, le forfait n'est possible qu'en colocation — le formulaire officiel le
-- dit en toutes lettres (modèle de bail non meublé, section IV.B) ; en meublé,
-- le forfait est libre ». Le contrôle manquait en base comme à la saisie.
--
-- Contrôle à l'écriture du mode de charges ou du type : un bail existant qui
-- porterait déjà ce couple n'est pas réécrit (il reste signalé au rapport),
-- mais on ne peut plus en créer ni y revenir.
--
-- Idempotent : create or replace, trigger recréé.

create or replace function public.controler_forfait_charges_bail()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if new.type = 'nu'::public.bail_type and new.charges_mode = 'forfait'
     and (tg_op = 'INSERT'
          or new.charges_mode is distinct from old.charges_mode
          or new.type is distinct from old.type) then
    raise exception 'Charges au forfait impossibles sur un bail nu : le forfait n''est ouvert qu''à la colocation ou au meublé (contrat type, section IV.B). Choisissez des provisions régularisables';
  end if;
  return new;
end;
$function$;

drop trigger if exists baux_forfait_charges on public.baux;
create trigger baux_forfait_charges
  before insert or update of type, charges_mode on public.baux
  for each row execute function public.controler_forfait_charges_bail();

revoke execute on function public.controler_forfait_charges_bail() from public, anon, authenticated;
select public.fermer_fonctions_a_anon();
