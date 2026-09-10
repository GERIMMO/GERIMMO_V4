-- ============================================================================
-- LA RÈGLE : l'indice de référence est celui FIGÉ AU BAIL, et il n'y a
-- qu'UNE révision par an et par bail.
-- ============================================================================
-- Source : wiki « Révision annuelle IRL » (processus) et module 3, parcours 3.8.
--
-- 1. L'INDICE DE RÉFÉRENCE NE SE CHOISIT PAS AU MOMENT DE LA RÉVISION.
--    RM-3.8.2 — « L'indice de référence est celui figé au bail à sa signature. »
--    Le bail le porte déjà : baux.irl_trimestre (trimestre de référence, mention
--    du modèle-type : « révision (date + trimestre IRL) ») et baux.irl_valeur
--    (« valeur de l'IRL de référence »). Le parcours 3.8 le redit dans son
--    tableau de calcul : loyer actuel = « bail ou dernière révision », IRL de
--    référence = « indice figé au bail à sa signature », IRL du trimestre de
--    révision = « saisi par l'admin agence, historisé » (RM-3.8.3).
--    reviser_loyer() recevait pourtant CET INDICE DE RÉFÉRENCE EN PARAMÈTRE.
--    Rejoué le 2026-09-10 sur la base locale, sous l'identité d'un admin
--    d'agence : un bail à 750 € dont le bail fige l'IRL à 145,17 révisé avec
--    « IRL de référence = 100 » passait à 1 110,23 € au lieu des 764,78 €
--    qu'impose la formule (750 × 148,03 / 145,17). Le diviseur de la hausse
--    était à la main de l'appelant : le loyer aussi.
--    L'indice de référence est désormais LU SUR LE BAIL, et le paramètre
--    disparaît de la signature. Bail sans indice figé : blocage explicite —
--    c'est le cas d'erreur « indice non saisi → BLOCAGE » du parcours 3.8,
--    appliqué à l'indice de référence.
--
-- 2. UNE RÉVISION PAR AN ET PAR BAIL.
--    Parcours 3.8 : déclencheur « date anniversaire du bail », fréquence
--    « annuelle par bail » ; RM-3.8.5 — « une révision non demandée dans
--    l'année est définitivement perdue », c'est-à-dire une échéance de révision
--    par année de bail, et une seule.
--    Rien ne le garantissait : l'index unique (bail_id, date_effet) posé le
--    2026-09-10 n'empêche que le rejeu à la MÊME date d'effet. Rejoué en local :
--    deux appels à un mois d'écart ont porté le même bail de 750 € à 1 687,55 €,
--    chaque révision repartant du loyer déjà révisé. Douze révisions dans
--    l'année étaient possibles.
--    Deux révisions d'un même bail doivent désormais être séparées d'AU MOINS
--    UN AN de date d'effet. La garde vit dans la base (déclencheur sur
--    revisions_loyer), pas seulement dans la fonction : la règle ne dépend plus
--    du chemin d'écriture. L'index unique (bail_id, date_effet) reste en place
--    et continue de refuser le rejeu à l'identique.
--
-- 3. UNE RÉVISION NE SE DEMANDE PAS D'AVANCE.
--    RM-3.8.5 en entier : « la révision doit être demandée dans l'année QUI SUIT
--    la date anniversaire ; passé ce délai elle est définitivement perdue ». La
--    fenêtre de demande est donc [date d'effet ; date d'effet + 1 an]. La borne
--    HAUTE était déjà codée (prescription, 2026-08-01). La borne BASSE ne
--    l'était pas — et sans elle, la garde annuelle du point 2 ne mord pas.
--    Rejoué le 2026-09-10 sur la base locale, sous l'identité d'un admin
--    d'agence, APRÈS la garde annuelle : cinq appels LE MÊME JOUR, datés d'effet
--    à +0, +1, +2, +3 et +4 ans, sont tous « espacés d'au moins un an » — donc
--    tous acceptés — et chacun s'applique immédiatement à baux.loyer_hc en
--    repartant du loyer déjà révisé : 750 € → 764,78 → 1 053,63 → 1 451,58 →
--    1 999,83 → 2 755,16 €, soit +267 % en une session. L'escalade que le point
--    2 prétendait fermer restait donc entière : elle avait simplement changé de
--    colonne, de la fréquence des appels vers l'étiquette de leur date d'effet.
--    Une date d'effet non atteinte est désormais refusée. Le loyer ne s'augmente
--    pas d'avance : le module 14 déclenche l'alerte de révision À la date
--    anniversaire, et le parcours 3.8 fait valider l'agent une fois l'échéance
--    arrivée. Reste possible, et légitime : rattraper la révision de l'an passé
--    (non encore prescrite) puis celle de l'année en cours — deux échéances
--    réellement dues, et le maximum que la fenêtre du wiki autorise.
--    Cette borne vit dans la FONCTION, pas dans le déclencheur : c'est le geste
--    de révision qu'elle encadre. Une ligne de revisions_loyer écrite en direct
--    ne touche pas baux.loyer_hc (et aucun rôle applicatif ne peut l'écrire :
--    revisions_loyer n'a aucune politique d'insertion), tandis qu'un
--    déclencheur interdirait aussi la reprise d'un historique par le service.
--
-- 4. CE QUI NE CHANGE PAS, et reste tel quel : clause de révision expresse
--    (RM-3.8.1), interdiction sur DPE F/G (RM-3.8.6), prescription à un an
--    (RM-3.8.5 : « demandée dans l'année qui suit la date anniversaire »,
--    au-delà elle est perdue pour cette échéance), dépôt et provisions
--    inchangés (RM-3.8.8, RM-2.1.5), indice utilisé conservé sur la révision
--    (RM-3.8.7).
--
-- 5. CE QUE CETTE MIGRATION NE TRANCHE PAS — arbitrage humain, rien n'est codé :
--    * Deuxième révision et suivantes. Le wiki fige l'indice de référence AU
--      BAIL (RM-3.8.2) et fait partir le calcul du « loyer actuel » — donc du
--      loyer déjà révisé. Appliqués ensemble une deuxième année, ces deux
--      énoncés composent la hausse (L2 = L0 × I1 × I2 / I0²) là où l'usage
--      voudrait le rapport des indices de deux trimestres consécutifs. Le wiki
--      ne dit pas si l'indice de référence du bail est réactualisé après chaque
--      révision. On applique donc la lettre de RM-3.8.2 — l'indice du bail —
--      sans inventer de chaînage.
--    * Date d'effet et date anniversaire. Le parcours déclenche la révision à
--      la date anniversaire du bail, mais le modèle-type prévoit une DATE de
--      révision propre au bail, que le schéma ne stocke pas. On n'impose donc
--      pas que la date d'effet tombe sur l'anniversaire de baux.date_debut :
--      seul l'écart d'un an entre deux révisions, et le fait que l'échéance
--      soit atteinte, sont contrôlés.
--    * Préparer une révision AVANT l'échéance. On refuse une date d'effet non
--      atteinte parce que la fonction applique le loyer sur-le-champ : accepter
--      l'avance, c'est augmenter le loyer avant l'échéance, et rouvrir
--      l'escalade du point 3. Mais l'étape 3 du parcours détecte les baux dont
--      l'anniversaire « approche » : si le pilote veut qu'un agent valide
--      quelques jours à l'avance, il faudra soit une fenêtre d'anticipation
--      chiffrée (le wiki n'en donne aucune — rien n'est inventé ici), soit une
--      révision enregistrée mais appliquée au loyer le jour venu, mécanisme
--      qui n'existe pas encore.
--    * L'indice du bail n'est pas VERROUILLÉ. RM-3.8.2 dit « figé au bail à sa
--      signature », mais rien dans le schéma ne fige baux.irl_valeur : la
--      politique baux_update laisse l'admin d'agence, l'agent et le
--      propriétaire direct l'écrire à tout moment. Rejoué le 2026-09-10 :
--      « update baux set irl_valeur = 1 » puis une révision à 148,03 porte un
--      loyer de 764,78 € à 113 210,38 €. Le diviseur reste donc atteignable en
--      deux gestes au lieu d'un — mais les mêmes rôles peuvent déjà écrire
--      baux.loyer_hc en direct (vérifié : « update baux set loyer_hc = 5000 »
--      passe), si bien que verrouiller le seul irl_valeur ne fermerait rien et
--      casserait le rattrapage des baux repris sans indice. Ce qui doit être
--      tranché — et ne l'est pas ici — c'est quels champs d'un bail SIGNÉ
--      restent modifiables, et par qui : c'est un sujet de bail, pas de
--      révision. Ce que cette migration garantit, elle, c'est que la révision
--      lit l'indice du bail au lieu d'en inventer un, et le conserve sur la
--      ligne (RM-3.8.7).
-- ============================================================================

