alter table public.health_metrics
  add column bmi numeric(5,2) check (bmi between 5 and 100),
  add column lean_body_mass_kg numeric(6,2) check (lean_body_mass_kg between 1 and 500),
  add column resting_calories integer check (resting_calories between 0 and 10000);

comment on column public.health_metrics.bmi is 'Body mass index estimate imported from a health source.';
comment on column public.health_metrics.lean_body_mass_kg is 'Estimated lean body mass; not a clinical measurement.';
comment on column public.health_metrics.resting_calories is 'Daily resting/basal energy in kilocalories.';
