-- Les modifications de rôle et les retraits passent par les actions autorisées
-- qui vérifient le repreneur, transfèrent les mandats et journalisent la décision.
-- Aucun compte, rôle ou mandat existant n'est modifié par cette migration.
revoke update on public.memberships from authenticated;
revoke update (role, status) on public.memberships from authenticated;
drop policy if exists memberships_update on public.memberships;

notify pgrst, 'reload schema';
