-- Registre serveur : une réponse perdue ne doit jamais déclencher un second rappel.
alter table public.bail_signature_circuits add column if not exists envoye_le timestamptz;
create table if not exists public.signature_suivi_actions (
 circuit_id uuid not null references public.bail_signature_circuits(id),
 cle text not null check (cle in ('j7','j21','j28','a_verifier','refuse','expire','relance_incertaine')),
 etat text not null check (etat in ('incertain','confirme')),
 created_at timestamptz not null default now(),
 confirme_le timestamptz,
 primary key(circuit_id,cle)
);
alter table public.signature_suivi_actions enable row level security;
-- Repose aussi la relation lors d'une reconstruction du parent historique.
alter table public.signature_suivi_actions drop constraint if exists signature_suivi_actions_circuit_id_fkey;
alter table public.signature_suivi_actions add constraint signature_suivi_actions_circuit_id_fkey foreign key(circuit_id) references public.bail_signature_circuits(id);
revoke all on public.signature_suivi_actions from public,anon,authenticated;
grant all on public.signature_suivi_actions to service_role;
drop policy if exists signature_suivi_serveur on public.signature_suivi_actions;
create policy signature_suivi_serveur on public.signature_suivi_actions for all to service_role using(true) with check(true);
create index if not exists signature_suivi_date on public.signature_suivi_actions(created_at);
create index if not exists signature_circuits_envoyes on public.bail_signature_circuits(envoye_le) where etat='en_cours';

