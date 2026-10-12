-- Brouillon privé, validation du document puis envoi explicite.
create table if not exists public.artisan_profils_documents (
  artisan_id uuid primary key references public.artisans(id) on delete cascade,
  adresse text not null default '' check (length(adresse)<=500),
  mentions text not null default '' check (length(mentions)<=3000),
  logo_data text check (logo_data is null or (length(logo_data)<=700000 and logo_data ~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$')),
  updated_at timestamptz not null default now()
);
alter table public.artisan_profils_documents enable row level security;
revoke all on public.artisan_profils_documents from anon, authenticated;
grant all on public.artisan_profils_documents to service_role;

create table if not exists public.artisan_devis_preparations (
  sollicitation_id uuid primary key references public.incident_sollicitations(id) on delete cascade,
  artisan_id uuid not null references public.artisans(id),
  reference_id uuid not null default gen_random_uuid(),
  revision integer not null default 1,
  saisie jsonb not null default '{}'::jsonb,
  proposition jsonb,
  entreprise jsonb,
  statut text not null default 'brouillon' check (statut in ('brouillon','valide','envoye')),
  pdf_path text, pdf_sha text, pdf_taille bigint,
  valide_le timestamptz,
  devis_id uuid unique references public.incident_devis(id),
  email_statut text not null default 'non_envoye' check (email_statut in ('non_envoye','envoye','echec')),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(saisie)='object' and octet_length(saisie::text)<=150000),
  check (statut='brouillon' or (pdf_path is not null and pdf_sha ~ '^[a-f0-9]{64}$' and pdf_taille>0 and entreprise is not null and valide_le is not null))
);
-- Les PDFs relus mais non envoyés restent dans un compartiment privé,
-- sans accès direct aux destinataires de l'organisation.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('devis-preparations','devis-preparations',false,10485760,array['application/pdf'])
on conflict(id) do nothing;
alter table public.artisan_devis_preparations add column if not exists pdf_bucket text not null default 'documents'
  check(pdf_bucket in ('documents','devis-preparations'));

create index if not exists artisan_devis_preparations_artisan_idx on public.artisan_devis_preparations(artisan_id);
alter table public.artisan_devis_preparations enable row level security;
revoke all on public.artisan_devis_preparations from anon, authenticated;
grant all on public.artisan_devis_preparations to service_role;

-- Les prix historiques ne sortent que sous forme d'agrégats anonymes.
-- Périmètre : même code de prestation, unité et catégorie d'incident,
-- travaux terminés, facture contrôlée, montant identique au devis, sans avenant.
create or replace function public.reperes_devis_realises(p_categorie text)
returns table(code text, nombre bigint, artisans bigint, moyenne_ht_cents bigint, plus_ancien date, plus_recent date)
language sql stable security definer set search_path='' as $$
  with lignes as (
    select p.artisan_id, iv.id intervention_id, iv.terminee_le,
      l->>'code' code, (l->>'prix_unitaire_ht_cents')::numeric prix
    from public.artisan_devis_preparations p
    join public.incident_devis d on d.id=p.devis_id
    join public.incident_interventions iv on iv.devis_id=d.id and iv.organization_id=d.organization_id
    join public.incidents i on i.id=iv.incident_id and i.organization_id=iv.organization_id
    join public.intervention_factures f on f.intervention_id=iv.id and f.organization_id=iv.organization_id
    cross join lateral jsonb_array_elements(p.saisie->'lignes') l
    where p.statut='envoye' and iv.statut='terminee' and f.validee_le is not null
      and f.montant_ttc_cents=d.montant_ttc_cents and i.categorie::text=p_categorie
      and iv.terminee_le >= now()-interval '24 months'
      and not exists(select 1 from public.devis_avenants a where a.intervention_id=iv.id)
      and l->>'code' in ('plomberie_heure','electricite_depannage_heure','peinture_pose_m2','peinture_fourniture_m2')
      and (l->>'prix_unitaire_ht_cents')::numeric > 0
  ), par_chantier as (
    select code, artisan_id, intervention_id, min(terminee_le) terminee_le, avg(prix) prix
    from lignes group by code,artisan_id,intervention_id
  )
  select code, count(*), count(distinct artisan_id), round(avg(prix))::bigint,
    min(terminee_le)::date,max(terminee_le)::date
  from par_chantier group by code
  having count(*)>=10 and count(distinct artisan_id)>=3;
$$;
revoke all on function public.reperes_devis_realises(text) from public,anon,authenticated;
grant execute on function public.reperes_devis_realises(text) to service_role;

-- Verrouiller le document validé au moment d'envoyer : le navigateur ne
-- fournit ni montant, ni chemin PDF, ni destinataire à cette fonction.
create or replace function public.envoyer_mon_devis_prepare(p_sollicitation uuid, p_revision integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare p public.artisan_devis_preparations%rowtype; s jsonb; v uuid;
begin
  if auth.uid() is null or public.mon_artisan_id() is null then raise exception 'Accès refusé'; end if;
  select * into p from public.artisan_devis_preparations where sollicitation_id=p_sollicitation and artisan_id=public.mon_artisan_id() for update;
  if not found then raise exception 'Validez votre devis avant de l’envoyer'; end if;
  if p.statut='envoye' then return p.devis_id; end if;
  if p.statut<>'valide' or p.revision<>p_revision then raise exception 'Le devis a changé. Validez à nouveau son PDF'; end if;
  s:=p.saisie;
  v:=public.deposer_devis_structure(p_sollicitation,s->'lignes',s->>'diagnostic',s->>'prestations',
    s->>'delai',s->>'duree',s->>'contraintes',s->>'observations',(s->>'valideJusquAu')::date,
    p.pdf_path,'application/pdf',p.pdf_taille,p.pdf_sha);
  update public.artisan_devis_preparations set statut='envoye',devis_id=v,pdf_bucket='documents',updated_at=now()
    where sollicitation_id=p_sollicitation;
  return v;
end; $$;
revoke all on function public.envoyer_mon_devis_prepare(uuid,integer) from public,anon;
grant execute on function public.envoyer_mon_devis_prepare(uuid,integer) to authenticated;
