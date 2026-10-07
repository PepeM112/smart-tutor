"""Shared domain constants used across models, schemas, and services."""

# Maximum length for a Folder name column and its schema validation.
FOLDER_NAME_MAX = 100

# Days an item stays in Trash before it is deleted forever. After this time it also acts as gone.
TRASH_RETENTION_DAYS = 30

# Maximum length for a Space (course / classroom) title column.
SPACE_TITLE_MAX = 200

# Length of a space join code (lowercase letters + digits without look-alikes).
SPACE_JOIN_CODE_LENGTH = 7
