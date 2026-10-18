# Spaces (Courses and Classrooms)

A **space** is a shared learning area. There are two kinds:
- A **Course** is an ordered, published set of notes and tests that other users can join (Udemy / Coursera style).
- A **Classroom** is a class with a teacher, co-teachers and students. It contains courses, loose notes and tests, a feed and a gradebook (Google Classroom / Moodle style).

Personal content (notes, tests, questions, folders, Trash, SRS) does not change. Space content is a separate scope: `space_id IS NOT NULL`.

> **Status:** M1 and M2 (ST-66), M3 (ST-67) and M4 (ST-68) are done: the schema foundation, the access layer, standalone courses end to end (API + UI), progress, course tests with attempt rules, variants and a timer, student AI / RAG and the SRS opt-in, and classrooms (classwork, scheduling, co-teachers, gradebook, grade override, Class key). The stream and notifications come in M5.

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
| `role` | Integer, NULL | `SpaceRole`: EDITOR=2, VIEWER=3. NULL = inherit the parent classroom role (M4). CHECK `role != OWNER` |
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
3. Else the ACTIVE member row of the space itself wins over the row of the parent. So a classroom VIEWER can be an EDITOR of one course later, with no schema change. The rule works both ways: an old direct VIEWER row on a course (from before the user became a co-teacher of the classroom) wins over the inherited EDITOR role, so the user stays a VIEWER in that course until the row is removed.
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
- **Personal-only guards.** Move, favorite and soft delete of a note, soft delete of a test (`DELETE /tests/{id}`), Trash restore and delete forever, and question assign / duplicate call `require_personal` → 400. A course note or test is removed with its course item.
- **Bulk question actions** (bulk delete, bulk assign, restore) skip space questions and count them as skipped. This is the project rule for bulk endpoints.
- **Exams.** `test_service.get_takeable_test` gives 409 "Draft tests can not be taken" for a draft test (exam start and submit).
- **Versioning.** The frozen copy of a test keeps `space_id`, so old results of a space test still pass the access check.
- **SRS.** Space questions are not in SRS. `check_question` does not write `UserQuestionState` for them (M3 adds an opt-in).
- **Source note of a personal test.** A user can generate a personal test from a space note they can read. The test keeps `source_note_id`, so it links to the space note. This is the one link from personal content to space content, and it is intentional (the user can see where the questions came from). No UI shows the link today: only the backend keeps it. A draft note can not be a source (400), because publish deletes the draft twin and the link becomes NULL. The link can break:
  - The user leaves the space → the note load gives 403. The UI shows "You no longer have access to this file".
  - The space or the note is deleted → `source_note_id` becomes NULL (`ondelete="SET NULL"`), so the link is not shown. If the UI still has the old id, the load gives 404 and the UI shows "This file no longer exists".
- **AI Assistant.** Read tools use READ (a VIEWER can read published space notes). The RAG search covers the published notes of joined spaces (M3, see below). Write tools (`refine_note`, `edit_test`, `refine_questions`) use EDIT, so they refuse published space content. Confirm cards show a name only when the user has access.

---

## Courses (M2)

### Schema
| Table | Columns | Notes |
|---|---|---|
| `space_section` | `space_id`, `title`, `position`, `is_draft`, `draft_of_id` → `space_section` | the sections of a course |
| `space_item` | `space_id`, `section_id`, `kind`, `note_id` / `test_id` / `child_space_id`, `position`, `is_draft`, `draft_of_id` → `space_item` | `SpaceItemKind`: NOTE=1, TEST=2, COURSE=3. CHECK: only the target of its kind is set. A COURSE item exists in a classroom only (M4) |
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
   - Locks: publish locks the space row, then the draft notes and tests (`lock_draft_content`). `update_note` and `update_test` lock their row, so an autosave sent during a publish waits, then gets 404 (the twin is gone). Without the locks the PATCH got 200 and publish kept the older content.
5. **Discard** (`POST /draft/discard`): delete all draft rows and draft content. The published state does not change.
6. **Change check** (`services/space_changes_service.py`): `SpaceDetail.has_unpublished_changes` is true when publish would change what members see: a new, removed, renamed or moved section or item, or a twin whose content is different from its published row. The editor makes a twin when it opens a published note or test, so a twin with the same content is not a change. A course that was never published always has changes. Publish with no changes gives 409 ("Nothing to publish").

