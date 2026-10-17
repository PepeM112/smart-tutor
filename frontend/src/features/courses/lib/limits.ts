/**
 * Same numbers as the backend (`SPACE_TITLE_MAX` in app/core/constants.py, the `SPACE_*_MAX`
 * constants in app/schemas/space.py). A longer value would cause a 422.
 */
export const COURSE_LIMITS = {
  title: 200,
  description: 5000,
  publishMessage: 2000,
} as const;
