-- Référentiel vérifiable 29.1–5, 29.18–24, 20.10. Support séparé du métier.
-- Aucun envoi externe ni modification automatique d'une évaluation.
create table public.retours_utilisateurs (
  id uuid primary key default gen_random_uuid(),
  auteur_id uuid not null references auth.users(id),
  cle_envoi uuid not null,
  organization_id uuid references public.organizations(id),
  artisan_id uuid references public.artisans(id),
  nature text not null check (nature in ('bug','idee','question','contestation')),
  titre text not null check (length(titre) between 5 and 160),
  description text not null check (length(description) between 15 and 6000),
  attendu text check (length(attendu) <= 3000),
  ecran text not null default '/' check (length(ecran) <= 300),
  action_origine text not null default 'navigation' check (action_origine in ('navigation','bouton','lien','formulaire','saisie')),
  etat text not null default 'nouveau' check (etat in ('nouveau','en_examen','en_cours','resolu','retenue','non_retenue','deja_couverte')),
  gravite text not null default 'N2' check (gravite in ('N1','N2','N3')),
  reponse text check (length(reponse) <= 6000),
  reexaminer_le date,
  publication_id uuid references public.publications(id),
  groupe_id uuid references public.retours_utilisateurs(id),
  version integer not null default 1,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique(auteur_id,cle_envoi),
  check (nature <> 'contestation' or (artisan_id is not null and organization_id is null)),
  check (etat <> 'non_retenue' or (nature='idee' and length(btrim(reponse))>0 and reexaminer_le is not null))
);
create table public.retours_historique (
  id uuid primary key default gen_random_uuid(),
  retour_id uuid not null references public.retours_utilisateurs(id),
  acteur_id uuid not null references auth.users(id),
  evenement text not null,
  message text not null,
  cree_le timestamptz not null default now()
);
create table public.retours_soutiens (
  retour_id uuid not null references public.retours_utilisateurs(id),
  account_id uuid not null references auth.users(id),
  organization_id uuid references public.organizations(id),
  cree_le timestamptz not null default now(),
  primary key(retour_id,account_id)
);
create index retours_auteur on public.retours_utilisateurs(auteur_id,cree_le desc);
create index retours_org on public.retours_utilisateurs(organization_id,nature);
create index retours_file on public.retours_utilisateurs(etat,cree_le);
create index retours_trace on public.retours_historique(retour_id,cree_le);

alter table public.retours_utilisateurs enable row level security;
alter table public.retours_historique enable row level security;
alter table public.retours_soutiens enable row level security;
revoke all on public.retours_utilisateurs,public.retours_historique,public.retours_soutiens from public,anon,authenticated;
grant select on public.retours_utilisateurs,public.retours_historique,public.retours_soutiens to authenticated;

-- Aucun identifiant de dossier, nom, paramètre d'URL ni fragment dans la
-- capture automatique. Liste fermée des segments statiques connus.
create function public.ecran_support_sans_donnees(p_ecran text)
returns text language sql immutable set search_path='' as $$
  select '/' || coalesce(string_agg(case when segment = any(array[
    'agence','admin','artisan','locataire','espaces','parc','baux','documents',
    'personnes','incidents','demandes','logement','loyers','comptabilite','fiscal',
    'agenda','alertes','messages','contact','profil','administration','abonnement',
    'missions','devis','attestations','entreprise','note','edl','compte-rendu',
    'bilan','creneaux','nouveau','nouvelle','import','organisations','publications',
    'journaux','retours','assistance','idees','securite','parametres'
  ]) then segment else '[dossier]' end,'/' order by rang),'')
  from unnest(string_to_array(split_part(split_part(left(coalesce(p_ecran,''),2000),'?',1),'#',1),'/'))
    with ordinality x(segment,rang) where segment<>'' and rang<=12;
$$;
revoke all on function public.ecran_support_sans_donnees(text) from public,anon;
grant execute on function public.ecran_support_sans_donnees(text) to authenticated;

