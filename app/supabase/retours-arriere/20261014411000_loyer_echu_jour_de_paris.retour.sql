-- RETOUR ARRIÈRE de 20261014411000_loyer_echu_jour_de_paris.sql
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Défait : la comparaison « échu » au jour de Paris dans l'état d'un appel de loyer (etat_loyers_bail_brut) et dans les deux
-- fonctions qui additionnent l'impayé échu d'un lot (fiche_lot, contrats_du_lot).
-- Définitions antérieures : extraites (pg_get_functiondef) d'une base reconstruite en rejouant les migrations d'origine SANS cette
-- migration, puis recopiées ici par un générateur — aucune n'est écrite à la main. Rejouable : sans la marque du correctif dans la
-- définition en vigueur, la fonction est laissée telle quelle.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014411000_loyer_echu_jour_de_paris.retour.sql
--
-- RÉINTRODUIT le défaut corrigé (FIN-13, élargissement du 15/10) : « échu » se compare au jour du fuseau de la session (UTC) ;
-- de minuit à 2 h à Paris, un loyer échu la veille s'affiche « attendu » au lieu d'« impayé » (et le test e2e
-- encaissement-reste.spec.ts échoue de nouveau de 22 h à 24 h UTC). Aucune donnée n'est touchée : ce sont trois fonctions de lecture.
-- Joué APRÈS le retour de 20261014410000 si les deux sont défaits (les deux migrations ne partagent aucune fonction : l'ordre est sans effet).

-- Garde : ce script ouvre et ferme SA transaction. Placé dans un lot déjà ouvert (begin; … rollback; de
-- migrations.yml), son commit validerait tout le lot et la « simulation » ne simulerait plus rien.
-- Hors transaction, l'instruction démarre à l'instant même de sa transaction ; dans un lot, elle est plus tardive.
do $retour_arriere$
begin
  if statement_timestamp() <> transaction_timestamp() then
    raise exception 'Retour arrière refusé : ce script gère sa propre transaction et ne doit pas être joué dans un lot (migrations.yml, psql --single-transaction, begin;). Voir LISEZ-MOI.md.';
  end if;
end $retour_arriere$;


begin;
set local lock_timeout = '10s';

-- Outil local à cette session (pg_temp : disparaît à la fin de la connexion, rien n'est créé dans public).
-- Rétablit la définition ANTÉRIEURE (reprise de la base reconstruite par les migrations d'origine) si, et
-- seulement si, la définition en vigueur porte la marque du correctif. Sans la marque, la fonction est
-- déjà revenue (rejeu) ou a été réécrite depuis : on n'y touche pas.
create function pg_temp.restaurer_fonction(p_signature text, p_marque text, p_definition text)
returns text language plpgsql as $retour_arriere$
declare v_oid regprocedure := to_regprocedure(p_signature); v_courante text;
begin
  if v_oid is null then
    raise exception 'Retour arrière : la fonction % n''existe pas (base inattendue)', p_signature;
  end if;
  v_courante := pg_get_functiondef(v_oid);
  if position(p_marque in v_courante) = 0 then
    return p_signature || ' : marque du correctif absente, rien à faire';
  end if;
  execute p_definition;
  return p_signature || ' : définition antérieure rétablie';
end $retour_arriere$;

-- X13 : état d'un appel de loyer comparé au jour de la session
select pg_temp.restaurer_fonction('public.etat_loyers_bail_brut(uuid)',
  $marque$Décision X13 du 15/10 (FIN-13)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.etat_loyers_bail_brut(p_bail uuid)
 RETURNS TABLE(appel_id uuid, periode date, date_echeance date, montant_du numeric, cumul_du numeric, montant_couvert numeric, statut text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with b as (
    select id, organization_id from public.baux where id = p_bail
  ), a as (
    select al.id, al.periode, al.date_echeance, al.montant_du,
      sum(al.montant_du) over (order by al.periode rows between unbounded preceding and current row) as cumul_du
    from public.appels_loyer al join b on b.id = al.bail_id
    where al.organization_id = b.organization_id
  ), tot as (
    select coalesce(sum(e.montant), 0) as encaisse
    from public.encaissements e join b on b.id = e.bail_id
    where e.organization_id = b.organization_id
  )
  select
    a.id, a.periode, a.date_echeance, a.montant_du, a.cumul_du,
    round(least(a.montant_du, greatest(0, tot.encaisse - (a.cumul_du - a.montant_du))), 2) as montant_couvert,
    case
      when tot.encaisse >= a.cumul_du then 'paye'
      when tot.encaisse > (a.cumul_du - a.montant_du) then 'partiel'
      when a.date_echeance < current_date then 'impaye'
      else 'attendu'
    end as statut
  from a, tot
  order by a.periode;
$function$
$definition_anterieure$);

-- X13 : impayé échu de la fenêtre du lot
select pg_temp.restaurer_fonction('public.fiche_lot(uuid)',
  $marque$Décision X13 du 15/10 (FIN-13)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.fiche_lot(p_lot uuid)
 RETURNS TABLE(portee text, lot_id uuid, lot_nom text, lot_etat lot_etat, surface_m2 numeric, pieces integer, etage text, meuble boolean, bien_id uuid, bien_nom text, bien_type bien_type, adresse text, code_postal text, ville text, copropriete boolean, bail_id uuid, bail_etat bail_etat, bail_type bail_type, locataire text, locataire_email text, locataire_telephone text, loyer_hc numeric, charges numeric, depot_garantie numeric, date_debut date, date_fin date, jour_echeance smallint, mandat_id uuid, mandat_etat mandat_etat, mandant text, mandant_email text, taux_honoraires numeric, jour_rapport smallint, proprietaires text, blocages text[], incidents_ouverts integer, impaye_echu numeric, termes_impayes integer, diagnostics_manquants integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with relation as (
    -- À QUEL TITRE cet appelant regarde-t-il ce lot ? La question est posée
    -- une fois, ici, et tout le reste en découle. `portee is null` = il ne le
    -- regarde à aucun titre, et la fonction ne rend rien.
    select
      l.id as lot, l.organization_id as org,
      case
        when l.organization_id in (select public.org_ids_avec_roles(
               array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
             and not public.lot_hors_portefeuille(l.organization_id, l.id)
          then 'gerant'
        when exists (
          select 1
          from public.baux b
          join public.persons p
            on p.organization_id = b.organization_id
           and p.account_id = (select auth.uid())
          where b.lot_id = l.id
            and b.etat in ('actif','preavis')
            and exists (select 1 from public.memberships m
                        where m.account_id = (select auth.uid())
                          and m.organization_id = b.organization_id
                          and m.role = 'locataire' and m.status = 'active')
            and (p.id = b.locataire_principal
                 or exists (select 1 from public.bail_personnes bp
                            where bp.bail_id = b.id and bp.person_id = p.id
                              and bp.role = 'colocataire'))
        ) then 'locataire'
      end as portee
    from public.lots l
    where l.id = p_lot
  )
  select
    r.portee,
    l.id, l.nom, l.etat, l.surface_m2, l.pieces, l.etage, l.meuble,
    b.id, b.nom, b.type, b.address_line1, b.postal_code, b.city, b.copropriete,
    ba.id, ba.etat, ba.type,
    case when ba.id is not null then btrim(coalesce(pl.prenom,'') || ' ' || pl.nom) end,
    -- Le contact de l'occupant n'est rendu que tant que le bail vit : on ne
    -- laisse pas le téléphone de quelqu'un qui n'habite plus là.
    case when ba.etat in ('actif','preavis') then pl.email end,
    case when ba.etat in ('actif','preavis') then pl.telephone end,
    ba.loyer_hc, ba.charges, ba.depot_garantie,
    ba.date_debut, ba.date_fin, ba.jour_echeance,
    -- ── Ce qui appartient au propriétaire et à son gestionnaire ──
    case when r.portee = 'gerant' then m.id end,
    case when r.portee = 'gerant' then m.etat end,
    case when r.portee = 'gerant' then btrim(coalesce(pm.prenom,'') || ' ' || pm.nom) end,
    case when r.portee = 'gerant' then pm.email end,
    case when r.portee = 'gerant' then ml.taux_honoraires end,
    case when r.portee = 'gerant' then m.date_rapport end,
    case when r.portee = 'gerant' then
      (select string_agg(btrim(coalesce(p2.prenom,'') || ' ' || p2.nom)
                         || ' (' || round(d.quote_part) || ' %)', ', ' order by d.quote_part desc)
         from public.detentions d
         join public.persons p2 on p2.id = d.person_id
        where d.lot_id = l.id and d.date_fin is null)
    end,
    -- Ce qui bloque une MISE EN LOCATION est la liste de tâches de l'agence :
    -- un locataire en place n'a rien à en faire, et la lui montrer serait lui
    -- dire que son logement n'est pas louable.
    case when r.portee = 'gerant' then public.lot_blocages_location(l.id) end,
    case
      when r.portee = 'gerant' then
        (select count(*)::integer from public.incidents i
          where i.lot_id = l.id and i.etat <> 'clos')
      else
        -- Le locataire ne compte que SES signalements — pas ceux des voisins
        -- de palier, ni ceux que l'agence a ouverts de son côté.
        (select count(*)::integer from public.incidents i
          where i.lot_id = l.id and i.etat <> 'clos'
            and i.declarant_person_id = public.ma_personne_locataire(l.organization_id))
    end,
    -- CE QUI RESTE DÛ SUR LES TERMES ÉCHUS, et pas un calcul de plus.
    -- `etat_loyers_bail_brut` est la source que le produit utilise déjà pour
    -- poser l'alerte d'impayé et pour l'échéancier du locataire. En refaire une
    -- somme à partir des écritures donnerait un second chiffre qui divergerait
    -- du premier — et c'est le chiffre dont on se sert pour relancer quelqu'un.
    coalesce((select sum(x.montant_du - x.montant_couvert)
                from public.etat_loyers_bail_brut(ba.id) x
               where x.date_echeance < current_date and x.montant_du > x.montant_couvert), 0),
    coalesce((select count(*)::integer
                from public.etat_loyers_bail_brut(ba.id) x
               where x.date_echeance < current_date and x.montant_du > x.montant_couvert), 0),
    case when r.portee = 'gerant' then
      (select count(*)::integer from unnest(public.lot_blocages_location(l.id)) x
        where x ilike '%diagnostic%' or x ilike '%dpe%' or x ilike '%erp%')
    else 0 end
  from relation r
  join public.lots l on l.id = r.lot
  join public.biens b on b.id = l.bien_id
  left join public.baux ba on ba.lot_id = l.id and ba.etat in ('actif','preavis','brouillon')
    and (r.portee = 'gerant' or ba.id = public.mon_dernier_bail_locataire(r.org))
  left join public.persons pl on pl.id = ba.locataire_principal
  left join public.mandat_lignes ml on ml.lot_id = l.id and ml.date_fin is null
  left join public.mandats m on m.id = ml.mandat_id and m.etat in ('actif','preavis')
  left join public.persons pm on pm.id = m.person_id
  where r.portee is not null
  order by case ba.etat when 'actif' then 0 when 'preavis' then 1 else 2 end
  limit 1;
$function$
$definition_anterieure$);

-- X13 : impayé échu de chaque contrat de colocation
select pg_temp.restaurer_fonction('public.contrats_du_lot(uuid)',
  $marque$Décision X13 du 15/10 (FIN-13)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.contrats_du_lot(p_lot uuid)
 RETURNS TABLE(id uuid, chambre text, locataire text, etat bail_etat, loyer_hc numeric, charges numeric, date_fin date, impaye_echu numeric, termes_impayes integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select b.id, c.nom, btrim(coalesce(p.prenom, '') || ' ' || p.nom), b.etat, b.loyer_hc, b.charges, b.date_fin,
    coalesce((select sum(x.montant_du-x.montant_couvert) from public.etat_loyers_bail_brut(b.id) x where x.date_echeance < current_date and x.montant_du > x.montant_couvert),0),
    (select count(*)::integer from public.etat_loyers_bail_brut(b.id) x where x.date_echeance < current_date and x.montant_du > x.montant_couvert)
  from public.baux b join public.lot_chambres c on c.id = b.chambre_id
  left join public.persons p on p.id = b.locataire_principal
  where b.lot_id = p_lot and b.etat in ('actif','preavis')
    and ((b.organization_id in (select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
      and not public.lot_hors_portefeuille(b.organization_id, b.lot_id))
      or b.id = public.mon_dernier_bail_locataire(b.organization_id))
  order by c.nom, b.id;
$function$
$definition_anterieure$);


-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014411000';
  end if;
end $retour_arriere$;

commit;
