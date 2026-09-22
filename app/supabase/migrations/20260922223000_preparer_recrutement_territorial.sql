-- Un projet de recrutement reste une idée sans diffusion ni dépense.
alter table public.marketing_campagnes add column territoire_etude text;
create unique index marketing_campagnes_territoire_etude_unique on public.marketing_campagnes(territoire_etude) where territoire_etude is not null;
create function public.preparer_recrutement_territorial(p_code text,p_cible text,p_nom text,p_raison text) returns uuid language plpgsql security definer set search_path='' as $$
declare resultat uuid; cle text;
begin
 if (select auth.role()) is distinct from 'service_role' then raise exception 'Accès réservé au traitement'; end if;
 if p_code is null or p_code !~ '^([0-9]{2,3}|2A|2B)$' or p_cible is null or p_cible not in ('artisans','agences','proprietaires') or p_nom is null or length(p_nom) not between 1 and 70 or p_raison is null or length(p_raison) not between 10 and 2000 then raise exception 'Étude invalide'; end if;
 cle:=to_char(now() at time zone 'Europe/Paris','YYYY-MM')||':'||p_code||':'||p_cible;
 insert into public.marketing_campagnes(nom,description,canal,nature,objectif,statut,budget_cents,territoire_etude)
 values('Essai local — '||p_nom||' — '||p_cible,
 p_raison||E'\n\nProjet préparé par l’étude territoriale. Confirmer le réseau artisanal et les résultats locaux avant lancement. Préparer un contenu et sa page de destination dans l’Agent marketing. Aucune publicité n’est diffusée et aucun budget supplémentaire n’est autorisé par cette préparation.',
 'facebook','organique','prospects','idee',0,cle)
 on conflict(territoire_etude) where territoire_etude is not null do nothing returning id into resultat;
 return resultat;
end $$;
revoke all on function public.preparer_recrutement_territorial(text,text,text,text) from public,anon,authenticated;
grant execute on function public.preparer_recrutement_territorial(text,text,text,text) to service_role;
