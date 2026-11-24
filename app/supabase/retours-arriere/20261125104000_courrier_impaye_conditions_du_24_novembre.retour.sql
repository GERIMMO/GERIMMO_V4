-- RETOUR ARRIÈRE de 20261125104000_courrier_impaye_conditions_du_24_novembre.sql (textes officiels, lot T4 du
-- 24/11/2026 : le courrier d'impayé part aussi pour un contrat conclu sous la version du 24 novembre 2026 des conditions).
--
-- Rend à `empreinte_avant_alertes_direction(uuid, jsonb)` son texte de 20261116201034, recopié tel quel : la liste des
-- versions redevient « 2026-10-24, 2026-11-15 ». Aucune donnée n'est modifiée ni supprimée ; droits inchangés.
-- À NE JOUER QU'AVEC LE RETOUR DU CODE à une version des conditions antérieure au 24/11/2026 : tant que la version
-- « 2026-11-24 » est en vigueur, ce retour prive de courrier d'impayé les contrats conclus sous elle (le relais est
-- alerté à la place). Sans effet si la fonction n'existe plus (retour de 20261116201223 déjà joué : la fonction a alors
-- repris son premier nom, et ce retour ne la recrée pas sous l'ancien). Rejouable.
do $retour$
begin
  if to_regprocedure('public.empreinte_avant_alertes_direction(uuid,jsonb)') is null then return; end if;
  execute $fonction$
create or replace function public.empreinte_avant_alertes_direction(p_org uuid,p_contexte jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare
 c alias for p_contexte; a public.abonnements; r public.retractations_abonnement;
 contrat record; preuve record; adresse text; h text;
begin
 if coalesce(c->>'type','') not in ('relance_abonnement','resiliation_impaye','retractation_abonnement') then
  return public.empreinte_avant_incident_contrat(p_org,c);
 end if;
 if not exists(select from public.organizations where id=p_org and status in ('essai','active','suspendue')) then return null; end if;
 if c->>'type'='retractation_abonnement' then
  select * into r from public.retractations_abonnement where id=(c->>'id')::uuid and organization_id=p_org;
  if not found or r.nature is distinct from c->>'nature'
    or not exists(select from public.organizations o where o.id=p_org and o.name=c->>'organisation')
    or date_trunc('milliseconds',r.declaree_le) is distinct from (c->>'declaree')::timestamptz
    or encode(sha256(convert_to(r.texte_declaration,'UTF8')),'hex') is distinct from c->>'declaration' then return null; end if;
  select u.email into adresse from auth.users u join public.memberships m on m.account_id=u.id
   where u.id=r.declaree_par and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
   and m.organization_id=p_org and m.status='active' and m.role in ('admin_agence','proprietaire_direct')
   ; -- Seule l'adresse vérifiée du déclarant encore habilité autorise l'envoi.
  if c->>'etape'='reception' then
    if r.executee_le is not null then return null; end if;
  elsif c->>'etape' in ('copie','execution') then
    if r.executee_le is null or r.montant_rembourse_cents is distinct from (c->>'montant')::bigint
     or (c->>'essaiFin' is not null and not exists(select from public.organizations o where o.id=p_org and o.essai_fin=(c->>'essaiFin')::date and o.essai_fin>=public.aujourdhui_paris()))
     or ((c->>'passage')::boolean is true and not exists(select from public.abonnements b where b.organization_id=p_org
       and b.stripe_subscription_id=r.subscription_id and b.periodicite='mensuel' and b.montant_periode_cents=(c->>'mensualite')::bigint))
     or coalesce(r.passage_effectue,false) is distinct from coalesce((c->>'passage')::boolean,false)
     or (c->>'etape'='copie') is distinct from (r.accuse_envoye_le is not null)
     or (c->>'etape'='copie') is distinct from (nullif(c->>'copie','') is not null) then return null; end if;
  else return null; end if;
 else
  select * into a from public.abonnements where organization_id=p_org and stripe_subscription_id=c->>'id';
  if not found or a.paiement_en_defaut_depuis is null or a.paiement_en_defaut_depuis is distinct from (c->>'episode')::date then return null; end if;
  if c->>'type'='relance_abonnement' then
   select * into contrat from public.abonnement_courrier_contexte(p_org,true);
   if a.stripe_statut is null or a.stripe_statut not in ('past_due','unpaid')
    or contrat.cgu_version is null or contrat.cgu_version not in ('2026-10-24','2026-11-15') or contrat.cgu_version is distinct from c->>'version'
    or (c->>'facture') !~ '^in_[A-Za-z0-9_]+$' or c->>'facture' is null
    or (c->>'montant')::bigint<=0 or contrat.montant_periode_cents is distinct from (c->>'montant')::bigint
    or a.periodicite is distinct from c->>'periodicite' or a.relances_paiement is distinct from (c->>'palier')::smallint
    or (a.relances_paiement=0 and public.echeance_mise_en_demeure(p_org,a.stripe_subscription_id,a.paiement_en_defaut_depuis) is distinct from (c->>'resiliable')::date)
    or (not a.premiere_facture_payee) is distinct from (c->>'premier')::boolean then return null; end if;
   if not exists(select from public.abonnements_a_relancer(500) d where d.organization_id=p_org and d.palier=a.relances_paiement) then return null; end if;
   adresse:=contrat.destinataire;
  else
   select * into preuve from public.preuve_fin_impaye(p_org,c->>'id',(c->>'episode')::date,(c->>'fin')::timestamptz);
   if not found or preuve.facture is distinct from c->>'facture' or jsonb_build_array(preuve.facture) is distinct from c->'annulees' then return null; end if;
   adresse:=preuve.destinataire;
  end if;
 end if;
 h:=encode(sha256(convert_to(lower(btrim(adresse)),'UTF8')),'hex');
 if h is null or h is distinct from c->>'destinataire' then return null; end if;
 return encode(sha256(convert_to(jsonb_build_array(p_org,c,h)::text,'UTF8')),'hex');
end $$;
  $fonction$;
end $retour$;

select public.fermer_fonctions_a_anon();