`notify_members` (M5) is stored only. `reset_item_ids` takes draft item ids and stores them as published item ids. Publish deletes the completion rows of those items and sets `space_item.progress_reset_at` to the publish time (M3). Best score, completion and the attempt count use only data after that time (see Rules).

### Visibility and joining
| | PUBLIC | UNLISTED | PRIVATE |
|---|---|---|---|
| In the catalog | yes | no | no |
| Join by link (`POST /{id}/join`) | ACTIVE at once | ACTIVE at once | a REQUESTED row that the owner approves |
| Join by code (`POST /join`) | ACTIVE | ACTIVE | ACTIVE (the code is the secret) |

- A course that was never published, or is archived, takes no joins (409). An archived course also keeps its join code (regenerate gives 409).
- A double join (2 requests at the same moment) is safe: the insert runs in a savepoint, and the second request ignores the duplicate row.
- An invitation (by username or email) makes an INVITED row: the user accepts or declines.
- Leave removes the own row (also a pending request). The owner can not leave.
- Archived: read-only for all users. Members keep access. The owner can still remove members, unarchive and delete forever.
- **Delete forever** needs the exact title in the body (400 otherwise). It deletes the test children through the ORM first (answers, SRS state, results, questions, groups, tests including frozen copies). Personal tests made from a course note survive (`source_note_id → NULL`).
- **Duplicate** copies the published content only, into a new course of the current user in edit mode. No members, results, progress or drafts. The body `SpaceDuplicateRequest` (title, description, tags) is required and sets the new course values. The title is required; the UI fills the form with the values of the source course.

### Endpoints (`/api/v1/spaces`, tag `spaces`)
| Group | Endpoints |
|---|---|
| Lists | `GET ""` (my courses; filters `status` = `active` (default) / `archived` / `all`, `visibility[]`, `role[]`), `GET /catalog` (search, sort `newest` / `members`, page), `GET /invitations` |
| Course | `POST ""`, `GET /{id}`, `PATCH /{id}`, `DELETE /{id}` (delete forever), `POST /{id}/archive`, `/unarchive`, `/join-code`, `/duplicate` |
| Edit mode | `POST /{id}/draft`, `/draft/discard`, `/draft/publish`, `PUT /{id}/draft/order` |
| Structure | `POST /{id}/sections`, `PATCH` / `DELETE /{id}/sections/{sid}`, `POST /{id}/items`, `/items/copy`, `DELETE /{id}/items/{iid}`, `POST /{id}/items/{iid}/draft` |
| Membership | `POST /join` (code), `POST /{id}/join`, `/leave`, `/invitation/accept`, `/invitation/decline` |
| Members | `GET` / `POST /{id}/members`, `POST /{id}/members/{uid}/approve`, `PATCH` / `DELETE /{id}/members/{uid}` |

Most writes return the new `SpaceDetail`, so the frontend replaces its cache with no refetch.

### Frontend (`src/features/courses/`)
- `/courses`: My courses (filters: status, visibility, role; archived is hidden by default) and Catalog (`SortMenu`). The header has the invitations button (Mail icon + count badge, a popover with Accept / Decline), Join with code and Create.
- `/courses/[slug-id]`: a 720px column (`lib/layout.ts`). The header has the membership actions, the settings cog (owner) and Edit. Authors get Content / Members tabs; members get the published outline. A click on a note row opens a read-only preview (`ResponsiveSplitPane` + `NotePreviewPanel`); a test row links to the test.
- Edit mode: every change saves to the draft at once (no Save button). The header shows "Saving… / Saved" (`useIsMutating` on `courseWriteKey`), Discard and Publish. Publish is disabled when `hasUnpublishedChanges` is false.
- `/courses/[slug-id]/settings`: owner only (other users go back to the course). Details, visibility (ButtonGroup), join code (`CopyChip` + Share menu: copy link, invite), duplicate (a dialog with title, description and tags), archive and delete forever.
- Members tab: a `DataTableV2` (name + `@username`, role, status, joined). The owner menu has approve / deny, change role, cancel invitation and remove. No emails and no progress per member.
- Content layout: `components/CourseLayout.tsx`. No cards: each section has a muted header bar (title + item count), with plain rows below. `CourseItemRow` has a `progress` slot (M3 fills it). The outline and the draft editor use the same frames.
- `/courses/join/[code]`: the join link. The user confirms with a click, so a link preview never adds a membership.
- Edit mode: up / down buttons reorder sections and items. At the edge of a section an item moves to the next section (`lib/draftOrder.ts`).
- Note page: a published course note is read-only (`CourseNoteView`). A draft course note uses the normal editor, with a course breadcrumb and no favorite or move actions. When the user can not edit the course (for example, it is archived), a draft note is read-only too.
- Roles: `lib/membership.ts` (`courseAccess`) reads `myRole`, not `myStatus`. The owner has no `space_member` row, so `myStatus` is null for the owner.
- The active tab is in the URL (`?tab=`, `src/hooks/useUrlTab.ts`). The pages are in `<Suspense>` because of `useSearchParams`.
- A 403 or 404 shows `CourseUnavailable` at once (no retries), also when the cache has old data (for example, Back after leave).
- Structure mutations share a TanStack `scope`, so they run one after the other (a reorder and a delete can not overwrite each other).

