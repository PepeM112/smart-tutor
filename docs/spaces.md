# Spaces (Courses and Classrooms)

A **space** is a shared learning area. There are two kinds:
- A **Course** is an ordered, published set of notes and tests that other users can join (Udemy / Coursera style).
- A **Classroom** is a class with a teacher, co-teachers and students. It contains courses, loose notes and tests, a feed and a gradebook (Google Classroom / Moodle style).

Personal content (notes, tests, questions, folders, Trash, SRS) does not change. Space content is a separate scope: `space_id IS NOT NULL`.

> **Status:** M1 (ST-66) is done: the schema foundation and the access layer. There are no space endpoints and no UI yet. The sections marked *planned* come in later milestones (M2 Courses, M3 Progress, M4 Classrooms, M5 Feed and notifications).

---

## Core rules

1. **One generic table.** Courses and classrooms are rows of the `space` table (`kind`). Members, invites, feed, notifications and progress all point to `space.id` with real FKs.
2. **A classroom owns its courses.** `space.parent_id` points to the classroom. A course has one parent at most. To reuse a course, duplicate it. A classroom course has no members or visibility of its own: it inherits them from the classroom.
3. **Roles:** OWNER, EDITOR (co-teacher), VIEWER (subscriber or student).
   - `space.owner_id` is the only owner record. `space_member` never stores OWNER (CHECK constraint).
   - Only ACTIVE memberships give access. INVITED and REQUESTED give no access.
4. **Content is copied, never linked.** Space content lives in the space (`note.space_id`, `test.space_id`). "Add from my library" makes a copy with no link to the personal original.
5. **Published content can not change through the content endpoints.** Editors change only draft rows (`is_draft = true`). Publish is the only way to change what members see.
6. **Personal-only operations** never apply to space content: folders and move, Trash, favorites, the question bank. (`note.is_favorite` is one column per note, so a favorite on a shared note would be global.)
7. **An archived space is read-only for all users**, the owner too.
8. **Access errors:** missing → 404, no access → 403. A personal-only operation on space content → 400.
9. **Creator column.** `user_id` on space notes, tests and questions records who created the row. It is never used for access.

---

## Schema (M1)

### `space`
| Column | Type | Notes |
|---|---|---|
| `id` | String(26) ULID | |
| `kind` | Integer | `SpaceKind`: COURSE=1, CLASSROOM=2 |
| `parent_id` | FK → `space` CASCADE, NULL | the classroom of a classroom course |
| `owner_id` | FK → `user` CASCADE | the only owner record |
| `title`, `description`, `tags` | String(200), Text, JSONB | |
| `visibility` | Integer | `SpaceVisibility`: PRIVATE=1, UNLISTED=2, PUBLIC=3 |
| `status` | Integer | `SpaceStatus`: ACTIVE=1, ARCHIVED=2 |
| `join_code` | String(7), UNIQUE, NULL | |
| `published_at` | DateTime, NULL | NULL = never published (nobody can join) |
| `archived_at` | DateTime, NULL | |

CHECK `ck_space_parent_kind`: only a COURSE can have a parent. (A check that the parent is a CLASSROOM needs a trigger, so the service checks it in M4.)

### `space_member`
| Column | Type | Notes |
|---|---|---|
| `space_id`, `user_id` | composite PK, FKs CASCADE | one row per (space, user) |
| `role` | Integer | `SpaceRole`: EDITOR=2, VIEWER=3. CHECK `role != OWNER` |
| `status` | Integer | `MemberStatus`: INVITED=1, REQUESTED=2, ACTIVE=3 |
| `invited_by` | FK → `user` SET NULL, NULL | |
| `joined_at` | DateTime, NULL | set when the row becomes ACTIVE |

The composite PK has no ULID, so rows are smaller. The PK index serves "members of a space". The `user_id` index serves "my spaces" and the user delete cascade.

### Space columns on `note` and `test`
| Column | Notes |
|---|---|
| `space_id` | FK → `space` CASCADE, NULL. NULL = personal |
| `is_draft` | true for a row that members can not see yet |
| `draft_of_id` | FK → same table CASCADE. The published row that this draft twin replaces on publish |