create function public.peut_lire_retour(p_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.retours_utilisateurs r where r.id=p_id and (
    r.auteur_id=(select auth.uid()) or (select public.is_super_admin()) or
    (r.nature<>'contestation' and exists(select 1 from public.memberships m
      where m.account_id=(select auth.uid()) and m.organization_id=r.organization_id and m.status='active'
      and (r.nature='idee' or m.role='admin_agence')))
  ));
$$;
revoke all on function public.peut_lire_retour(uuid) from public,anon;
grant execute on function public.peut_lire_retour(uuid) to authenticated;
create policy retours_lecture on public.retours_utilisateurs for select to authenticated using (public.peut_lire_retour(id));
create policy retours_trace_lecture on public.retours_historique for select to authenticated using (public.peut_lire_retour(retour_id));
create policy retours_soutiens_lecture on public.retours_soutiens for select to authenticated using (public.peut_lire_retour(retour_id));

create function public.soumettre_retour(p_cle uuid,p_nature text,p_titre text,p_description text,p_attendu text,p_ecran text,p_org uuid default null,p_action text default 'navigation')
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_artisan uuid; v_auteur uuid := auth.uid();
begin
  if v_auteur is null then raise exception 'Connectez-vous pour envoyer une demande'; end if;
  -- Le même envoi ne crée pas deux demandes, même après une réponse perdue.
  perform pg_advisory_xact_lock(hashtextextended(v_auteur::text,45));
  select id into v_id from public.retours_utilisateurs where auteur_id=v_auteur and cle_envoi=p_cle;
  if v_id is not null then return v_id; end if;
  if p_action is null or p_action not in ('navigation','bouton','lien','formulaire','saisie') then p_action := 'navigation'; end if;
  if p_cle is null or p_nature is null or p_nature not in ('bug','idee','question','contestation') then raise exception 'Choisissez le type de demande'; end if;
  if length(btrim(coalesce(p_titre,''))) not between 5 and 160 or length(btrim(coalesce(p_description,''))) not between 15 and 6000 then
    raise exception 'Précisez un titre et une description suffisamment détaillée'; end if;
  if length(coalesce(p_attendu,''))>3000 then raise exception 'Le résultat attendu est trop long'; end if;
  if p_nature='bug' and length(btrim(coalesce(p_attendu,'')))<5 then raise exception 'Indiquez le résultat attendu'; end if;
  if p_org is not null and not exists(select 1 from public.memberships where account_id=v_auteur and organization_id=p_org and status='active') then
    raise exception 'Cet espace ne vous est pas accessible pour cette demande'; end if;
  if p_nature='contestation' then
    select id into v_artisan from public.artisans where account_id=v_auteur;
    if v_artisan is null then raise exception 'La contestation est réservée au titulaire du compte artisan'; end if;
    p_org := null;
  end if;
  if (select count(*) from public.retours_utilisateurs where auteur_id=v_auteur and cree_le>now()-interval '1 hour')>=20 then
    raise exception 'Plusieurs demandes ont déjà été reçues. Réessayez dans une heure'; end if;
  v_id := gen_random_uuid();
  insert into public.retours_utilisateurs(id,auteur_id,cle_envoi,organization_id,artisan_id,nature,titre,description,attendu,ecran,groupe_id,action_origine)
    values(v_id,v_auteur,p_cle,p_org,v_artisan,p_nature,btrim(p_titre),btrim(p_description),nullif(btrim(p_attendu),''),public.ecran_support_sans_donnees(p_ecran),v_id,p_action);
  insert into public.retours_historique(retour_id,acteur_id,evenement,message)
    values(v_id,v_auteur,'creation','Demande reçue par la supervision Gerimmo.');
  if p_nature='idee' then insert into public.retours_soutiens(retour_id,account_id,organization_id) values(v_id,v_auteur,p_org); end if;
  return v_id;
end;
$$;
revoke all on function public.soumettre_retour(uuid,text,text,text,text,text,uuid,text) from public,anon;
grant execute on function public.soumettre_retour(uuid,text,text,text,text,text,uuid,text) to authenticated;