---

## Progress and course tests (M3)

### Schema
| Table / column | Notes |
|---|---|
| `space_item` + `pass_threshold` (0.5), `max_attempts` (NULL = unlimited), `cooldown_hours` (NULL = none), `reveal_answers` (`RevealAnswers`, default AFTER_PASS_OR_LAST), `time_limit_minutes` (NULL = no timer) | the attempt policy of a TEST item |
| `space_item_test` | PK `item_id` + `test_id`, `position`. The variants of a TEST item (1..N). `space_item.test_id` is gone: this table is the one source of truth |
| `space_attempt` | `item_id`, `user_id`, `test_id` (the live variant), `test_version`, `status` (`AttemptStatus` OPEN / SUBMITTED / EXPIRED), `started_at`, `deadline_at`, `finished_at`, `test_result_id`. A partial unique index allows one OPEN row per (user, item) |
| `space_item_completion` | PK `user_id` + `item_id`. Sparse: no row = not done |
| `space_member` + `include_in_srs` (false), `last_item_id` (SET NULL), `last_accessed_at`, `completed_at` | per-member state |
| `test_result.space_item_id` | SET NULL, indexed. Links a result to its course item |

### Rules
- **Progress and limits are for VIEWERs only.** Owners and editors preview a test with no limits and no rows (the exam of the first variant).
- **An archived course is frozen:** no new attempts and no mark (409). Old results and progress stay readable. A visit is allowed (it only moves a pointer).
- **NOTE done:** "Mark complete" / un-mark, or automatic when the student scrolls to the end of the note (once; after a manual un-mark it stays off).
- **TEST done:** the best score of all results with this `space_item_id` (all versions) ≥ `pass_threshold`. A PENDING Long Text answer is not a pass. The check runs again after submit, after background grading and after a challenge. A pass is final: only `reset_item_ids` removes it. After a reset, only results created after `space_item.progress_reset_at` count for the best score and the completion check. `progress_reset_at` exists on published items only: a draft twin or a duplicate does not copy it.
- **A hidden test can have a completion row.** `recheck_test_completion` has no visibility check, so a row can exist for an item with `visible_from` in the future (for example a teacher override on a test the student passed before it was hidden). The row keeps its old `completed_at`. The item counts in the course % only when it is visible. Accepted: only the date is old, no event is shown.
- **Course %** = done published items / published items, calculated live. `completed_at` is set at 100% and cleared when a publish adds or resets items.
- **Continue** opens `last_item_id`. If it is not set (or the item was removed), it opens the first item that is not done.

