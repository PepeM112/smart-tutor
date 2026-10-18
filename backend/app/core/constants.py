"""Shared domain constants used across models, schemas, and services."""

# Maximum length for a Folder name column and its schema validation.
FOLDER_NAME_MAX = 100

# Days an item stays in Trash before it is deleted forever. After this time it also acts as gone.
TRASH_RETENTION_DAYS = 30

# Maximum length for a Space (course / classroom) title column.
SPACE_TITLE_MAX = 200

# Length of a space join code (lowercase letters + digits without look-alikes).
SPACE_JOIN_CODE_LENGTH = 7

# Seconds a submit may come after the deadline of a timed attempt (network delay of the auto-submit).
ATTEMPT_GRACE_SECONDS = 60

# Default `pass_threshold` of a course test: the share of the points (0..1) that passes.
DEFAULT_PASS_THRESHOLD = 0.5