create function public.soutenir_idee(p_retour uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v public.retours_utilisateurs;
begin
  if auth.uid() is null or not public.peut_lire_retour(p_retour) then raise exception 'Idée inaccessible'; end if;
  select * into v from public.retours_utilisateurs where id=p_retour for update;
  if v.nature<>'idee' then raise exception 'Seules les idées peuvent être soutenues'; end if;
  insert into public.retours_soutiens(retour_id,account_id,organization_id) values(v.id,auth.uid(),v.organization_id)
    on conflict do nothing;
end;
$$;
revoke all on function public.soutenir_idee(uuid) from public,anon;
grant execute on function public.soutenir_idee(uuid) to authenticated;

create function public.traiter_retour(p_retour uuid,p_version integer,p_etat text,p_gravite text,p_reponse text,p_reexamen date default null)
returns void language plpgsql security definer set search_path='' as $$
declare v public.retours_utilisateurs; v_publication uuid;
begin
  if not public.is_super_admin() then raise exception 'Décision réservée à la supervision Gerimmo'; end if;
  select * into v from public.retours_utilisateurs where id=p_retour for update;
  if not found then raise exception 'Demande introuvable'; end if;
  if v.version is distinct from p_version then raise exception 'Cette demande a changé. Rechargez-la avant de décider'; end if;
  if p_gravite is null or p_gravite not in ('N1','N2','N3') then raise exception 'Choisissez une gravité'; end if;
  if p_etat is null or not (p_etat=any(case when v.nature='idee' then array['en_examen','retenue','non_retenue','deja_couverte'] else array['en_examen','en_cours','resolu'] end)) then
    raise exception 'Choisissez un état adapté à cette demande'; end if;
  if length(btrim(coalesce(p_reponse,''))) not between 5 and 6000 then raise exception 'Une réponse compréhensible est obligatoire'; end if;
  if p_etat='non_retenue' and (p_reexamen is null or p_reexamen<=current_date) then raise exception 'Précisez une date future de réexamen'; end if;
  v_publication := v.publication_id;
  if p_etat='retenue' and v_publication is null then
    -- Le texte privé n'est jamais recopié dans le journal public. La rédaction
    -- doit expliquer le besoin sans identifier l'auteur ni son organisation.
    insert into public.publications(periode,statut,titre,corps,auteur_account_id)
      values('idee-'||v.id,'brouillon','Une amélioration issue de vos idées',
        '[[à compléter : le besoin retenu, reformulé sans donnée personnelle ]]'||E'\n\n'||
        '[[à compléter : les personnes concernées, la solution prévue et son calendrier vérifié ]]',auth.uid())
      returning id into v_publication;
  end if;
  update public.retours_utilisateurs set etat=p_etat,gravite=p_gravite,reponse=btrim(p_reponse),
    reexaminer_le=case when p_etat='non_retenue' then p_reexamen else null end,
    publication_id=v_publication,
    version=version+1,modifie_le=now() where id=v.id;
  insert into public.retours_historique(retour_id,acteur_id,evenement,message)
    values(v.id,auth.uid(),p_etat,btrim(p_reponse));
  perform public.log_sa_access(v.organization_id,'decision_retour',jsonb_build_object('retour_id',v.id,'etat',p_etat,'gravite',p_gravite));
end;
$$;
revoke all on function public.traiter_retour(uuid,integer,text,text,text,date) from public,anon;
grant execute on function public.traiter_retour(uuid,integer,text,text,text,date) to authenticated;

-- Rapprocher les idées sans divulguer leurs textes entre organisations.
create function public.regrouper_idees(p_source uuid,p_cible uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_source uuid;v_cible uuid;
begin
  if not public.is_super_admin() then raise exception 'Regroupement réservé à la supervision'; end if;
  if p_source=p_cible then raise exception 'Choisissez deux idées différentes'; end if;
  perform id from public.retours_utilisateurs where id in(p_source,p_cible) order by id for update;
  select groupe_id into v_source from public.retours_utilisateurs where id=p_source and nature='idee';
  select groupe_id into v_cible from public.retours_utilisateurs where id=p_cible and nature='idee';
  if v_source is null or v_cible is null then raise exception 'Deux idées sont nécessaires'; end if;
  update public.retours_utilisateurs set groupe_id=v_cible,version=version+1,modifie_le=now() where groupe_id=v_source;
  perform public.log_sa_access(null,'regroupement_idees',jsonb_build_object('source',p_source,'cible',p_cible));
end;
$$;
revoke all on function public.regrouper_idees(uuid,uuid) from public,anon;
grant execute on function public.regrouper_idees(uuid,uuid) to authenticated;

-- Classement global, avant pagination : aucune limite arbitraire de lignes
-- ne doit faire disparaître une idée ancienne soutenue par plusieurs agences.
create function public.file_retours_supervision(p_nature text default null,p_etat text default null,p_org uuid default null,p_page integer default 1)
returns table(retour jsonb,organisation text,soutiens bigint,organisations bigint,premiere timestamptz,total bigint)
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_super_admin() then raise exception 'Lecture réservée à la supervision'; end if;
  return query
  with scores as (
    select r.groupe_id,count(distinct s.account_id) nb_soutiens,
      count(distinct r.organization_id) nb_org,min(r.cree_le) premiere
    from public.retours_utilisateurs r left join public.retours_soutiens s on s.retour_id=r.id
    where r.nature='idee' group by r.groupe_id
  )
  select to_jsonb(r),o.name,coalesce(s.nb_soutiens,0),coalesce(s.nb_org,0),s.premiere,count(*) over()
  from public.retours_utilisateurs r left join public.organizations o on o.id=r.organization_id
    left join scores s on s.groupe_id=r.groupe_id
  where (p_nature is null or r.nature=p_nature) and (p_etat is null or r.etat=p_etat)
    and (p_org is null or r.organization_id=p_org)
  order by case when p_nature='idee' then coalesce(s.nb_org,0) end desc,
    case when p_nature='idee' then coalesce(s.nb_soutiens,0) end desc,
    case when p_nature='idee' then s.premiere end asc,r.cree_le desc,r.id
  limit 50 offset (least(greatest(coalesce(p_page,1),1),100000)-1)*50;
end;
$$;
revoke all on function public.file_retours_supervision(text,text,uuid,integer) from public,anon;
grant execute on function public.file_retours_supervision(text,text,uuid,integer) to authenticated;

create table public.retours_revues (
  mois date primary key,
  acteur_id uuid not null references auth.users(id),
  bilan text not null check(length(btrim(bilan)) between 15 and 6000),
  cree_le timestamptz not null default now(),
  check(mois=date_trunc('month',mois)::date)
);
alter table public.retours_revues enable row level security;
revoke all on public.retours_revues from public,anon,authenticated;
grant select on public.retours_revues to authenticated;
create policy revues_supervision on public.retours_revues for select to authenticated using(public.is_super_admin());

create function public.clore_revue_idees(p_bilan text)
returns void language plpgsql security definer set search_path='' as $$
declare v_mois date := date_trunc('month',now() at time zone 'Europe/Paris')::date;
begin
  if not public.is_super_admin() then raise exception 'Revue réservée à la supervision'; end if;
  if length(btrim(coalesce(p_bilan,''))) not between 15 and 6000 then raise exception 'Précisez le bilan de la revue'; end if;
  insert into public.retours_revues(mois,acteur_id,bilan) values(v_mois,auth.uid(),btrim(p_bilan)) on conflict do nothing;
  if found then perform public.log_sa_access(null,'revue_mensuelle_idees',jsonb_build_object('mois',v_mois)); end if;
end;
$$;
revoke all on function public.clore_revue_idees(text) from public,anon;
grant execute on function public.clore_revue_idees(text) to authenticated;

-- Le support doit rester disponible quand l'abonnement est suspendu :
-- l'utilisateur doit pouvoir signaler le blocage qui l'empêche de travailler.
-- Cette exception ne donne aucun droit supplémentaire sur les données métier.
do $$
declare v_sql text;v_ancre text := '''abonnements'', ''abonnement_evenements''';
begin
  v_sql := pg_get_functiondef('public.poser_gardes_abonnement()'::regprocedure);
  if strpos(v_sql,v_ancre)=0 then raise exception 'Liste des exceptions abonnement inattendue'; end if;
  execute replace(v_sql,v_ancre,v_ancre||', ''retours_utilisateurs'', ''retours_soutiens''');
end;
$$;
select public.poser_gardes_abonnement();