### Attempts (`services/space_attempt_service.py`)
1. **Start** (`POST /{id}/items/{iid}/attempts`): it locks the membership row, so two parallel starts can not pass the limits. It resumes the OPEN attempt (same variant, same deadline). Else it checks `max_attempts` (started attempts count) and `cooldown_hours` (from the last finished attempt). Both count only attempts started after `progress_reset_at`. A response has `serverNow` (UTC) so the client can correct its clock for the countdown, picks a variant and inserts a row. It returns the attempt and the exam of the pinned version, with no answer key.
2. **Variant pick:** the variant this student used least (`space_attempt.test_id`), random on a tie. A reload never gives a new variant, because the attempt row pins it.
3. **Submit** (`POST /{id}/attempts/{aid}/submit`, the same body as `/tests/{id}/submit`): it grades the version the student started. When `test_version` is not the live version, it grades the frozen snapshot (`parent_id` = variant, `version` = `test_version`) and maps the answers by `question.origin_id`. The result is on the snapshot, so it shows the "older version" label (`isOlderVersion`).
4. **Timer:** `deadline_at = started_at + time_limit_minutes`. The client shows a countdown and submits at 0. A submit after `deadline_at` + `ATTEMPT_GRACE_SECONDS` (60 s) gives 409 "Time is over", and the attempt is EXPIRED (it counts).
5. **Lazy expiry:** there is no scheduler. Read paths treat an OPEN attempt past the deadline + grace as ended. Start and submit write the EXPIRED status.
6. **Only way in:** a VIEWER can not call `GET /tests/{id}/exam` on a space test (403). Else the student could bypass the policy.
7. **Publish:** every publish that changes a test makes a snapshot and adds 1 to `test.version`, also with no results. A removed variant closes its open attempts as EXPIRED. A removed item deletes its attempts (FK CASCADE). A submit on an attempt whose variant is no longer linked (a start that raced with a publish) closes it as EXPIRED and gives 409 "This attempt can not be continued". A changed variant keeps its open attempts (seen-version grading).

### Answer key (`reveal_answers`)
- ALWAYS: always shown. NEVER: never shown. AFTER_PASS_OR_LAST: shown after the item is passed, or when no attempts are left. With unlimited attempts and no pass, it stays hidden.
- `GET /results/{id}/test` is the one result-test endpoint (personal results too; a personal result always gets the full test). When hidden, it removes the correct answers, the correct indices, the rubric and the explanations. `GET /results/{id}` blanks the rubric criterion text (`point`) and keeps `met`, `weight` and `reason`.
- Every payload of an attempt (start, resume, preview) has no explanations (`question_helpers.without_explanations`), because an explanation can give the answer away.
- The student still sees their own answer, its status, the score and the AI feedback on their own Long Text answer.

### Student AI, copy and SRS (Phase B)
- **RAG and the Assistant** read the personal notes and the published notes of spaces where the user is an ACTIVE member (`crud/note.readable_by_assistant`). Never drafts, never a space the user left, never INVITED / REQUESTED. Archived spaces stay in (members can still read them).
- **Indexing:** publish schedules indexing of the changed published notes (system embedding key). `index_note` returns early for drafts.
- **AI test generation** from a course note creates a **personal** test (`source_note_id` = the course note).
- **Copy to my library** (`POST /notes/{id}/copy-to-library`, any member with READ): a personal copy in the root folder, with no link.
- **SRS opt-in:** `PATCH /{id}/membership` sets `include_in_srs` (any ACTIVE member, "Include in Review" in the course header menu). Review (`GET /review/questions?scope=`) takes `all` (personal + opted-in courses), `personal` or one course id. Course questions in Review: published, ACTIVE, live tests only (`parent_id IS NULL`). Strict answer-key rule per item: ALWAYS items are in; AFTER_PASS_OR_LAST items are in only when the user has a completion row for the item; NEVER items are never in.
- **`/check` on a course question:** a member who opted in gets correct / wrong and the SRS write, but only for a question that follows the same strict rule as the Review pool. The correct answers come back only when `reveal_answers` allows them. A member who did not opt in gets 403.
- **Assistant during a test:** `POST /assist` gives 409 "The assistant is not available during a course test" while the user has an OPEN attempt that is not past its deadline + grace (an OPEN attempt with no deadline always counts).
- **Results list:** course attempts stay in the personal results list, with the course title (`spaceTitle`).

### Endpoints (M3)
| Group | Endpoints |
|---|---|
| Policy and variants (edit mode) | `PATCH /{id}/items/{iid}`, variants add / order / remove, `POST /{id}/items/{iid}/draft?test_id=` |
| Progress | `POST` / `DELETE /{id}/items/{iid}/completion`, `POST /{id}/visit` |
| Attempts | `POST /{id}/items/{iid}/attempts` (start or resume), `POST /{id}/attempts/{aid}/submit` |
| Membership | `PATCH /{id}/membership` (`include_in_srs`) |
| Other routers | `GET /results/{id}/test`, `POST /notes/{id}/copy-to-library`, `GET /review/questions?scope=` |

