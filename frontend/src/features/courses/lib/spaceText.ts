/**
 * Toast keys of the course writes that name the space. A classroom page uses the same writes
 * (`useCourseActions`), so these keys swap to the `classrooms` text. Other keys are neutral.
 */
const CLASSROOM_TEXT: Readonly<Record<string, string>> = {
  'courses.published': 'classrooms.published',
  'courses.failed_to_publish': 'classrooms.failed_to_publish',
  'courses.archived': 'classrooms.archived',
  'courses.unarchived': 'classrooms.unarchived',
  'courses.deleted': 'classrooms.deleted',
  'courses.failed_to_delete': 'classrooms.failed_to_delete',
  'courses.joined': 'classrooms.joined',
  'courses.failed_to_join': 'classrooms.failed_to_join',
  'courses.request_sent': 'classrooms.request_sent',
  'courses.left': 'classrooms.left',
  'courses.failed_to_leave': 'classrooms.failed_to_leave',
};

/** The translation key to use for `key` on a course page or a classroom page. */
export function spaceTextKey(key: string, isClassroom: boolean): string {
  return isClassroom ? (CLASSROOM_TEXT[key] ?? key) : key;
}
