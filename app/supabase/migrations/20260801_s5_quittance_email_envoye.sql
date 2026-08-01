-- Suivi de l'envoi email de la quittance (via API Resend côté app).
alter table public.quittances add column email_envoye_at timestamptz;
