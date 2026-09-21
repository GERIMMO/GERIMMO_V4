-- Les mentions du PDF d'état des lieux doivent venir d'une saisie explicite.
-- Elles sont saisies avant signature puis figées avec le document.
alter table public.etats_des_lieux
  add column personnes_presentes text,
  add column detecteur_fumee_present boolean,
  add column detecteur_fumee_etat text,
  add column attestation_assurance_fournie boolean,
  add column adresse_restitution_depot text,
  add column observations text;


create or replace function public.proteger_mentions_edl_signe()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.etat = 'signe' and (
    new.personnes_presentes is distinct from old.personnes_presentes or
    new.detecteur_fumee_present is distinct from old.detecteur_fumee_present or
    new.detecteur_fumee_etat is distinct from old.detecteur_fumee_etat or
    new.attestation_assurance_fournie is distinct from old.attestation_assurance_fournie or
    new.adresse_restitution_depot is distinct from old.adresse_restitution_depot or
    new.observations is distinct from old.observations
  ) then raise exception 'État des lieux signé : les mentions sont figées';
  end if;
  return new;
end $$;


create trigger proteger_mentions_edl_signe_trg
before update on public.etats_des_lieux
for each row execute function public.proteger_mentions_edl_signe();