### Frontend
- Course attempt page `/courses/[slug-id]/tests/[itemId]` (`CourseAttemptPage`): the start call runs once, then `ExamView` with `initialAnswers`, `onAnswersChange` and `deadlineAt` (countdown, auto-submit at 0). `ExamView` stays generic.
- In-progress answers live in `localStorage` (`useAttemptDraft`, key = user id + attempt id), cleared on submit. A device change loses them (a server-side save is in `IDEAS.md`).
- `useLeaveGuard` (`src/hooks/`): `beforeunload` plus a capture-phase click listener on in-app links that opens a `ConfirmDialog`. The browser Back button is not blocked.
- `CourseProgress.tsx`: the item circle, the course bar, the mark button, the attempt info (attempts left, cooldown, time limit, best score) and Start / Resume.
- `CourseTestSettings.tsx`: the policy fields (they commit on blur) and the variant list in edit mode.
- History: an "older version" icon with a tooltip on the result page and the history row, and a course label.

---

## Classrooms (M4)

A classroom uses the same tables and the same engine as a course. Only the rules below are new.

### Classroom and course
| | Standalone course | Classroom | Course in a classroom |
|---|---|---|---|
| `space.kind` | COURSE | CLASSROOM | COURSE with `parent_id` |
| Visibility | PRIVATE / UNLISTED / PUBLIC | PRIVATE or UNLISTED (400 "A classroom can not be public"). Never in the catalog | none (400 "A course of a classroom has no visibility of its own") |
| Members | its own | its own | the members of the classroom |
| Publish | on its own | on its own | on its own |
| Item kinds | NOTE, TEST | NOTE, TEST, COURSE | NOTE, TEST |
| Per-member data | none (R12) | gradebook for teachers | gradebook for teachers |

- A classroom can be joined before its first publish (the teacher invites the students first). A course cannot.
- A student sees a classroom course only when a **published** COURSE item points to it and its `visible_from` is empty or past (`space_item_crud.visible_course_ids`). A course with only a draft item stays hidden until the classroom publishes.
- Delete forever of a classroom deletes its courses first, through the ORM, then the classroom.

### Inherited roles and the lazy member row
- `space_member.role` is nullable. **NULL = inherit the role of the parent classroom.** `_resolve_role` skips a NULL row, so a promote or a demote in the classroom applies to its courses at once. The CHECK `role != OWNER` still holds (NULL passes it).
- A student has no row in a classroom course at first. The row is made **lazily on a write of personal state**: a visit, a mark, an attempt start, the "Include in Review" toggle. `space_progress_service.get_member_row` is the one helper for it. A read (RAG, `joined_space_ids`, access) needs no row: `joined_space_ids` is a SQL query over the membership of the parent.
- Leaving or removal from a classroom deletes the lazy rows of the user in its courses (`space_member_crud.delete_in_children`).
- The owner of the classroom is OWNER in its courses. Only ACTIVE members count, as before.

### Roles in a classroom (R33)
| Action | OWNER | EDITOR (co-teacher) | VIEWER (student) |
|---|---|---|---|
| Edit classwork, create courses, publish, discard | yes | yes | no |
| Invite, approve, deny, remove **students** | yes | yes | no |
| See the member list, the gradebook and student results | yes | yes | no |
| Grade override | yes | yes | no |
| Settings, Class key, token usage | yes | no (403 "Only the owner can do this") | no |
| Rename a course of the classroom (`PATCH`) | yes | no (owner only on purpose; a co-teacher edits the content, not the course data) | no |
| Add or remove co-teachers (set role, remove an EDITOR) | yes | no | no |
| Archive, unarchive, delete forever, regenerate the join code | yes | no | no |

An archived classroom is read-only for all users. A course of an archived classroom is archived too. The owner can still remove members, unarchive and delete forever.

### Classwork
- The classroom has sections and items like a course. Item kinds: **COURSE**, NOTE, TEST. A loose note or test (placed straight in the classroom) uses the same Edit mode + Publish (`space_draft_service`). A TEST item keeps the M3 attempt policy and variants.
- **Add a course** (`POST /classrooms/{id}/courses`): a new empty course at the end of a draft section. The service makes the course (same owner as the classroom, PRIVATE, no join code, in edit mode) and a draft COURSE item. The classroom must be in edit mode.
- **Duplicate into classroom** (`POST /classrooms/{id}/courses/duplicate`): copies the published content of one of my standalone courses (`copy_published_content`). No members, drafts, results or progress. A source that has a parent is refused (404).
- **A course publishes on its own.** Publishing the classroom shows the COURSE item. Publishing the course shows its content.
- **Orphan sweep:** a course that no COURSE item (draft or published) points to is deleted forever (`_sweep_orphan_courses`). The sweep runs after discard, publish, item delete and section delete. **It never deletes student data.** If an orphan course has a result or an attempt of a user who is not the owner or a co-teacher of the classroom, the whole call fails with 409 `"A removed course has student results. Delete the course forever first."` (`ORPHAN_HAS_RESULTS`) and nothing changes (the service rolls back). The owner then deletes the course on purpose: `DELETE /spaces/{course id}` with the typed title (`delete_course_forever`; it accepts a course of a classroom too, owner only). The COURSE items that point to it go with the FK cascade, so the next publish succeeds. An orphan with no student data (a new empty course, a discarded course) is swept as before.
- The classroom page has 5 tabs: Stream (placeholder until M5), Classwork, Members, Grades (teachers), Settings (owner).

