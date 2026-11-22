-- TimeCrumbs · personal background image (uploaded photo, stored as a compressed data URL)
-- Background mode / gradient seed live in profiles.preferences.background.

create table public.user_backgrounds (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  image_data text not null check (image_data like 'data:image/%' and length(image_data) <= 3000000),
  updated_at timestamptz not null default now()
);

alter table public.user_backgrounds enable row level security;

create policy user_backgrounds_own on public.user_backgrounds for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger user_backgrounds_touch before update on public.user_backgrounds
  for each row execute function public.touch_updated_at();
