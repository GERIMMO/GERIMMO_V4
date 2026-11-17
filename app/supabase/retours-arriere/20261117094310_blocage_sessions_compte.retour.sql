-- Ne réautoriser aucune session révoquée en rétablissant une ancienne application.
do $retour$
begin
  if to_regclass('gerimmo_session_interne.reconnexions_requises') is not null then
    raise exception 'Retour refusé : conserver les seuils de reconnexion et corriger en avant.';
  end if;
end $retour$;
