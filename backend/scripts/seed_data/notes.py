"""Seed study notes."""

from sqlalchemy.orm import Session

from app.core.enums import NoteSource
from app.models.note import Note

MARKDOWN_TEST_CONTENT = """# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6

---

This is a normal paragraph. It has **bold text**, *italic text*, `inline code`, and a [link](https://example.com).

## Lists

### Bullet list

- Item one
- Item two
  - Nested item
  - Another nested
- Item three

### Numbered list

1. First
2. Second
3. Third

### Checkboxes

- [x] Completed task
- [ ] Incomplete task
- [x] Another done

## Table

| Name    | Type   | Required |
|---------|--------|----------|
| title   | string | yes      |
| content | text   | no       |
| tags    | array  | no       |

## Code Blocks

Inline: `const x = 42;`

```python
def hello(name: str) -> str:
    return f"Hello, {name}!"
```

```typescript
function greet(name: string): string {
  return `Hello, ${name}!`;
}
```

## Blockquote

> This is a blockquote.
> It can span multiple lines.

## Image (placeholder)

![Alt text](https://via.placeholder.com/300x100)

## Horizontal Rules

---

***

___

That covers the main Markdown features!"""


def seed_notes(db: Session, user_id: str) -> list[Note]:
    note = Note(
        user_id=user_id,
        title="Markdown Test Note",
        description="Comprehensive markdown formatting reference for testing the renderer",
        content=MARKDOWN_TEST_CONTENT,
        source=NoteSource.USER_CREATED,
        tags=["test", "markdown", "reference"],
    )
    db.add(note)
    db.flush()
    return [note]