create or replace function public.reserver_relance_signature(p_circuit uuid,p_jour integer,p_jeton uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare c public.bail_signature_circuits; age integer; n integer;
begin
 select * into c from public.bail_signature_circuits where id=p_circuit for update;
 if not found or c.etat<>'en_cours' or c.prestataire<>'zoho' or c.external_request_id is null
   or c.envoye_le is null or c.expire_le is null or c.expire_le<=now() or p_jeton is null or c.verrou_jeton is distinct from p_jeton or c.verrou_jusqua is null or c.verrou_jusqua<=now() then return false; end if;
 age:=(now() at time zone 'Europe/Paris')::date-(c.envoye_le at time zone 'Europe/Paris')::date;
 -- Pas de rafale de rattrapage : J+7 jusqu'à J+20 ; J+21 jusqu'à J+27.
 if p_jour is null or p_jour not in (7,21) or age<p_jour or age>=(case when p_jour=7 then 21 else 28 end) then return false; end if;
 -- Une réponse incertaine doit être examinée, jamais suivie d'un autre rappel.
 if exists(select 1 from public.signature_suivi_actions where circuit_id=c.id and cle in ('j7','j21') and etat='incertain') then return false; end if;
 insert into public.signature_suivi_actions(circuit_id,cle,etat) values(c.id,'j'||p_jour,'incertain') on conflict do nothing;
 get diagnostics n=row_count;
 return n=1;
end $$;
revoke all on function public.reserver_relance_signature(uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.reserver_relance_signature(uuid,integer,uuid) to service_role;

create or replace function public.alerter_suivi_signature(p_circuit uuid,p_motif text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare c public.bail_signature_circuits; n integer; titre text;
begin
 if p_motif not in ('j28','a_verifier','refuse','expire','relance_incertaine') then raise exception 'Motif de suivi invalide'; end if;
 select * into c from public.bail_signature_circuits where id=p_circuit for update;
 if not found or c.etat in ('pret','annule','termine') then return false; end if;
 if p_motif in ('a_verifier','refuse','expire') and c.etat<>p_motif then return false; end if;
 if p_motif='j28' and (c.etat<>'en_cours' or c.envoye_le is null
   or (now() at time zone 'Europe/Paris')::date-(c.envoye_le at time zone 'Europe/Paris')::date<28) then return false; end if;
 if p_motif='relance_incertaine' and not exists(select 1 from public.signature_suivi_actions
   where circuit_id=c.id and cle in ('j7','j21') and etat='incertain' and created_at<now()-interval '2 minutes') then return false; end if;
 insert into public.signature_suivi_actions(circuit_id,cle,etat,confirme_le) values(c.id,p_motif,'confirme',now()) on conflict do nothing;
 get diagnostics n=row_count;
 if n=0 then return false; end if;
 titre:=case p_motif when 'j28' then 'Signature : échéance proche'
   when 'refuse' then 'Signature refusée'
   when 'expire' then 'Demande de signature expirée'
   when 'relance_incertaine' then 'Rappel de signature à vérifier'
   else 'Envoi de signature à vérifier' end;
 insert into public.alerts(organization_id,type,criticite,titre,details,assignee_account_id,assigned_all)
 values(c.organization_id,'signature_a_reprendre','normale',titre,
   jsonb_build_object('bail_id',c.bail_id,'document_id',c.document_id,'incident_id',c.incident_id,'circuit_id',c.id,'motif',p_motif),c.created_by,false);
 insert into public.audit_log(account_id,organization_id,action,details)
 values(c.created_by,c.organization_id,'signature_alerte_suivi',jsonb_build_object('circuit_id',c.id,'motif',p_motif));
 return true;
end $$;
revoke all on function public.alerter_suivi_signature(uuid,text) from public,anon,authenticated;
grant execute on function public.alerter_suivi_signature(uuid,text) to service_role;

-- Les refus/expirations déjà signalés sortent définitivement de la file.
create or replace function public.circuits_signature_a_suivre(p_environnement text,p_prestataire text)
returns table(id uuid,external_request_id text,etat text)
language sql stable security invoker set search_path='' as $$
 select c.id,c.external_request_id,c.etat
 from public.bail_signature_circuits c
 where c.environnement=p_environnement and c.prestataire=p_prestataire
 and c.updated_at<now()-interval '2 minutes'
 and (c.etat in ('preparation','en_cours','a_verifier')
   or (c.etat in ('refuse','expire') and not exists (
     select 1 from public.signature_suivi_actions a where a.circuit_id=c.id and a.cle=c.etat and a.etat='confirme')))
 order by c.updated_at,c.id limit 10
$$;
revoke all on function public.circuits_signature_a_suivre(text,text) from public,anon,authenticated;
grant execute on function public.circuits_signature_a_suivre(text,text) to service_role;
-- La référence retrouvée et sa trace doivent être enregistrées ensemble.
create or replace function public.rapprocher_brouillon_signature(p_circuit uuid,p_jeton uuid,p_demande text,p_document text,p_signataires text[])
returns boolean language plpgsql security invoker set search_path='' as $$
declare c public.bail_signature_circuits; signes jsonb;
begin
 select * into c from public.bail_signature_circuits where id=p_circuit for update;
 if not found or c.prestataire<>'zoho' or c.etat not in ('preparation','a_verifier') or c.external_request_id is not null
   or p_jeton is null or c.verrou_jeton is distinct from p_jeton or c.verrou_jusqua is null or c.verrou_jusqua<=now() then return false; end if;
 if coalesce(length(p_demande),0) not between 1 and 200 or coalesce(length(p_document),0) not between 1 and 200
   or p_signataires is null or cardinality(p_signataires)<>jsonb_array_length(c.signataires) or cardinality(p_signataires)=0
   or exists(select 1 from unnest(p_signataires) s where coalesce(length(s),0) not between 1 and 200)
   or (select count(distinct s) from unnest(p_signataires) s)<>cardinality(p_signataires) then raise exception 'Références de rapprochement invalides'; end if;
 select jsonb_agg(s.value||jsonb_build_object('externalId',p_signataires[s.ordinality::integer],'statut','initiated') order by s.ordinality)
 into signes from jsonb_array_elements(c.signataires) with ordinality s;
 update public.bail_signature_circuits set external_request_id=p_demande,external_document_id=p_document,
 signataires=signes,etat='a_verifier',updated_at=now(),
 erreur='Le brouillon Zoho a été retrouvé et vérifié. Aucune invitation n’a été envoyée ; vous pouvez l’annuler avant de préparer un nouvel envoi.'
 where id=c.id;
 insert into public.audit_log(account_id,organization_id,action,details)
 values(c.created_by,c.organization_id,'signature_brouillon_rapproche',jsonb_build_object('circuit_id',c.id));
 return true;
end $$;
revoke all on function public.rapprocher_brouillon_signature(uuid,uuid,text,text,text[]) from public,anon,authenticated;
grant execute on function public.rapprocher_brouillon_signature(uuid,uuid,text,text,text[]) to service_role;
-- La date distante retrouvée appartient au suivi serveur des circuits déjà engagés.
-- Ne change ni les champs métier ni le refus des nouveaux envois après fermeture.
do $suivi_date$
declare d text; ancien constant text := $a$array['etat','signataires','external_request_id','external_document_id','document_signe','erreur','updated_at','verrou_jeton','verrou_jusqua']$a$;
 nouveau constant text := $b$array['etat','signataires','external_request_id','external_document_id','document_signe','erreur','updated_at','verrou_jeton','verrou_jusqua','envoye_le']$b$;
begin
 select pg_get_functiondef('public.refuser_ecriture_si_fermee()'::regprocedure) into d;
 if (length(d)-length(replace(d,ancien,'')))=2*length(ancien) and strpos(d,nouveau)=0 then
  execute replace(d,ancien,nouveau);
 elsif (length(d)-length(replace(d,nouveau,'')))<>2*length(nouveau) or strpos(d,ancien)>0 then
  raise exception 'Garde signature : listes de suivi inattendues';
 end if;
end $suivi_date$;
select public.fermer_fonctions_a_anon();
