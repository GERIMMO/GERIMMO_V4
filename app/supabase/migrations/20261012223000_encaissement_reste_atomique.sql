-- Accord local du 12/10/2026 : un même geste ne peut encaisser deux fois.
-- Les écritures passées ne sont ni réécrites ni dédoublonnées.
create table public.commandes_encaissement_reste (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  bail_id uuid not null references public.baux(id),
  appel_id uuid not null references public.appels_loyer(id),
  auteur uuid not null references auth.users(id),
  encaissement_id uuid, -- conserve la trace si l'encaissement est annulé normalement
  requete jsonb not null,
  resultat jsonb not null,
  created_at timestamptz not null default now()
);
create index commandes_encaissement_organization_id_idx on public.commandes_encaissement_reste(organization_id);
create index commandes_encaissement_bail_id_idx on public.commandes_encaissement_reste(bail_id);
create index commandes_encaissement_appel_id_idx on public.commandes_encaissement_reste(appel_id);
create index commandes_encaissement_auteur_idx on public.commandes_encaissement_reste(auteur);
alter table public.commandes_encaissement_reste enable row level security;
revoke all on public.commandes_encaissement_reste from anon, authenticated;
grant select on public.commandes_encaissement_reste to authenticated;
create policy commandes_encaissement_lecture on public.commandes_encaissement_reste for select
using (organization_id in (select public.org_ids_avec_roles(
  array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
  and not public.bail_hors_portefeuille(organization_id,bail_id));

-- Tous les chemins de saisie utilisent le même verrou : une saisie détaillée
-- concurrente ne doit pas se glisser entre la lecture du solde et son insertion.
create function public.verrouiller_echeancier_encaissement() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform b.id from public.baux b
  where b.id in (case when tg_op <> 'DELETE' then new.bail_id end,
                 case when tg_op <> 'INSERT' then old.bail_id end)
  order by b.id for update;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.verrouiller_echeancier_encaissement() from public,anon,authenticated;
create trigger a_verrou_echeancier before insert or update or delete on public.encaissements
for each row execute function public.verrouiller_echeancier_encaissement();
create trigger a_verrou_echeancier before insert or update or delete on public.appels_loyer
for each row execute function public.verrouiller_echeancier_encaissement();

create function public.encaisser_reste_atomique(
 p_org uuid, p_bail uuid, p_appel uuid, p_commande uuid,
 p_reste_attendu numeric, p_dette_anterieure_attendue numeric
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_org uuid; v_reste numeric; v_anterieure numeric; v_periode date;
 v_avant jsonb; v_apres jsonb; v_resultat jsonb; v_requete jsonb;
 v_commande public.commandes_encaissement_reste%rowtype; v_encaissement uuid;
begin
 if auth.uid() is null or p_commande is null or p_reste_attendu is null
    or p_dette_anterieure_attendue is null or p_reste_attendu <= 0
    or p_reste_attendu::text in ('NaN','Infinity','-Infinity')
    or p_dette_anterieure_attendue::text in ('NaN','Infinity','-Infinity')
    or p_dette_anterieure_attendue < 0 then
   raise exception 'La demande d''encaissement est incomplète. Rechargez les loyers.';
 end if;
 if not exists(select 1 from public.org_ids_avec_roles(
   array['admin_agence','agent','proprietaire_direct']::public.membership_role[]) x where x=p_org)
   or public.bail_hors_portefeuille(p_org,p_bail)
   or not coalesce(public.org_ecriture_ouverte(p_org),false) then
   raise exception 'Accès refusé.';
 end if;
 select organization_id into v_org from public.baux where id=p_bail for update;
 if v_org is distinct from p_org then raise exception 'Accès refusé.'; end if;
 select periode into v_periode from public.appels_loyer
 where id=p_appel and bail_id=p_bail and organization_id=p_org;
 if not found then raise exception 'Appel de loyer introuvable.'; end if;
 v_requete:=jsonb_build_object('reste',p_reste_attendu,'anterieure',p_dette_anterieure_attendue);
 select * into v_commande from public.commandes_encaissement_reste where id=p_commande;
 if found then
   if v_commande.organization_id<>p_org or v_commande.bail_id<>p_bail
      or v_commande.appel_id<>p_appel or v_commande.auteur<>auth.uid()
      or v_commande.requete<>v_requete then raise exception 'Cette demande a déjà été utilisée.'; end if;
   if v_commande.encaissement_id is not null and not exists(
     select 1 from public.encaissements where id=v_commande.encaissement_id) then
     return jsonb_build_object('statut','annule','montant',0,'rejoue',true);
   end if;
   return v_commande.resultat || jsonb_build_object('rejoue',true);
 end if;
 select coalesce(jsonb_agg(to_jsonb(e) order by e.periode),'[]'::jsonb)
 into v_avant from public.etat_loyers_bail_brut(p_bail) e;
 select montant_du-montant_couvert into v_reste from public.etat_loyers_bail_brut(p_bail) where appel_id=p_appel;
 select coalesce(sum(montant_du-montant_couvert),0) into v_anterieure
 from public.etat_loyers_bail_brut(p_bail) where periode<v_periode;
 if v_reste<=0 then
   v_resultat:=jsonb_build_object('statut','deja_couvert','montant',0);
 elsif round(v_reste,2)<>round(p_reste_attendu,2)
    or round(v_anterieure,2)<>round(p_dette_anterieure_attendue,2) then
   v_resultat:=jsonb_build_object('statut','solde_modifie','montant',0);
 else
   insert into public.encaissements(organization_id,bail_id,montant,mode,note)
   values(p_org,p_bail,round(v_reste,2),'virement','Encaissé depuis le quittancement') returning id into v_encaissement;
   select coalesce(jsonb_agg(to_jsonb(e) order by e.periode),'[]'::jsonb)
   into v_apres from public.etat_loyers_bail_brut(p_bail) e;
   v_resultat:=jsonb_build_object('statut','enregistre','montant',round(v_reste,2),
     'encaissement_id',v_encaissement,'avant',v_avant,'apres',v_apres);
 end if;
 insert into public.commandes_encaissement_reste(id,organization_id,bail_id,appel_id,auteur,encaissement_id,requete,resultat)
 values(p_commande,p_org,p_bail,p_appel,auth.uid(),v_encaissement,v_requete,v_resultat);
 return v_resultat || jsonb_build_object('rejoue',false);
end $$;
revoke all on function public.encaisser_reste_atomique(uuid,uuid,uuid,uuid,numeric,numeric) from public,anon;
grant execute on function public.encaisser_reste_atomique(uuid,uuid,uuid,uuid,numeric,numeric) to authenticated;

create trigger abonnement_commandes_encaissement_reste
before insert or update or delete on public.commandes_encaissement_reste
for each row execute function public.refuser_ecriture_si_fermee();
