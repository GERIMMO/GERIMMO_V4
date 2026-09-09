-- Correctif audit fonctionnel 09/09 (P1) : la sauvegarde de la grille EDL
-- échouait — « column "etat" is of type public.etat_element but expression is
-- of type text » — et la saisie était perdue. Le paramètre jsonb livre du
-- text : on le valide puis on le caste explicitement vers l'enum.
create or replace function public.enregistrer_grille_edl(p_edl uuid, p_lignes jsonb, p_signer boolean default false)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare v record; l record; v_etat public.etat_element;
begin
  select * into v from public.etats_des_lieux where id = p_edl;
  if not found then raise exception 'EDL introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.etat = 'signe' then
    raise exception 'EDL signé : les lignes sont figées';
  end if;

  for l in select * from jsonb_to_recordset(p_lignes)
           as x(id uuid, etat text, commentaire text)
  loop
    if nullif(l.etat, '') is null then
      v_etat := null;
    elsif l.etat in ('neuf', 'bon', 'usage', 'mauvais', 'absent') then
      v_etat := l.etat::public.etat_element;
    else
      raise exception 'État « % » inconnu — valeurs possibles : neuf, bon, usagé, mauvais, absent', l.etat;
    end if;
    update public.edl_lignes
       set etat = v_etat, commentaire = nullif(l.commentaire, '')
     where id = l.id and edl_id = p_edl;
  end loop;

  if p_signer then
    perform public.signer_edl(p_edl);
  end if;
end $function$;
revoke execute on function public.enregistrer_grille_edl(uuid, jsonb, boolean) from public, anon;
