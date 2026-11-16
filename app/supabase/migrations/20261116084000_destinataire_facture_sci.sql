-- Identité du client pour l’artisan de CETTE mission. La SCI doit détenir
-- seule le lot à la date de commande. Une indivision nécessite son propre justificatif.
create function public.sci_facturable_intervention(p_intervention uuid, p_siren text)
returns table(nom text, siren text, siege text)
language sql stable security definer set search_path = '' as $$
  with detenteurs as (
    select p.nom, p.siren, p.qualite, p.address_line1, p.postal_code, p.city, d.quote_part,
           count(*) over () as nombre
    from public.incident_interventions m
    join public.incidents i on i.id=m.incident_id and i.organization_id=m.organization_id
    join public.detentions d on d.lot_id=i.lot_id and d.organization_id=i.organization_id
      and d.date_debut <= (m.confiee_le at time zone 'Europe/Paris')::date
      and (d.date_fin is null or d.date_fin >= (m.confiee_le at time zone 'Europe/Paris')::date)
    join public.persons p on p.id=d.person_id and p.organization_id=d.organization_id
    where m.id=p_intervention and m.artisan_id=public.mon_artisan_id() and m.statut='terminee'
      and i.imputation='proprietaire'
  )
  select d.nom, d.siren, concat_ws(', ', d.address_line1, concat_ws(' ', d.postal_code, d.city))
  from detenteurs d
  where d.nombre=1 and d.quote_part=100 and d.siren=p_siren and p_siren ~ '^[0-9]{9}$'
    and public.qualite_bailleur_normalisee(d.qualite) in ('SCI','SCI familiale')
    and nullif(trim(d.nom),'') is not null and nullif(trim(d.address_line1),'') is not null
    and nullif(trim(d.postal_code),'') is not null and nullif(trim(d.city),'') is not null;
$$;
revoke all on function public.sci_facturable_intervention(uuid,text) from public, anon, service_role;
grant execute on function public.sci_facturable_intervention(uuid,text) to authenticated;

notify pgrst, 'reload schema';