### Scheduling (R32, R32b)
Four fields on `space_item`. UTC, null = not set. The teacher sets them in Edit mode (`PATCH /spaces/{id}/items/{iid}`; a sent null clears the value). They are part of the change check, so a changed date is an unpublished change. `opens_at` and `closes_at` are for TEST items only. `closes_at` must be after `opens_at` (else the request is refused). `opens_at`, `closes_at` and `visible_from` also work in standalone courses.

| Field | Item | Effect |
|---|---|---|
| `opens_at`, `closes_at` | TEST | The test window. A new attempt starts only inside it: before `opens_at` → 409 "The test is not open yet"; at or after `closes_at` → 409 "The test is closed". The submit is checked too: after `closes_at` + 60 s grace → 409 "The test is closed", and the attempt is EXPIRED. |
| deadline | TEST | `deadline_at = min(started_at + time_limit_minutes, closes_at)`. The window is hard: the countdown shows the earlier time. The submit also checks `closes_at` itself, because a teacher can set `closes_at` after an attempt started. |
| `visible_from` | any | A student does not see the item before this time. Owner and co-teachers see it with a "Scheduled" label. |
| `due_at` | any | Shown in the "Due soon" list of the classroom (24 h window) for a student who has not done the item. The notification is M5. |

**`visible_from` skip paths.** A hidden item is skipped in all of these. A hidden COURSE item hides the whole course.
1. `access_service` (a VIEWER gets 404 on the attempt and mark paths).
2. `crud/note.readable_by_assistant` (RAG and the Assistant).
3. `crud/question._reviewable_test_filter` (Review and `/check`).
4. The course % (the gradebook lists the item with `hidden = true` for teachers).
5. `continueItem` in the frontend (`lib/progress.ts`).

### Gradebook (R34)
`GET /classrooms/{id}/gradebook` (owner or co-teacher). One response, **not paged**: a classroom has tens of students and the teacher needs the whole matrix. The query count is fixed and does not grow with the students.
- Rows: ACTIVE students. Columns: published TEST items (loose ones first, then the items of each course in classwork order) and one % column per published course. A course with only a draft item is not in it.
- Cell: `status` (`GradeCellStatus`), `bestScore` (0..100), `attemptsUsed`, `bestResultId`, `overridden`.
- Status, first rule that fits: PASSED (a completion row, or best graded score ≥ `pass_threshold`), PENDING (a result has an answer in grading), IN_PROGRESS (an attempt is open), FAILED (an attempt or a graded result exists), NOT_STARTED.
- It uses `crud/test_result.best_scores_by_item`, so it agrees with the course % and respects `progress_reset_at`.
- A teacher can read `GET /results/{id}` and `/results/{id}/test` of a student of the classroom, with the full answers (`access_service.can_review_result`). `TestResultRead.can_override` tells the frontend to show the override UI.

