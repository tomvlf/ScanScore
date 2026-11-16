BEGIN;
ALTER TABLE rooms ADD COLUMN login_name varchar(80);
WITH names AS (
 SELECT id,lower(btrim(title)) AS name,
        count(*) OVER (PARTITION BY lower(btrim(title))) AS occurrences
 FROM rooms
)
UPDATE rooms r
SET login_name=CASE
 WHEN n.occurrences=1 AND NOT EXISTS (
  SELECT 1 FROM rooms other WHERE other.id<>r.id AND other.slug=n.name
 ) THEN n.name
 ELSE r.slug
END
FROM names n WHERE n.id=r.id;
ALTER TABLE rooms ALTER COLUMN login_name SET NOT NULL;
ALTER TABLE rooms ADD CONSTRAINT rooms_login_name_key UNIQUE(login_name);
ALTER TABLE rooms ADD CONSTRAINT rooms_login_name_check
 CHECK(length(login_name) BETWEEN 1 AND 80 AND login_name=lower(btrim(login_name)));
COMMIT;
