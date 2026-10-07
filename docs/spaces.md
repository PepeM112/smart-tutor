# Spaces (Courses and Classrooms)

A **space** is a shared learning area. There are two kinds:
- A **Course** is an ordered, published set of notes and tests that other users can join (Udemy / Coursera style).
- A **Classroom** is a class with a teacher, co-teachers and students. It contains courses, loose notes and tests, a feed and a gradebook (Google Classroom / Moodle style).

Personal content (notes, tests, questions, folders, Trash, SRS) does not change. Space content is a separate scope: `space_id IS NOT NULL`.

> **Status:** M1 and M2 (ST-66) are done: the schema foundation, the access layer, and standalone courses end to end (API + UI). The sections marked *planned* come in later milestones (M3 Progress, M4 Classrooms, M5 Feed and notifications).

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
| AUTHOR | OWNER / EDITOR, any row, also in an archived space (read-only level) |
| EDIT | OWNER / EDITOR, a draft row only, and an ACTIVE space |

AUTHOR protects the answer key. A VIEWER can read a published note, but not the questions of a test: `GET /tests/{id}`, `GET /questions/{id}`, `POST /questions/{id}/check` and the AI test read tools need AUTHOR for space content. Viewers take a test through `/tests/{id}/exam`, which hides the answers.

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
- **SRS.** Space questions are not in SRS. `check_question` does not write `UserQuestionState` for them (M3 adds an opt-in).
- **Source note of a personal test.** A user can generate a personal test from a space note they can read. The test keeps `source_note_id`, so it links to the space note. This is the one link from personal content to space content, and it is intentional (the user can see where the questions came from). The link can break:
  - The user leaves the space → the note load gives 403. The UI shows "You no longer have access to this file".
  - The space or the note is deleted → `source_note_id` becomes NULL (`ondelete="SET NULL"`), so the link is not shown. If the UI still has the old id, the load gives 404 and the UI shows "This file no longer exists".
- **AI Assistant.** Read tools use READ (a VIEWER can read published space notes). Write tools (`refine_note`, `edit_test`, `refine_questions`) use EDIT, so they refuse published space content. Confirm cards show a name only when the user has access.

---

## Courses (M2)

### Schema
| Table | Columns | Notes |
|---|---|---|
| `space_section` | `space_id`, `title`, `position`, `is_draft`, `draft_of_id` → `space_section` | the sections of a course |
| `space_item` | `space_id`, `section_id`, `kind`, `note_id` / `test_id` / `child_space_id`, `position`, `is_draft`, `draft_of_id` → `space_item` | `SpaceItemKind`: NOTE=1, TEST=2, COURSE=3. CHECK: only the target of its kind is set. The API refuses COURSE (M4) |
| `space_publish` | `space_id`, `published_by`, `message`, `notify_members`, `reset_item_ids` (JSONB) | one log row per publish |
| `space.draft_started_at` | DateTime, NULL | edit mode is on. A flag, because edit mode with zero draft sections is a valid state |

All FKs to `space` and to the parent rows are `ON DELETE CASCADE`.

### Roles in a course
- **Owner:** edits the metadata (title, description, tags, visibility), manages members (invite, approve, deny, set role, remove), archives, unarchives, deletes forever, regenerates the join code.
- **Author** (owner or EDITOR): edit mode, structure, content, publish, discard, duplicate, sees the join code and the member list.
- **Member** (any ACTIVE role): reads the published structure and content.
- **Non-member:** sees a preview (structure, no content) of a published PUBLIC or UNLISTED course. A pending row (INVITED or REQUESTED) shows the metadata. Else 403.

### Draft engine (`services/space_draft_service.py`)
Members see only published rows. Authors change a course in **edit mode**:
1. **Enter edit mode** (`POST /draft`): clone the published sections and items as draft rows (`draft_of_id` → the published row). A new course starts in edit mode.
2. **Structure:** add, rename and delete draft sections; delete draft items; `PUT /draft/order` sends the full order (every section and every item id, once).
3. **Content:**
   - `POST /items` creates a new empty note or test (`is_draft = true`, `draft_of_id = NULL`).
   - `POST /items/copy` copies a personal note or test in. It gets new ids and no link to the original (no `source_note_id`, no `origin_id`).
   - A draft item of a published item points to the **published** content. `POST /items/{id}/draft` makes the content twin lazily (`draft_of_id` → the published note or test) and returns the id to edit. The next calls return the same twin.