-- ── 1 ─ La garde annuelle, portée par la base ───────────────────────────────
-- Écart minimum d'un an entre deux révisions d'un même bail. Le cas « même
-- date d'effet » est laissé à l'index unique revisions_loyer_une_par_date_effet
-- (posé le 2026-09-10), qui le refuse déjà : ce déclencheur ne traite que les
-- dates DIFFÉRENTES mais trop rapprochées, dans un sens comme dans l'autre
-- (une révision antidatée compte autant qu'une révision anticipée).
create or replace function public.revision_annuelle_par_bail()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_voisine date;
begin
  select r.date_effet into v_voisine
  from public.revisions_loyer r
  where r.bail_id = new.bail_id
    and r.id <> new.id
    and r.date_effet <> new.date_effet
    and r.date_effet > (new.date_effet - interval '1 year')
    and r.date_effet < (new.date_effet + interval '1 year')
  order by r.date_effet desc
  limit 1;

  if v_voisine is not null then
    raise exception 'Révision annuelle : ce bail a déjà été révisé au %, moins d''un an avant le % demandé. Une seule révision par année de bail (parcours 3.8, RM-3.8.5)',
      to_char(v_voisine, 'DD/MM/YYYY'), to_char(new.date_effet, 'DD/MM/YYYY');
  end if;
  return new;
end;
$$;

drop trigger if exists revision_annuelle_par_bail on public.revisions_loyer;
create trigger revision_annuelle_par_bail
  before insert or update of date_effet, bail_id on public.revisions_loyer
  for each row execute function public.revision_annuelle_par_bail();

-- Une fonction déclencheur n'est pas une API : personne ne doit pouvoir
-- l'accrocher à une table à soi (advisor 2026-09-10). Le déclencheur, lui,
-- s'exécute sous le propriétaire de la fonction et n'est pas atteint.
revoke execute on function public.revision_annuelle_par_bail()
  from public, anon, authenticated, service_role;

-- ── 2 ─ La fonction de révision : l'indice de référence vient du bail ───────
-- La signature perd p_irl_reference : ce n'était pas une donnée d'appel.
drop function if exists public.reviser_loyer(uuid, numeric, numeric, date);

create or replace function public.reviser_loyer(
  p_bail uuid, p_irl_nouveau numeric, p_date_effet date
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_dpe text;
  v_reference numeric;
  v_nouveau numeric;
  v_voisine date;
begin
  -- Verrou sur le bail : deux révisions concurrentes (double-clic, rejeu
  -- réseau) se voient au lieu de passer toutes les deux la même vérification.
  select * into v from public.baux where id = p_bail for update;
  if v.id is null then raise exception 'Bail introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if not v.revision_irl then
    raise exception 'Ce bail n''a pas de clause de révision — aucune révision possible';
  end if;
  if v.loyer_hc is null then raise exception 'Le loyer n''est pas fixé'; end if;
  if p_date_effet is null then raise exception 'Date d''effet de la révision obligatoire'; end if;
  if p_irl_nouveau is null or p_irl_nouveau <= 0 then
    raise exception 'Indice IRL du trimestre de révision obligatoire (saisi par l''admin d''agence, RM-3.8.3)';
  end if;

  -- RM-3.8.2 : l'indice de référence est celui figé au bail à sa signature.
  v_reference := v.irl_valeur;
  if v_reference is null or v_reference <= 0 then
    raise exception 'Indice de référence absent du bail : le trimestre et la valeur de l''IRL figés à la signature (RM-3.8.2) doivent être renseignés sur le bail avant toute révision';
  end if;

  select d.classe_dpe into v_dpe
  from public.diagnostics d
  where d.lot_id = v.lot_id and d.type = 'dpe' and d.archived_at is null
  order by d.date_realisation desc limit 1;
  if v_dpe in ('F', 'G') then
    raise exception 'Révision interdite : logement classé DPE % (passoire thermique, depuis 2022)', v_dpe;
  end if;

  if current_date > (p_date_effet + interval '1 year')::date then
    raise exception 'Révision prescrite : plus d''un an s''est écoulé depuis la date d''effet (RM-3.8.5)';
  end if;

  -- L'autre moitié de RM-3.8.5 : la révision se demande « dans l'année QUI SUIT
  -- la date anniversaire ». La demande vient après l'échéance, jamais avant.
  -- Sans cette borne, la garde annuelle ci-dessous ne borne rien : il suffisait
  -- de dater les révisions à un an d'écart DANS LE FUTUR pour les enchaîner
  -- toutes le même jour, chacune s'appliquant aussitôt au loyer (750 € →
  -- 2 755,16 € en cinq appels, rejoué le 2026-09-10). Le loyer ne s'augmente
  -- pas d'avance.
  if p_date_effet > current_date then
    raise exception 'Révision anticipée : la date d''effet du % n''est pas encore atteinte. Une révision se demande dans l''année qui suit la date anniversaire, jamais avant (RM-3.8.5)',
      to_char(p_date_effet, 'DD/MM/YYYY');
  end if;

  -- Une révision par année de bail : le message est dit ici, avant la garde de
  -- la base, pour que l'agent lise la date qui bloque.
  select r.date_effet into v_voisine
  from public.revisions_loyer r
  where r.bail_id = p_bail
    and r.date_effet > (p_date_effet - interval '1 year')
    and r.date_effet < (p_date_effet + interval '1 year')
  order by r.date_effet desc
  limit 1;
  if v_voisine is not null then
    raise exception 'Révision annuelle : ce bail a déjà été révisé au %, moins d''un an avant le % demandé. Une seule révision par année de bail (parcours 3.8, RM-3.8.5)',
      to_char(v_voisine, 'DD/MM/YYYY'), to_char(p_date_effet, 'DD/MM/YYYY');
  end if;

  v_nouveau := round(v.loyer_hc * p_irl_nouveau / v_reference, 2);
  insert into public.revisions_loyer
    (organization_id, bail_id, date_effet, ancien_loyer, nouveau_loyer, irl_reference, irl_nouveau)
  values (v.organization_id, p_bail, p_date_effet, v.loyer_hc, v_nouveau, v_reference, p_irl_nouveau);
  update public.baux set loyer_hc = v_nouveau, updated_at = now() where id = p_bail;
  return v_nouveau;
end;
$$;

revoke execute on function public.reviser_loyer(uuid, numeric, date) from public, anon;
