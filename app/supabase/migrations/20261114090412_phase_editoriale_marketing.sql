alter table public.marketing_reglages
  add column phase_editoriale text not null default 'lancement'
  check (phase_editoriale in ('preparation','lancement','communaute','commercial','fidelisation'));