4. **Publish** (`POST /draft/publish`):
   - Sections and items: a twin updates its published row in place, a new draft row becomes published, a published row with no draft is deleted.
   - A twin note is copied into the published note (`version + 1`, `is_indexed = false`). The note id does not change, so links to it (for example `source_note_id` of a personal test) still work.
   - A twin test: `version_test_if_needed` freezes the old results, the old questions and groups are marked DELETED, and the twin's questions and groups move to the published test. The test id does not change.
   - Content of removed items: notes are hard-deleted, tests are soft-deleted (the results stay).
   - The remaining draft rows are deleted, `published_at = now`, `draft_started_at = NULL`, and a `space_publish` row is written.
5. **Discard** (`POST /draft/discard`): delete all draft rows and draft content. The published state does not change.

`notify_members` (M5) and `reset_item_ids` (M3) are stored only: the notification and completion tables do not exist yet. `reset_item_ids` takes draft item ids and stores them as published item ids.

### Visibility and joining
| | PUBLIC | UNLISTED | PRIVATE |
|---|---|---|---|
| In the catalog | yes | no | no |
| Join by link (`POST /{id}/join`) | ACTIVE at once | ACTIVE at once | a REQUESTED row that the owner approves |
| Join by code (`POST /join`) | ACTIVE | ACTIVE | ACTIVE (the code is the secret) |

- A course that was never published, or is archived, takes no joins (409).
- An invitation (by username or email) makes an INVITED row: the user accepts or declines.
- Leave removes the own row (also a pending request). The owner can not leave.
- Archived: read-only for all users. Members keep access. The owner can still remove members, unarchive and delete forever.
- **Delete forever** needs the exact title in the body (400 otherwise). It deletes the test children through the ORM first (answers, SRS state, results, questions, groups, tests including frozen copies). Personal tests made from a course note survive (`source_note_id → NULL`).
- **Duplicate** copies the published content only, into a new course of the current user in edit mode. No members, results, progress or drafts.

### Endpoints (`/api/v1/spaces`, tag `spaces`)
| Group | Endpoints |
|---|---|
| Lists | `GET ""` (my courses), `GET /catalog` (search, sort `newest` / `members`, page), `GET /invitations` |
| Course | `POST ""`, `GET /{id}`, `PATCH /{id}`, `DELETE /{id}` (delete forever), `POST /{id}/archive`, `/unarchive`, `/join-code`, `/duplicate` |
| Edit mode | `POST /{id}/draft`, `/draft/discard`, `/draft/publish`, `PUT /{id}/draft/order` |
| Structure | `POST /{id}/sections`, `PATCH` / `DELETE /{id}/sections/{sid}`, `POST /{id}/items`, `/items/copy`, `DELETE /{id}/items/{iid}`, `POST /{id}/items/{iid}/draft` |
| Membership | `POST /join` (code), `POST /{id}/join`, `/leave`, `/invitation/accept`, `/invitation/decline` |
| Members | `GET` / `POST /{id}/members`, `POST /{id}/members/{uid}/approve`, `PATCH` / `DELETE /{id}/members/{uid}` |

Most writes return the new `SpaceDetail`, so the frontend replaces its cache with no refetch.

### Frontend (`src/features/courses/`)
- `/courses`: My courses, Catalog, Invitations. Create and Join with code in the header.
- `/courses/[slug-id]`: header with membership actions, then Content / Members / Settings tabs for authors, and the published outline for members.
- `/courses/join/[code]`: the join link. The user confirms with a click, so a link preview never adds a membership.
- Edit mode: up / down buttons reorder sections and items. At the edge of a section an item moves to the next section (`lib/draftOrder.ts`).
- Note page: a published course note is read-only (`CourseNoteView`). A draft course note uses the normal editor, with a course breadcrumb and no favorite or move actions.

---

## Planned

- **M3 Progress:** completion per item, attempt policy for course tests, test variants, student AI / RAG on joined spaces, SRS scope.
- **M4 Classrooms:** tabs, classroom courses, due dates, co-teachers, gradebook, grade override, Class AI key.
- **M5 Feed and notifications:** plain-text posts and comments, in-app bell with polling.

The full plan and decision log are in `.claude/local/TASK_CLASSROOM.md` while the feature is in progress.
