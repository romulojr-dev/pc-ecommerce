-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "searchVector" tsvector;

-- CreateIndex
CREATE INDEX "Product_searchVector_idx" ON "Product" USING GIN ("searchVector");

-- Keyword search (docs/specs/014-search, ADR 0005). Prisma doesn't model
-- functions or triggers, so it neither diffs nor drops these.

-- The one normalizer for both the products and the shopper's query, so they
-- can't drift: lowercase, anything but a-z and 0-9 becomes a space, and a
-- space goes in where letters meet digits ("RTX5070" -> "rtx 5070",
-- "7800X3D" -> "7800 x 3 d", "16GB" -> "16 gb"). Two passes, since one
-- character can end one boundary and start the next.
CREATE FUNCTION search_normalize(input text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
RETURN btrim(
  regexp_replace(
    regexp_replace(
      regexp_replace(lower(input), '[^a-z0-9]+', ' ', 'g'),
      '([a-z])([0-9])', '\1 \2', 'g'
    ),
    '([0-9])([a-z])', '\1 \2', 'g'
  )
);

-- The shopper's text as a tsquery that can't fail: the normalized tokens (at
-- most 16) AND-ed, the last one a prefix match when it has 2 or more
-- characters ("780" finds "7800"; "ddr5" stays "ddr & 5"). Only [a-z0-9]
-- tokens reach to_tsquery, so the user's text never carries operators. NULL
-- when there are no tokens, which matches nothing.
CREATE FUNCTION search_query(input text) RETURNS tsquery
LANGUAGE sql STABLE PARALLEL SAFE
AS $$
  WITH token AS (
    SELECT t.token, t.n
    FROM unnest(
      (string_to_array(search_normalize(coalesce(input, '')), ' '))[1:16]
    ) WITH ORDINALITY AS t(token, n)
    WHERE t.token <> ''
  )
  SELECT to_tsquery('simple', string_agg(
    token || CASE
      WHEN n = (SELECT max(n) FROM token) AND length(token) >= 2 THEN ':*'
      ELSE ''
    END,
    ' & ' ORDER BY n
  ))
  FROM token
$$;

-- A product's weighted search vector: A name; B brand name and SKU; C every
-- string in specs (socket, chipset, memory type...; numbers are left out);
-- D category name. 'simple' config: no stemming, no stopwords.
CREATE FUNCTION product_search_vector(
  name text,
  sku text,
  specs jsonb,
  brand_id text,
  category_id text
) RETURNS tsvector
LANGUAGE sql STABLE PARALLEL SAFE
AS $$
  SELECT
    setweight(to_tsvector('simple', search_normalize(name)), 'A')
    || setweight(to_tsvector('simple', search_normalize(
      coalesce((SELECT b.name FROM "Brand" b WHERE b.id = brand_id), '')
      || ' ' || sku
    )), 'B')
    || setweight(to_tsvector('simple', search_normalize(coalesce(
      (
        SELECT string_agg(value #>> '{}', ' ')
        FROM jsonb_path_query(
          specs, 'strict $.** ? (@.type() == "string")'
        ) AS value
      ),
      ''
    ))), 'C')
    || setweight(to_tsvector('simple', search_normalize(
      coalesce((SELECT c.name FROM "Category" c WHERE c.id = category_id), '')
    )), 'D')
$$;

-- Keep it right for every writer, on every insert and update, like
-- effectivePrice: whatever a writer sends is overwritten here
CREATE FUNCTION product_set_search_vector() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."searchVector" := product_search_vector(
    NEW."name", NEW."sku", NEW."specs", NEW."brandId", NEW."categoryId"
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER product_search_vector
BEFORE INSERT OR UPDATE ON "Product"
FOR EACH ROW EXECUTE FUNCTION product_set_search_vector();

-- A renamed brand or category changes its products' vectors
CREATE FUNCTION brand_refresh_search_vectors() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "Product" SET "searchVector" = product_search_vector(
    "name", "sku", "specs", "brandId", "categoryId"
  ) WHERE "brandId" = NEW."id";
  RETURN NULL;
END;
$$;

CREATE TRIGGER brand_search_vectors
AFTER UPDATE OF "name" ON "Brand"
FOR EACH ROW WHEN (OLD."name" IS DISTINCT FROM NEW."name")
EXECUTE FUNCTION brand_refresh_search_vectors();

CREATE FUNCTION category_refresh_search_vectors() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "Product" SET "searchVector" = product_search_vector(
    "name", "sku", "specs", "brandId", "categoryId"
  ) WHERE "categoryId" = NEW."id";
  RETURN NULL;
END;
$$;

CREATE TRIGGER category_search_vectors
AFTER UPDATE OF "name" ON "Category"
FOR EACH ROW WHEN (OLD."name" IS DISTINCT FROM NEW."name")
EXECUTE FUNCTION category_refresh_search_vectors();

-- Backfill (the trigger above recomputes it on this update too)
UPDATE "Product" SET "searchVector" = product_search_vector(
  "name", "sku", "specs", "brandId", "categoryId"
);
