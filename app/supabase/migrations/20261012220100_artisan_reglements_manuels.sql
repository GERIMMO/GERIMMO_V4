-- DEC-ART002 : registre privé, déclaratif, sans banque ni confirmation propriétaire.
create table public.artisan_reglements (
 id uuid primary key default gen_random_uuid(), artisan_id uuid not null references public.artisans(id),
 facture_gerimmo_id uuid references public.intervention_factures(id), facture_externe_id uuid,
 montant_cents bigint not null check(montant_cents between 1 and 100000000000), date_reglement date not null,
 moyen text not null check(moyen in ('virement','cheque','especes','carte','autre')), reference text not null check(length(btrim(reference)) between 1 and 200),
 preuve_id uuid not null, auteur uuid not null references public.accounts(id), created_at timestamptz not null default clock_timestamp(),
 annule_le timestamptz, annule_par uuid references public.accounts(id), annulation_motif text, annulation_preuve_id uuid,
 check(num_nonnulls(facture_gerimmo_id,facture_externe_id)=1),
 check((annule_le is null and annule_par is null and annulation_motif is null and annulation_preuve_id is null) or (annule_le is not null and annule_par is not null and length(btrim(annulation_motif))>=3 and annulation_preuve_id is not null)),
 foreign key(facture_externe_id,artisan_id) references public.artisan_factures_externes(id,artisan_id),
 foreign key(preuve_id,artisan_id) references public.artisan_pieces_privees(id,artisan_id),
 foreign key(annulation_preuve_id,artisan_id) references public.artisan_pieces_privees(id,artisan_id)
);
alter table public.artisan_reglements enable row level security;
revoke all on public.artisan_reglements from public,anon,authenticated;
grant select on public.artisan_reglements to authenticated;
create policy lecture_artisan_reel on public.artisan_reglements for select to authenticated using(artisan_id=(select public.artisan_identite_reelle()));
do $$ declare c record; begin
 for c in select conname,string_agg(quote_ident(a.attname),',' order by k.ord) as cols from pg_constraint f cross join lateral unnest(f.conkey) with ordinality k(num,ord) join pg_attribute a on a.attrelid=f.conrelid and a.attnum=k.num where f.conrelid='public.artisan_reglements'::regclass and f.contype='f' group by conname loop
  execute format('create index %I on public.artisan_reglements(%s)',left(c.conname,50)||'_idx',c.cols);
 end loop;
