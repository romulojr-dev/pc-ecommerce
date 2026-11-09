# Tasks: spec 049 — Product images (#114)

Approach: [plan.md](plan.md). Behavior and example IDs: [spec.md](spec.md). One commit per task.

## 0. Housekeeping
- [x] Spec updated with the review (re-encode, host rules, ADR), `plan.md`, `tasks.md`
- [x] Commit the three files

## 1. Dependencies, environment and ADR
- [x] `pnpm add sharp @vercel/blob`
- [x] `lib/images/env-schema.ts` (`IMAGE_STORAGE`, token, `BLOB_PRODUCTION_HOST`, `blobHostOf`) + unit tests (E40–E43c)
- [x] Wire into `lib/env.ts`; `.env.example`; test/CI/Playwright config set `IMAGE_STORAGE=fake`
- [x] ADR 0013 (Blob over Cloudinary, Hobby limits, per-environment stores, own-store deletion)

## 2. Pure rules
- [x] `detectImageType`, `readCappedBody`, size constants (E6–E11)
- [x] `displayImages` / `mainImageOf` / `placeholderImage` (E26, E30)
- [x] Unit tests

## 3. Re-encoding
- [x] `reencodeImage` with `sharp` (E46–E51, R19): 2000 px, no enlarge, orientation applied, no metadata, 40 MP limit, first frame only
- [x] Unit tests with generated fixtures

## 4. Schema and migration
- [x] `ProductImage.createdAt`, CHECKs, non-unique index; `FakeStoredImage`; migration deletes only placeholder rows and reports the count
- [x] `resetCatalog()` / `--reset` name `FakeStoredImage`; `test-images` reserved slug
- [x] `.db` tests: placeholder rows deleted, real row survives (E37), CHECKs, `pnpm db:drift`

## 5. Storage adapters and the fake's route
- [x] `ImageStorage` (`blobStorage`, `fakeStorage`, `imageStorage()`); own-store deletion rule (E52)
- [x] `GET /test-images/[name]` (404 unless fake, E44, E45)
- [x] `next.config.ts` `images.remotePatterns` from the env; WebP only; 31-day cache (R11, R17)
- [x] Tests

## 6. Storefront
- [x] Reads map through `mainImageOf` / `displayImages`; product page passes real images or the placeholder
- [x] Gallery: one image shows no strip, arrows or counter; placeholder has no Enlarge (B19, R18)
- [x] Metadata and JSON-LD; footer line (B21, B22)
- [x] Markup tests (E1, E2, E30, E39)

## 7. Seed
- [x] Seed writes no images; remove part overrides, image schema and summary count; update tests (E37, E38)

## 8. Upload route
- [x] `lib/admin/images/upload.ts` and `app/api/admin/images/route.ts` (B14–B17, R1–R5)
- [x] Audit action, entries, label; audit coverage test allows exactly this route
- [x] `.db` tests (E1, E3–E5, E9–E17, E52)

## 9. Actions
- [x] `reorderProductImages`, `setImageAlt`, `removeProductImage`; `adminAction("images.write")` (B10–B12, R7–R10)
- [x] Audit keys and fixtures; `.db` tests (E19–E29), demo enumeration

## 10. Admin UI and list
- [ ] Images section on `/admin/products/[id]`; upload control; Demo disabled
- [ ] `photos` filter, thumbnails, next-product link (B23, B24, E33–E36)
- [ ] Markup tests

## 11. E2E
- [ ] `e2e/admin-images.spec.ts`; footer assertion

## 12. Docs and PR
- [ ] CLAUDE.md, README, PRD, spec 001 / 006 / 045 notes, docs/setup
- [ ] Lint, typecheck, unit and `.db` tests; push; PR "Closes #114"
