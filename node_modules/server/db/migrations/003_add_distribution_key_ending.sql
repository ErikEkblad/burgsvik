-- Lägg till kolumn för "ändelse" (siffra) på distributionsnycklar
-- Kolumnnamn: ending (int, nullbar). UI benämner fältet "Ändelse".

alter table if exists distribution_key
  add column if not exists ending int;

-- Validering hanteras i applikationslagret (0-9). Lägg ev. CHECK här om så önskas:
-- alter table distribution_key add constraint distribution_key_ending_digit_chk check (ending between 0 and 9);