### Grade override (R35)
- `PUT /answers/{id}/override` with `{ score }`, and `DELETE /answers/{id}/override`. Both return the updated `TestResultRead`.
- Only an OWNER or EDITOR of the classroom, and only in a classroom. A viewer or a personal result gives 403. A standalone course gives 400 "Grade overrides are only available in classrooms". The score must be from 0 to the points of the question (400). An archived classroom gives 409.
- The `answer` row gets `override_score`, `override_status` (full points = CORRECT, 0 = WRONG, else PARTIAL), `overridden_by`, `overridden_at`. The AI grade (`status`, `rubric_result`) stays. See [Answer Grading](answer-grading.md#teacher-override).
- The service locks the result, reads it again, calls `recalculate_test_result`, then `space_progress_service.recheck_result_completion`. A pass creates the completion row, so Review follows. **A fail override never removes a completion row.** Progress is sticky. To undo a pass, reset the item progress.
- The student sees "Graded by your teacher" and the AI grade.

### Class key (R36 to R39)
The owner sets a Class key in `classroom_settings`: a provider and a Fernet-encrypted key, the same as user keys. `GET` and `PATCH /classrooms/{id}/settings` (owner only) never return the key (`hasClassKey` only). An empty `classKey` removes it. A key with no provider gives 400 "Choose a provider for the Class key". Changing `aiProvider` to a different value while a key is stored needs a new `classKey` in the same request (an empty one removes the key); else 422 "Send a new Class key when you change the provider". An **archived** classroom is read-only, with one exception: `PATCH` with exactly `{"classKey": ""}` removes the key (any other body gives 409).

| Setting | Values | Default |
|---|---|---|
| `key_priority` | STUDENT, CLASS | CLASS |
| `key_scope` | CLASSROOM_CONTENT, ALL | CLASSROOM_CONTENT |
| `monthly_token_cap_per_student` | integer, or null (no cap) | null |
| `feed_permission` | TEACHERS_ONLY, STUDENTS_COMMENT, STUDENTS_POST_AND_COMMENT | STUDENTS_COMMENT (stored now, used in M5) |

**Resolution.** `services/llm_key_service.py` has one `resolve_llm(db, user, space_id)` for all AI features. `plan_key` makes the same decision with no client, for the status endpoint (R38 matrix):

| Student key | Class key | Result |
|---|---|---|
| no | no | blocked (`NO_KEY_MESSAGE`) |
| yes | no | student key (the UI warns that it uses the student's tokens) |
| no | yes | Class key. Over the cap: blocked (`CAP_REACHED_MESSAGE`) |
| yes | yes | `key_priority` decides. STUDENT priority, or over the cap: student key. Else Class key |

- **Only an ACTIVE student (VIEWER) of the classroom uses the Class key.** The owner and the co-teachers use their own key. A student who left uses their own key.
- **An archived classroom has no usable Class key.** The plan falls back as for "no class key" (student key, or blocked). The key stays stored, so unarchive restores it. The key status and the cap numbers follow the same rule.
- **A key that cannot be decrypted** (the encryption key changed, or a corrupt row), for a Class key or a user key, gives the normal key error (`AIKeyError`, "The saved AI key cannot be read. Please enter the key again."), not a 500.
- **Scope.** The `space_id` of a call is the classroom, or a course of it. CLASSROOM_CONTENT: the Class key serves only calls that have a `space_id` of this classroom: grading and challenge of a classroom test, and Assistant requests with `AssistRequest.space_id`. ALL: it also serves personal calls (`space_id` is None, for example note and test generation). Then the **oldest** classroom (by `created_at`, then id) with a usable Class key pays, and the usage is booked on it. A classroom that cannot pay (the cap, or the student key goes first) does not block the next one. If none pays and the student has a key, the student key is used. Else the first block message is returned.
- **Cap.** It counts only `token_usage` rows with `key_source = CLASS` of the student, in the classroom and its courses, in the current UTC calendar month. Spend with the student key does not count. `used >= cap` means the cap is reached.
- **Soft cap.** The cap is checked before a call and nothing is reserved. The usage row is written after the call, so parallel calls of one student (for example several Assistant requests, or a grading batch that starts just under the cap) can all pass the check and take the month total a little over the cap. Accepted: the overshoot is small, and the owner sees it in the spend table.
- **Known limit: deleting a course lowers the cap count.** `token_usage.space_id` is `ON DELETE SET NULL`. When a child course is deleted (the orphan sweep on publish, or delete forever), its usage rows lose the space, so they no longer count in the cap of the classroom and no longer show in the spend table. The student can then spend that part of the cap again. A fix needs a stored classroom id on `token_usage` (a new column and migration); not done.
- **Assistant `spaceId`.** It comes from the client route (`spaceIdFromRoute`). The server does not check it against the key scope: any Assistant call made from a classroom page counts as classroom content. It is bounded by the membership (only an ACTIVE student of the classroom gets the Class key) and by the monthly cap.
- **Callers.** Grading (background) and challenge use the student who owns the result and the space of its item. The Assistant uses `AssistRequest.space_id` (the frontend reads it from the route, `spaceIdFromRoute`). The 409 on `/assist` during a live course attempt stays.
- **Booking.** `token_usage.space_id` is set for a Class-key call (the classroom that pays). For a student-key call it is set only when the user is a member of that space, so nobody can book on a foreign space. `token_usage.key_source` (`KeySource`: STUDENT=1, CLASS=2) says who paid. Rows from before ST-68 are STUDENT.
- `GET /classrooms/{id}/ai-key-status` (any member; a stranger gets 403) returns `status` (`KeyStatus`: NONE, STUDENT, CLASS), `capReached`, `tokensUsedThisMonth`, `monthlyTokenCap`. The frontend shows a notice when the status is STUDENT.
- `GET /classrooms/{id}/token-usage` (owner only): per student, this month and in total, split by key source, with `isActive` (a student who left keeps the past spend). See [Token Usage](token-usage.md#classroom-spend).

### Endpoints (`/api/v1/classrooms`, tag `classrooms`)
Shared actions use the `/spaces` routes: get, update, archive, unarchive, delete forever, join code, members, join (link or code), leave, invitations, edit mode, sections, items, completion, attempts.

| Group | Endpoints |
|---|---|
| List and create | `GET ""` (filters `status`, `role[]`), `POST ""` |
| Settings (owner) | `GET` / `PATCH /{id}/settings` |
| Courses | `POST /{id}/courses`, `POST /{id}/courses/duplicate` |
| Students | `GET /{id}/due-soon` (empty for the owner and the co-teachers) |
| Teachers | `GET /{id}/gradebook` |
| AI key | `GET /{id}/ai-key-status` (any member), `GET /{id}/token-usage` (owner) |
| Override (`/api/v1/answers`) | `PUT` / `DELETE /{id}/override` |

### Error strings that the frontend matches
The backend sends English `detail` only. The frontend matches the exact text and shows its own translated text (en / es). If a text changes, the match fails and the user sees a generic error. Change both sides together.

| `detail` | Where | Frontend file |
|---|---|---|
| "The test is not open yet" | attempt start (409) | `courses/lib/attemptErrors.ts` |
| "The test is closed" | attempt start and submit (409) | `attemptErrors.ts` |
| "The classroom is archived" / "The course is archived" | writes (409) | `attemptErrors.ts`, `history/utils/overrideErrors.ts` |
| "Grade overrides are only available in classrooms" | override (400) | `overrideErrors.ts` |
| "The score must be between 0 and N" | override (400) | `overrideErrors.ts` |
| "A teacher graded this answer. It cannot be challenged." | challenge (409) | `overrideErrors.ts` |
| "AI is not configured. Please add your API key in Settings." | any AI call (HTTP 403, or SSE `error` in the Assistant) | `assist/utils/assistErrors.ts` |
| "The AI budget of this classroom is used up for this month. Add your own API key in Settings to continue." | any AI call (HTTP 403, or SSE `error` in the Assistant) | `assistErrors.ts` |
| "The assistant is not available during a course test" | `/assist` (409) | `assistErrors.ts` |

### Frontend (`src/features/classrooms/`)
- Routes `/classrooms` (list, create) and `/classrooms/[slug-id]` (the tab is in the URL, `?tab=`). The sidebar has a Classrooms entry. `spaceHref` gives the right link for a course or a classroom. Join and invitations route by kind.
- `ClassroomPage`: Stream (`PlaceholderTab`, M5), Classwork (the outline and editor of `features/courses/`, plus `DueSoonList`), Members, Grades (`GradesTab`), Settings (`ClassroomSettingsTab`: feed permission, `ClassKeySection`, `ClassSpendTable`).
- A course of a classroom uses the course pages: crumbs back to the classroom, no visibility badge, no join or leave, no Members tab, details only in its settings.
- `lib/schedule.ts`, `ItemSchedulePanel` and `ScheduleBadges` edit and show the dates. The attempt card handles the window.
- `AiKeyNotice` shows the student-key warning on the classroom page and on its course pages (students only).
- `CourseUnavailable`: a 403 on a course keeps "ask to join". If the join answers 404 (the backend does this for a classroom course), it shows a classroom text.

---

## Planned

- **M5 Feed and notifications:** plain-text posts and comments, in-app bell with polling. Hooks that M4 stores already: `space_publish.notify_members`, `classroom_settings.feed_permission`, `space_item.due_at`.

The full plan and decision log are in `.claude/local/TASK_CLASSROOM.md` while the feature is in progress.
