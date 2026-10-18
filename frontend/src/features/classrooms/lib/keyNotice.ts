import { type AiKeyStatusRead, KeyStatus } from '@/client';

export type KeyNoticeKind = 'none' | 'student' | 'cap_reached';

/**
 * Which notice a student sees. Returns null when nothing needs saying (the Class key pays).
 * A reached cap comes first: the student cannot use AI at all until the month ends.
 * Teachers never see a notice (the caller passes `isStudent`).
 */
export function keyNoticeKind(status: AiKeyStatusRead | undefined, isStudent: boolean): KeyNoticeKind | null {
  if (!status || !isStudent) return null;
  if (status.capReached) return 'cap_reached';
  if (status.status === KeyStatus.NONE) return 'none';
  if (status.status === KeyStatus.STUDENT) return 'student';
  return null;
}

export const KEY_NOTICE_TEXT: Record<KeyNoticeKind, string> = {
  none: 'classrooms.key_notice_none',
  student: 'classrooms.key_notice_student',
  cap_reached: 'classrooms.key_notice_cap_reached',
};