CHECK constraints:
- `ck_note_personal_flags` / `ck_test_personal_flags`: `space_id IS NOT NULL OR (is_draft = false AND draft_of_id IS NULL)`. Only space content has drafts.
- `ck_note_space_flags`: `space_id IS NULL OR (folder_id IS NULL AND deleted_at IS NULL AND is_favorite = false)`. Rule 6 in the DB.

Because of `ck_note_space_flags`, the Trash and folder queries (they filter on `folder_id IN (…)` or `deleted_at IS NOT NULL`) can never return a space note. They need no extra filter.

A question has no `space_id`. It follows its owning test (`question.owning_test`). A bank question is always personal.

---

## Access layer (`services/access_service.py`)

Every single-row load of a note, test or question goes through this module. `get_owned_or_404` stays only for folders and test results (they are always personal).

### Role resolution
`get_space_access(db, *, space_id, user_id) -> SpaceAccess(role, status)`
1. The chain is the space, then its parent (if any).
2. The owner of the space **or** of the parent is OWNER.
3. Else the ACTIVE member row of the space itself wins over the row of the parent. So a classroom VIEWER can be an EDITOR of one course later, with no schema change.
4. Else no role.
5. `status` is ARCHIVED when the space **or** its parent is archived.

### Permission matrix
`can_access_space_content(*, role, space_status, is_draft, level) -> bool` is a pure function (no DB), so the full matrix has fast unit tests (`tests/test_access.py`).

| Level | Rule |
|---|---|
| READ | any role. A draft only for OWNER / EDITOR |
| EDIT | OWNER / EDITOR, a draft row only, and an ACTIVE space |

Personal content (`space_id IS NULL`): only the user with `user_id` has access, at both levels (the same as before).

### API
| Function | Use |
|---|---|
| `get_note_or_404(db, *, note_id, current_user, level, for_update=False)` | load a note or raise 404 / 403 |
| `get_test_or_404(db, *, test_id, current_user, level)` | load a test or raise 404 / 403 |
| `get_question_or_404(db, *, question_id, current_user, level, active_only=True)` | load a question (follows its test) |
| `can_access_note` / `can_access_test` / `can_access_question` | bool checks, for example for AI confirm cards |
| `question_space_id(question)` | the space of a question, or None |
| `require_personal(*, space_id)` | 400 "Not available for course or classroom content" |

### Where the rules apply
- **Personal-scope filters.** Every personal list, tree, search, review and RAG query filters `space_id IS NULL` (`PERSONAL_NOTE` in `crud/note.py`, `Test.space_id.is_(None)` in `crud/test.py` and `crud/question.py`).
- **Personal-only guards.** Move, favorite and soft delete of a note, Trash restore and delete forever, and question assign / duplicate call `require_personal` → 400.
- **Bulk question actions** (bulk delete, bulk assign, restore) skip space questions and count them as skipped. This is the project rule for bulk endpoints.
- **Exams.** `test_service.get_takeable_test` gives 409 "Draft tests can not be taken" for a draft test (exam start and submit).
- **Versioning.** The frozen copy of a test keeps `space_id`, so old results of a space test still pass the access check.
- **AI Assistant.** Read tools use READ (a VIEWER can read published space notes). Write tools (`refine_note`, `edit_test`, `refine_questions`) use EDIT, so they refuse published space content. Confirm cards show a name only when the user has access.

---

## Planned

- **M2 Courses:** CRUD, sections and items, "Add from my library" (copy), Edit mode + Publish (draft twins), visibility and joining, public catalog, archive and delete forever, duplicate.
- **M3 Progress:** completion per item, attempt policy for course tests, test variants, student AI / RAG on joined spaces, SRS scope.
- **M4 Classrooms:** tabs, classroom courses, due dates, co-teachers, gradebook, grade override, Class AI key.
- **M5 Feed and notifications:** plain-text posts and comments, in-app bell with polling.

The full plan and decision log are in `.claude/local/TASK_CLASSROOM.md` while the feature is in progress.
