-- Sprint 3 (incrément 4) — Attestation d'assurance : échéance + alertes
-- Source : wiki/concepts/Dossier locataire (module 0b, cycle annuel critique).
-- L'attestation est une pièce (document type 'attestation_assurance') qui EXPIRE.
-- Seuils d'alerte : J-30 (locataire, rappel) / J-15 (agence, relance) /
-- J+0 (agence, défaut constaté) / J+15 (agence, motif de résiliation).
-- Chaque alerte est conservée comme preuve (RM-0b.6.2) ; le défaut alerte mais
-- ne verrouille rien (RM-0b.6.4).

alter table public.documents add column expire_le date;

create function public.generer_alertes_assurance()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_att record;
  v_seuil text;
  v_criticite public.alerte_criticite;
  v_crees int := 0;
begin
  -- Réservé au cron (pas de session) et au super admin
  if (select auth.uid()) is not null and not public.is_super_admin() then
    raise exception 'generer_alertes_assurance: reserve au cron et au super admin';
  end if;

  for v_att in
    select d.id as document_id, d.organization_id, d.expire_le,
           dl.entite_id as person_id, p.nom as person_nom
    from public.documents d
    join public.document_liens dl
      on dl.document_id = d.id and dl.entite = 'personne'
    join public.persons p on p.id = dl.entite_id
    where d.type = 'attestation_assurance'
      and d.purged_at is null
      and d.expire_le is not null
      and d.expire_le <= current_date + 30
      -- version courante uniquement (non remplacée)
      and not exists (select 1 from public.documents d2 where d2.remplace_id = d.id)
  loop
    v_seuil := case
      when v_att.expire_le <= current_date - 15 then 'J+15'
      when v_att.expire_le <= current_date then 'J+0'
      when v_att.expire_le <= current_date + 15 then 'J-15'
      else 'J-30'
    end;
    v_criticite := case v_seuil
      when 'J-30' then 'informative'::public.alerte_criticite
      when 'J-15' then 'normale'::public.alerte_criticite
      else 'critique'::public.alerte_criticite
    end;

    if not exists (
      select 1 from public.alerts a
      where a.type = 'assurance_expiration'
        and a.details->>'document_id' = v_att.document_id::text
        and a.details->>'seuil' = v_seuil
    ) then
      insert into public.alerts (organization_id, type, criticite, titre, details, echeance)
      values (
        v_att.organization_id, 'assurance_expiration', v_criticite,
        format('Assurance habitation — %s : %s', v_att.person_nom,
          case v_seuil
            when 'J-30' then format('expire le %s (rappel locataire)', to_char(v_att.expire_le, 'DD/MM/YYYY'))
            when 'J-15' then format('expire le %s (relance à faire)', to_char(v_att.expire_le, 'DD/MM/YYYY'))
            when 'J+0' then 'défaut d''assurance constaté'
            else 'défaut d''assurance persistant (motif possible de résiliation)'
          end),
        jsonb_build_object('document_id', v_att.document_id, 'person_id', v_att.person_id, 'seuil', v_seuil),
        v_att.expire_le
      );
      v_crees := v_crees + 1;
    end if;
  end loop;

  return v_crees;
end;
$$;
