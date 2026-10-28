-- Configuration opérateur, uniquement après contrat AR24 et vérification de l’expéditeur.
-- Aucun tarif ni expéditeur global implicite ; sandbox et production restent séparés.
create table if not exists public.connexions_ar24 (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 environnement text not null check(environnement in ('sandbox','production')),
 expediteur_id bigint not null check(expediteur_id>0 and expediteur_id<9007199254740991),
 tarif_ttc_centimes integer not null check(tarif_ttc_centimes>=0),
 actif boolean not null default false,
 verifie_le timestamptz not null default now()
);
create table if not exists public.recommandes_ar24 (
 id uuid primary key, organization_id uuid not null references public.organizations(id), bail_id uuid not null,
 personne_id uuid not null, auteur uuid references auth.users(id),
 environnement text not null check(environnement in ('sandbox','production')),
 expediteur_id bigint not null, tarif_ttc_centimes integer not null check(tarif_ttc_centimes>=0),
 destinataire jsonb not null, contenu text not null check(length(contenu) between 1 and 500000),
 empreinte text not null check(empreinte ~ '^[a-f0-9]{64}$'), dette jsonb not null,
 delai integer not null check(delai between 1 and 90),
 statut text not null default 'prepare' check(statut in ('prepare','en_cours','a_authentifier','en_attente','envoye','recu','refuse','non_reclame','echec','a_verifier')),
 ar24_id bigint, preuves jsonb not null default '[]',
 cree_le timestamptz not null default now(), confirme_le timestamptz, actualise_le timestamptz not null default now(),
 foreign key(bail_id,organization_id) references public.baux(id,organization_id),
 foreign key(personne_id,organization_id) references public.persons(id,organization_id)
);
alter table public.recommandes_ar24 add column if not exists echec_definitif_confirme_le timestamptz;
alter table public.recommandes_ar24 add column if not exists echec_reference_verification text;
alter table public.recommandes_ar24 add column if not exists remplace_id uuid references public.recommandes_ar24(id);
-- La première commande reste unique pour cette dette. Chaque reprise a une seule descendante,
-- et n'est créée que sous le verrou du bail après attestation d'échec définitif.
drop index if exists public.recommandes_ar24_dette_unique;
create unique index recommandes_ar24_dette_unique on public.recommandes_ar24(bail_id,md5(dette::text)) where remplace_id is null;
create unique index if not exists recommandes_ar24_reprise_unique on public.recommandes_ar24(remplace_id) where remplace_id is not null;
create index if not exists recommandes_ar24_organisation on public.recommandes_ar24(organization_id,bail_id,cree_le desc);
create unique index if not exists recommandes_ar24_reference_unique on public.recommandes_ar24(environnement,ar24_id) where ar24_id is not null;
alter table public.connexions_ar24 enable row level security;
alter table public.recommandes_ar24 enable row level security;
revoke all on public.connexions_ar24,public.recommandes_ar24 from public,anon,authenticated;
grant select on public.connexions_ar24,public.recommandes_ar24 to authenticated;
grant all on public.connexions_ar24,public.recommandes_ar24 to service_role;
drop policy if exists connexion_ar24_lecture on public.connexions_ar24;
create policy connexion_ar24_lecture on public.connexions_ar24 for select to authenticated using(organization_id in(select public.org_ids_avec_roles(array['proprietaire_direct','admin_agence','agent']::public.membership_role[])));
drop policy if exists recommande_ar24_lecture on public.recommandes_ar24;
create policy recommande_ar24_lecture on public.recommandes_ar24 for select to authenticated using(organization_id in(select public.org_ids_avec_roles(array['proprietaire_direct','admin_agence','agent']::public.membership_role[])));
-- Lecture sous RLS, utilisée aussi pour figer toutes les échéances, pas seulement le total.
create or replace function public.dette_recommande_ar24(p_bail uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('total_centimes',coalesce(sum(round((e.montant_du-e.montant_couvert)*100)),0),'echeances',coalesce(jsonb_agg(jsonb_build_object('id',e.appel_id,'date',e.date_echeance,'du',e.montant_du,'couvert',e.montant_couvert) order by e.date_echeance,e.appel_id),'[]'::jsonb))
 from public.etat_loyers_bail(p_bail) e where e.date_echeance<public.aujourdhui_paris() and e.montant_du>e.montant_couvert;
$$;
revoke all on function public.dette_recommande_ar24(uuid) from public,anon;
grant execute on function public.dette_recommande_ar24(uuid) to authenticated,service_role;
drop function if exists public.preparer_recommande_ar24(uuid,uuid,uuid,text,text,jsonb,integer,text);
create or replace function public.preparer_recommande_ar24(p_id uuid,p_org uuid,p_bail uuid,p_contenu text,p_empreinte text,p_dette jsonb,p_delai integer,p_environnement text,p_remplace uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.baux; p public.persons; c public.connexions_ar24; r public.recommandes_ar24; d jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.memberships where account_id=auth.uid() and organization_id=p_org and status='active' and role in('proprietaire_direct','admin_agence','agent')) or not coalesce(public.org_ecriture_ouverte(p_org),false) then raise exception 'Accès refusé.'; end if;
 select * into b from public.baux where id=p_bail and organization_id=p_org for update;
 if not found then raise exception 'Bail inaccessible.'; end if;
 -- Une issue incertaine ne peut jamais être contournée en préparant un nouveau courrier.
 select * into r from public.recommandes_ar24 x where bail_id=p_bail and
  (statut in('en_cours','a_verifier','a_authentifier','en_attente') or
   (statut='echec' and (echec_definitif_confirme_le is null or x.id is distinct from p_remplace)
    and not exists(select 1 from public.recommandes_ar24 enfant where enfant.remplace_id=x.id))) order by cree_le desc limit 1;
 if found then return to_jsonb(r); end if;
 if p_remplace is not null then
  select * into r from public.recommandes_ar24 where id=p_remplace and organization_id=p_org and bail_id=p_bail for update;
  if not found or r.statut<>'echec' or r.echec_definitif_confirme_le is null or r.ar24_id is null
   or exists(select 1 from jsonb_array_elements(r.preuves) preuve where preuve->>'type' in('envoi','reception','refus','negligence')) then raise exception 'L’échec définitif doit être vérifié avant de préparer une nouvelle lettre.'; end if;
  select * into r from public.recommandes_ar24 where remplace_id=p_remplace;
  if found and (r.statut<>'prepare' or r.id<>p_id) then return to_jsonb(r); end if;
 end if;
 select * into c from public.connexions_ar24 where organization_id=p_org and actif and environnement=p_environnement;
 if not found then raise exception 'L’envoi électronique n’est pas configuré pour cet espace.'; end if;
 select * into p from public.persons where id=b.locataire_principal and organization_id=p_org;
 if p.id is null or coalesce(btrim(p.prenom),'')='' or coalesce(btrim(p.nom),'')='' or coalesce(btrim(p.email),'')='' then raise exception 'Complétez l’identité et l’adresse e-mail du locataire.'; end if;
 if not exists(select 1 from public.consentements_documents_locataire where organization_id=p_org and person_id=p.id and recommandes_electroniques and adresse_email=lower(btrim(p.email))) then raise exception 'Le locataire doit accepter les recommandés électroniques depuis ses documents.'; end if;
 d:=public.dette_recommande_ar24(p_bail);
 if d<>p_dette or (d->>'total_centimes')::numeric<=0 then raise exception 'Les règlements ont changé. Actualisez le courrier.'; end if;
 select * into r from public.recommandes_ar24 where bail_id=p_bail and id is distinct from p_remplace and (statut<>'echec' or echec_definitif_confirme_le is null) and (dette=d or statut='prepare') order by cree_le desc limit 1;
 if found and (r.statut<>'prepare' or r.id<>p_id) then return to_jsonb(r); end if;
 insert into public.recommandes_ar24(id,organization_id,bail_id,personne_id,auteur,environnement,expediteur_id,tarif_ttc_centimes,destinataire,contenu,empreinte,dette,delai,remplace_id)
 values(p_id,p_org,p_bail,p.id,auth.uid(),c.environnement,c.expediteur_id,c.tarif_ttc_centimes,jsonb_build_object('email',lower(btrim(p.email)),'prenom',btrim(p.prenom),'nom',btrim(p.nom)),p_contenu,p_empreinte,d,p_delai,p_remplace)
 on conflict(id) do update set destinataire=excluded.destinataire,personne_id=excluded.personne_id,environnement=excluded.environnement,expediteur_id=excluded.expediteur_id,tarif_ttc_centimes=excluded.tarif_ttc_centimes,contenu=excluded.contenu,empreinte=excluded.empreinte,dette=excluded.dette,delai=excluded.delai,actualise_le=now()
 where recommandes_ar24.statut='prepare' and recommandes_ar24.organization_id=p_org and recommandes_ar24.bail_id=p_bail and recommandes_ar24.remplace_id is not distinct from excluded.remplace_id
 returning * into r;
 if r.id is null then raise exception 'Cette référence appartient déjà à une autre préparation.'; end if;
 return to_jsonb(r);
end $$;
revoke all on function public.preparer_recommande_ar24(uuid,uuid,uuid,text,text,jsonb,integer,text,uuid) from public,anon;
grant execute on function public.preparer_recommande_ar24(uuid,uuid,uuid,text,text,jsonb,integer,text,uuid) to authenticated;
create or replace function public.reserver_recommande_ar24(p_org uuid,p_id uuid,p_empreinte text,p_email text,p_tarif integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.recommandes_ar24; b public.baux; p public.persons;
begin
 if auth.uid() is null or not exists(select 1 from public.memberships where account_id=auth.uid() and organization_id=p_org and status='active' and role in('proprietaire_direct','admin_agence','agent')) or not coalesce(public.org_ecriture_ouverte(p_org),false) then raise exception 'Accès refusé.'; end if;
 -- Même ordre de verrous que les encaissements et la préparation : bail, puis commande.
 select baux.* into b from public.baux join public.recommandes_ar24 commande on commande.bail_id=baux.id where commande.id=p_id and commande.organization_id=p_org for update of baux;
 if not found then raise exception 'Courrier inaccessible.'; end if;
 select * into r from public.recommandes_ar24 where id=p_id and organization_id=p_org for update;
 if r.statut<>'prepare' then return jsonb_build_object('reserve',false,'courrier',to_jsonb(r)); end if;
 if r.remplace_id is not null and not exists(select 1 from public.recommandes_ar24 ancien where ancien.id=r.remplace_id and ancien.organization_id=p_org and ancien.bail_id=r.bail_id and ancien.statut='echec' and ancien.echec_definitif_confirme_le is not null and ancien.ar24_id is not null
  and not exists(select 1 from jsonb_array_elements(ancien.preuves) preuve where preuve->>'type' in('envoi','reception','refus','negligence'))) then raise exception 'La vérification du précédent courrier a changé. Aucun nouvel envoi.'; end if;
 if r.empreinte is distinct from p_empreinte or r.destinataire->>'email' is distinct from p_email or r.tarif_ttc_centimes is distinct from p_tarif then raise exception 'Relisez le destinataire, le courrier et son coût avant de confirmer.'; end if;
 if r.actualise_le<now()-interval '30 minutes' or r.dette<>public.dette_recommande_ar24(r.bail_id) then raise exception 'La préparation a expiré ou les règlements ont changé. Actualisez le courrier.'; end if;
 select * into p from public.persons where id=b.locataire_principal and organization_id=p_org;
 if p.id is distinct from r.personne_id or jsonb_build_object('email',lower(btrim(p.email)),'prenom',btrim(p.prenom),'nom',btrim(p.nom))<>r.destinataire then raise exception 'Le destinataire a changé. Actualisez le courrier.'; end if;
 if not exists(select 1 from public.consentements_documents_locataire where organization_id=p_org and person_id=r.personne_id and recommandes_electroniques and adresse_email=p_email) then raise exception 'Le destinataire n’a plus donné son accord pour les recommandés électroniques.'; end if;
 if not exists(select 1 from public.connexions_ar24 where organization_id=p_org and actif and environnement=r.environnement and expediteur_id=r.expediteur_id and tarif_ttc_centimes=r.tarif_ttc_centimes) then raise exception 'La configuration ou le tarif a changé. Actualisez le courrier.'; end if;
 update public.recommandes_ar24 set statut='en_cours',confirme_le=now(),actualise_le=now() where id=p_id returning * into r;
 insert into public.audit_log(organization_id,account_id,action,details) values(p_org,auth.uid(),'recommande_ar24_confirme',jsonb_build_object('courrier_id',r.id,'bail_id',r.bail_id,'empreinte',r.empreinte,'tarif_ttc_centimes',r.tarif_ttc_centimes,'destinataire',r.destinataire->>'email'));
 return jsonb_build_object('reserve',true,'courrier',to_jsonb(r));
end $$;
revoke all on function public.reserver_recommande_ar24(uuid,uuid,text,text,integer) from public,anon;
grant execute on function public.reserver_recommande_ar24(uuid,uuid,text,text,integer) to authenticated;
-- Seul le serveur peut affirmer un résultat fournisseur. Le navigateur ne peut jamais marquer « envoyé ».
create or replace function public.enregistrer_suivi_ar24(p_org uuid,p_id uuid,p_ar24 bigint,p_statut text,p_preuves jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.recommandes_ar24;
begin
 if p_statut is null or p_statut not in('a_authentifier','en_attente','envoye','recu','refuse','non_reclame','echec','a_verifier') or jsonb_typeof(p_preuves) is distinct from 'array' then raise exception 'Suivi invalide.'; end if;
 select * into r from public.recommandes_ar24 where id=p_id and organization_id=p_org for update;
 if not found or r.statut='prepare' or (r.ar24_id is not null and r.ar24_id is distinct from p_ar24) then raise exception 'Courrier ou référence inaccessible.'; end if;
 if p_statut<>'a_verifier' and coalesce(p_ar24,0)<=0 then raise exception 'Référence AR24 manquante.'; end if;
 -- Ne jamais effacer une preuve ou rétrograder une issue définitive lors de rafraîchissements concurrents.
 if r.statut in('recu','refuse','non_reclame') and p_statut<>r.statut then return to_jsonb(r); end if;
 if r.statut='envoye' and p_statut in('a_authentifier','en_attente','a_verifier') then return to_jsonb(r); end if;
 update public.recommandes_ar24 set statut=p_statut,ar24_id=coalesce(p_ar24,ar24_id),preuves=(
  select coalesce(jsonb_agg(x.preuve order by x.preuve->>'type'),'[]'::jsonb)
  from (select distinct on (p.preuve->>'type') p.preuve
   from jsonb_array_elements(r.preuves||p_preuves) with ordinality p(preuve,ordre)
   order by p.preuve->>'type',p.ordre desc) x
 ),actualise_le=now() where id=p_id returning * into r;
 insert into public.audit_log(organization_id,action,details) values(p_org,'recommande_ar24_suivi',jsonb_build_object('courrier_id',r.id,'statut',r.statut,'ar24_id',r.ar24_id));
 return to_jsonb(r);
end $$;
revoke all on function public.enregistrer_suivi_ar24(uuid,uuid,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.enregistrer_suivi_ar24(uuid,uuid,bigint,text,jsonb) to service_role;
-- `send_fail` n'atteste pas à lui seul une absence définitive d'envoi. Après vérification
-- explicite auprès du fournisseur, seul l'opérateur de service peut autoriser une reprise.
create or replace function public.attester_echec_definitif_ar24(p_org uuid,p_id uuid,p_reference text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.recommandes_ar24;
begin
 if p_reference is null or length(btrim(p_reference)) not between 12 and 500 then raise exception 'Conservez la référence de confirmation de l’échec définitif par AR24.'; end if;
 select * into r from public.recommandes_ar24 where id=p_id and organization_id=p_org for update;
 if not found or r.statut<>'echec' or r.ar24_id is null or exists(select 1 from jsonb_array_elements(r.preuves) preuve where preuve->>'type' in('envoi','reception','refus','negligence')) then raise exception 'Aucune reprise : le courrier n’a pas un échec fournisseur vérifiable sans preuve de transmission.'; end if;
 if r.echec_definitif_confirme_le is not null then return to_jsonb(r); end if;
 update public.recommandes_ar24 set echec_definitif_confirme_le=now(),echec_reference_verification=btrim(p_reference),actualise_le=now() where id=p_id returning * into r;
 insert into public.audit_log(organization_id,action,details) values(p_org,'recommande_ar24_echec_definitif',jsonb_build_object('courrier_id',r.id,'ar24_id',r.ar24_id,'reference_verification',r.echec_reference_verification));
 return to_jsonb(r);
end $$;
revoke all on function public.attester_echec_definitif_ar24(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.attester_echec_definitif_ar24(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
-- Une procédure recommandée déjà engagée suspend les e-mails automatiques pour les termes concernés.
create or replace function public.recommande_ar24_poursuite_bloquee(p_bail uuid,p_echeance date)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.recommandes_ar24 r where r.bail_id=p_bail and r.statut<>'prepare'
  and (r.statut in('en_cours','a_verifier','a_authentifier','en_attente') or exists(select 1 from jsonb_array_elements(r.dette->'echeances') e where e->>'date'=p_echeance::text)));
$$;
revoke all on function public.recommande_ar24_poursuite_bloquee(uuid,date) from public,anon;
grant execute on function public.recommande_ar24_poursuite_bloquee(uuid,date) to authenticated,service_role;
do $$ declare definition text; begin
 select pg_get_functiondef('public.relances_loyer_dues(integer)'::regprocedure) into definition;
 if position('public.recommande_ar24_poursuite_bloquee' in definition)=0 then
  if position('where not n.relance_du_jour' in definition)=0 then raise exception 'Fonction relances inattendue'; end if;
  execute replace(definition,'where not n.relance_du_jour','where not n.relance_du_jour and not public.recommande_ar24_poursuite_bloquee(n.bail_id,n.date_echeance)');
 end if;
end $$;
notify pgrst,'reload schema';
