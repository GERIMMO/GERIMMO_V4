create or replace function public.deposer_ma_piece_artisan(
  p_type public.artisan_piece_type, p_storage_path text, p_mime text,
  p_taille bigint, p_empreinte text, p_emise_le date, p_expire_le date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_artisan uuid; v_piece uuid;
begin
  v_artisan := public.mon_artisan_id();
  if v_artisan is null then raise exception 'Accès refusé'; end if;
  if p_mime not in ('image/jpeg', 'image/png', 'application/pdf') then
    raise exception 'Déposez une image (JPEG, PNG) ou un PDF';
  end if;
  if p_storage_path not like 'artisans/' || v_artisan::text || '/%' then
    raise exception 'Chemin de stockage invalide';
  end if;
  if p_type <> 'certification' and p_expire_le is null then
    raise exception 'Indiquez la date de fin de validité — c''est elle qui fait foi';
  end if;

  if p_expire_le < (statement_timestamp() at time zone 'Europe/Paris')::date then
    raise exception 'Attestation expirée : la pièce précédente reste en place';
  end if;

  -- Deux remplacements simultanés doivent observer la dernière pièce validée.
  perform 1 from public.artisans where id = v_artisan for update;

  -- Une nouvelle attestation remplace la précédente du même type : RM-8.2.2,
  -- « dépôt à jour → rétablissement immédiat » — il ne doit pas rester une
  -- vieille pièce qui traîne à côté de la neuve.
  update public.artisan_pieces set retiree_le = now()
  where artisan_id = v_artisan and type = p_type and retiree_le is null;

  insert into public.artisan_pieces
    (artisan_id, type, storage_path, mime_type, taille_octets, empreinte,
     emise_le, expire_le, deposee_par)
  values (v_artisan, p_type, p_storage_path, p_mime, p_taille, p_empreinte,
          p_emise_le, p_expire_le, (select auth.uid()))
  returning id into v_piece;

  -- La purge des candidatures sans document (6 mois, décision 2026-09-04)
  -- n'a plus lieu d'être dès qu'une pièce arrive.
  update public.artisans set purge_prevue_le = null where id = v_artisan;
  return v_piece;
end;
$$;