end $$;
create function public.artisan_reglement_ecrire(p_action text,p_origine text,p_facture uuid,p_donnees jsonb,p_cle uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare a uuid:=public.exiger_artisan_reel(); total bigint; verse bigint; old public.artisan_evenements_prives; r public.artisan_reglements; ident uuid; empreinte text;
begin
 if (select auth.uid()) is null or a is null or not public.artisan_module_actif('reglements') then raise exception 'Règlements manuels : saisie désactivée'; end if;
 if p_cle is null or p_donnees is null or jsonb_typeof(p_donnees)<>'object' or octet_length(p_donnees::text)>10000 then raise exception 'Demande invalide'; end if;
 -- Sérialisation de tous les règlements et annulations de cet artisan, y compris deux fenêtres.
 perform pg_advisory_xact_lock(hashtextextended(a::text,0));
 empreinte:=md5(jsonb_build_array(p_action,p_origine,p_facture,p_donnees)::text);
 select * into old from public.artisan_evenements_prives where artisan_id=a and cle=p_cle;
 if found then if old.empreinte_requete<>empreinte then raise exception 'Cette clé a déjà servi pour une autre demande'; end if; return old.objet_id; end if;
 if p_origine='gerimmo' then select montant_ttc_cents into total from public.intervention_factures where id=p_facture and artisan_id=a for update;
 elsif p_origine='externe' then select montant_ttc_cents into total from public.artisan_factures_externes where id=p_facture and artisan_id=a for update;
 else raise exception 'Origine inconnue'; end if;
 if total is null then raise exception 'Accès refusé'; end if;
 if p_action='reglement' then
  select coalesce(sum(montant_cents),0) into verse from public.artisan_reglements where artisan_id=a and annule_le is null and (facture_gerimmo_id=p_facture or facture_externe_id=p_facture);
  if (p_donnees->>'montant_cents')::bigint is null or (p_donnees->>'montant_cents')::bigint<=0 or (p_donnees->>'montant_cents')::bigint>total-verse then raise exception 'Le montant doit être positif et ne pas dépasser le solde'; end if;
  if (p_donnees->>'date')::date is null or (p_donnees->>'date')::date>current_date then raise exception 'Indiquez la date réelle du règlement, sans date future'; end if;
  insert into public.artisan_reglements(artisan_id,facture_gerimmo_id,facture_externe_id,montant_cents,date_reglement,moyen,reference,preuve_id,auteur)
   values(a,case when p_origine='gerimmo' then p_facture end,case when p_origine='externe' then p_facture end,(p_donnees->>'montant_cents')::bigint,(p_donnees->>'date')::date,p_donnees->>'moyen',btrim(p_donnees->>'reference'),(p_donnees->>'piece_id')::uuid,(select auth.uid())) returning id into ident;
 elsif p_action='annuler_reglement' then
  select * into r from public.artisan_reglements where id=(p_donnees->>'reglement_id')::uuid and artisan_id=a and (facture_gerimmo_id=p_facture or facture_externe_id=p_facture) for update;
  if not found then raise exception 'Accès refusé'; end if;
  if r.annule_le is not null then raise exception 'Ce règlement est déjà annulé'; end if;
  if length(btrim(coalesce(p_donnees->>'motif',''))) not between 3 and 4000 then raise exception 'Expliquez l’annulation'; end if;
  if (p_donnees->>'piece_id')::uuid is null then raise exception 'Joignez le justificatif de correction'; end if;
  update public.artisan_reglements set annule_le=clock_timestamp(),annule_par=(select auth.uid()),annulation_motif=p_donnees->>'motif',annulation_preuve_id=(p_donnees->>'piece_id')::uuid where id=r.id;
  ident:=r.id;
 else raise exception 'Action inconnue'; end if;
 insert into public.artisan_evenements_prives(artisan_id,objet_id,action,details,cle,empreinte_requete,auteur) values(a,ident,p_action,p_donnees||jsonb_build_object('facture_id',p_facture,'origine',p_origine),p_cle,empreinte,(select auth.uid()));
 return ident;
end $$;
revoke all on function public.artisan_reglement_ecrire(text,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.artisan_reglement_ecrire(text,text,uuid,jsonb,uuid) to authenticated;

-- Une lecture complète/export reste disponible à son artisan réel quand la saisie est désactivée.
create function public.mon_activite_artisan_privee() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=public.artisan_identite_reelle(); begin
 if (select auth.uid()) is null or a is null then raise exception 'Accès refusé'; end if;
 return jsonb_build_object(
 'clients',coalesce((select jsonb_agg(to_jsonb(c) order by c.nom) from public.artisan_clients c where c.artisan_id=a),'[]'),
 'chantiers',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at desc) from public.artisan_chantiers c where c.artisan_id=a),'[]'),
 'devis',coalesce((select jsonb_agg(to_jsonb(c) order by c.version desc) from public.artisan_devis_externes c where c.artisan_id=a),'[]'),
 'rendez_vous',coalesce((select jsonb_agg(to_jsonb(c) order by c.debut) from public.artisan_rendez_vous c where c.artisan_id=a),'[]'),
 'factures',coalesce((select jsonb_agg(v) from (
  select jsonb_build_object('id',f.id,'origine','externe','chantier_id',f.chantier_id,'numero',f.numero,'montant_ttc_cents',f.montant_ttc_cents,'piece_id',f.piece_id,'created_at',f.created_at,'client',c.nom) v from public.artisan_factures_externes f join public.artisan_chantiers h on h.id=f.chantier_id join public.artisan_clients c on c.id=h.client_id where f.artisan_id=a
  union all select jsonb_build_object('id',f.id,'origine','gerimmo','intervention_id',f.intervention_id,'numero',f.numero,'montant_ttc_cents',f.montant_ttc_cents,'document_id',f.document_id,'created_at',f.deposee_le,'client',o.name) from public.intervention_factures f join public.organizations o on o.id=f.organization_id where f.artisan_id=a
 ) q),'[]'),
 'pieces',coalesce((select jsonb_agg(to_jsonb(c)) from public.artisan_pieces_privees c where c.artisan_id=a),'[]'),
 'reglements',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from public.artisan_reglements c where c.artisan_id=a),'[]'),
 'evenements',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from public.artisan_evenements_prives c where c.artisan_id=a),'[]'),
 'activation',jsonb_build_object('clients',public.artisan_module_actif('clients'),'reglements',public.artisan_module_actif('reglements')));
end $$;
revoke all on function public.mon_activite_artisan_privee() from public,anon;
grant execute on function public.mon_activite_artisan_privee() to authenticated;
