-- ============================================================================
-- LA RÈGLE : on ne clôture qu'un mois RÉVOLU.
-- ============================================================================
-- Pourquoi. La clôture « verrouille définitivement la période comptable »
-- (RM-4.4.1, criticité maximale) et « aucune écriture ne peut être ajoutée,
-- modifiée ou supprimée après clôture » (RM-4.4.2). Cette irréversibilité n'a
-- de sens que sur un mois dont on sait qu'il est complet : le module 4 déclenche
-- la clôture en « fin de mois, avant génération du rapport », et le rapport de
-- gestion tombe à la date de rapport du mandat — le 10 du mois par défaut
-- (RM-5.3) — donc sur le mois écoulé.
--
-- Clôturer le mois EN COURS fige une comptabilité incomplète : tout ce qui
-- s'encaisse ou se dépense les jours suivants du même mois tombe dans un mois
-- déjà clos, et le rapport propriétaire — que la clôture est censée rendre
-- fiable — part amputé. Clôturer un mois FUTUR est pire encore : RM-4.1.5 veut
-- qu'« une écriture sur période clôturée s'impute sur la période ouverte
-- suivante », ce qui suppose qu'une période ouverte existe toujours en aval de
-- la dernière période close. Verrouiller décembre 2027 par avance supprime cette
-- période d'accueil.
--
-- Ce que la réouverture rattrape, et ce qu'elle ne rattrape pas (précision de la
-- revue adversariale du 2026-09-10, rejouée en local). rouvrir_mois() SUPPRIME
-- la ligne de clôture : un mois clos prématurément redevient donc bien
-- inscriptible — c'est exactement l'usage que lui donne RM-A6.9, « ajouter les
-- écritures manquantes », la réouverture ne rendant jamais les écritures
-- existantes modifiables. Le rattrapage existe donc, mais il coûte un geste
-- d'admin d'agence tracé, et il DISPARAÎT dès qu'un rapport a été envoyé sur la
-- période : RM-4.4.6 interdit alors toute réouverture, et le mois figé l'est
-- pour de bon. Clôturer d'avance, c'est poser ce piège.
--
-- La borne. Le mois demandé doit être STRICTEMENT antérieur au mois courant.
-- Conséquences voulues :
--   * clôturer septembre le 1er octobre : ACCEPTÉ — c'est le geste normal ;
--   * clôturer plusieurs mois passés d'un coup, à la reprise d'un retard :
--     ACCEPTÉ — c'est la variante V5 « clôture rétroactive » du parcours 4.4 ;
--   * clôturer le mois en cours, même le dernier jour du mois : REFUSÉ — le mois
--     n'est achevé qu'à minuit ;
--   * clôturer un mois futur : REFUSÉ.
--
-- « Aujourd'hui » se lit à l'heure de Paris, comme partout ailleurs dans
-- l'application (cf. aujourdhuiParis() côté serveur, et le numérotage des
-- incidents), pour que le 1er du mois à 00h30 à Paris soit bien le 1er.
--
-- Les bornes infinies (revue adversariale du 2026-09-10). Postgres accepte
-- 'infinity' et '-infinity' comme dates, et l'appel RPC est atteignable
-- directement (PostgREST) sans passer par le champ <input type="month"> de
-- l'écran. Rejoué en local sous l'identité d'un admin d'agence,
-- cloturer_mois(org, '-infinity') écrivait une ligne de clôture « -infinity »
-- que personne ne sait lire ni justifier, et cloturer_mois(org, 'infinity')
-- refusait avec un message dégénéré (« <NULL> n'est pas achevé ») parce que
-- to_char() ne sait pas formater une date infinie. Un mois de clôture est un
-- mois du calendrier : les deux bornes infinies sont refusées d'entrée.
--
-- Le contrôle d'accès (admin d'agence ou propriétaire direct) et l'idempotence
-- (on conflict do nothing) sont repris à l'identique de la version précédente ;
-- pour le propriétaire direct la clôture reste recommandée et jamais imposée
-- (RM-4.5.2) — c'est sa DATE qui est bornée, pas son caractère facultatif.
-- ============================================================================

create or replace function public.cloturer_mois(p_org uuid, p_mois date)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_mois date;
  v_mois_courant date;
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Seul l''admin d''agence peut clôturer';
  end if;

  if p_mois is null then
    raise exception 'Indiquez le mois à clôturer';
  end if;

  -- Une clôture porte sur un mois du calendrier : ni 'infinity', ni '-infinity'.
  if not isfinite(p_mois) then
    raise exception 'Mois de clôture invalide : indiquez un mois du calendrier';
  end if;

  v_mois := date_trunc('month', p_mois)::date;
  v_mois_courant := date_trunc('month', (now() at time zone 'Europe/Paris'))::date;

  -- Un mois ne se clôture qu'une fois terminé (RM-4.4.1, RM-4.1.5).
  if v_mois >= v_mois_courant then
    raise exception 'Mois non révolu : la clôture fige un mois terminé. % n''est pas achevé, il se clôture à partir du %',
      to_char(v_mois, 'MM/YYYY'),
      to_char((v_mois + interval '1 month')::date, 'DD/MM/YYYY');
  end if;

  insert into public.clotures_comptables (organization_id, mois)
  values (p_org, v_mois)
  on conflict (organization_id, mois) do nothing;
end; $$;

revoke execute on function public.cloturer_mois(uuid, date) from public, anon;
