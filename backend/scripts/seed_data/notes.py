"""Seed study notes with embedding vectors for RAG."""

import logging

from sqlalchemy.orm import Session

from app.core.enums import NoteSource
from app.models.note import Note
from app.services import embedding_service

logger = logging.getLogger("smarttutor.seed.notes")

NOTES = [
    {
        "title": "Spanish Verb Conjugations",
        "description": "Regular verb conjugation patterns in present tense",
        "content": (
            "# Spanish Verb Conjugations — Present Tense\n\n"
            "## -AR Verbs (hablar — to speak)\n"
            "| Pronoun | Ending | Example |\n"
            "|---------|--------|---------|\n"
            "| yo | -o | hablo |\n"
            "| tú | -as | hablas |\n"
            "| él/ella | -a | habla |\n"
            "| nosotros | -amos | hablamos |\n"
            "| vosotros | -áis | habláis |\n"
            "| ellos | -an | hablan |\n\n"
            "## -ER Verbs (comer — to eat)\n"
            "| Pronoun | Ending | Example |\n"
            "|---------|--------|---------|\n"
            "| yo | -o | como |\n"
            "| tú | -es | comes |\n"
            "| él/ella | -e | come |\n"
            "| nosotros | -emos | comemos |\n"
            "| vosotros | -éis | coméis |\n"
            "| ellos | -en | comen |\n\n"
            "## -IR Verbs (vivir — to live)\n"
            "| Pronoun | Ending | Example |\n"
            "|---------|--------|---------|\n"
            "| yo | -o | vivo |\n"
            "| tú | -es | vives |\n"
            "| él/ella | -e | vive |\n"
            "| nosotros | -imos | vivimos |\n"
            "| vosotros | -ís | vivís |\n"
            "| ellos | -en | viven |\n"
        ),
        "tags": ["spanish", "grammar", "verbs"],
    },
    {
        "title": "Cell Biology Fundamentals",
        "description": "Core concepts of cell structure and function",
        "content": (
            "# Cell Biology Fundamentals\n\n"
            "## Cell Types\n"
            "- **Prokaryotic**: No membrane-bound nucleus. Examples: bacteria, archaea.\n"
            "- **Eukaryotic**: Membrane-bound nucleus and organelles. Examples: animals, plants, fungi.\n\n"
            "## Key Organelles\n"
            "1. **Nucleus**: Contains DNA, controls gene expression.\n"
            "2. **Mitochondria**: Powerhouse — produces ATP via oxidative phosphorylation.\n"
            "3. **Endoplasmic Reticulum (ER)**: Rough ER has ribosomes (protein synthesis). "
            "Smooth ER handles lipid synthesis and detox.\n"
            "4. **Golgi Apparatus**: Modifies, packages, and ships proteins.\n"
            "5. **Ribosomes**: Translate mRNA into proteins (in cytoplasm or on rough ER).\n"
            "6. **Lysosomes**: Digest waste via hydrolytic enzymes (pH ~5).\n\n"
            "## Cell Membrane\n"
            "- Phospholipid bilayer with embedded proteins.\n"
            "- Selective permeability: controls what enters and exits.\n"
            "- Transport: passive (diffusion, osmosis) vs active (requires ATP).\n"
        ),
        "tags": ["biology", "cells", "science"],
    },
    {
        "title": "World War II Timeline",
        "description": "Key events from 1939 to 1945",
        "content": (
            "# World War II — Key Events\n\n"
            "## 1939\n"
            "- **Sep 1**: Germany invades Poland — WWII begins.\n"
            "- **Sep 3**: Britain and France declare war on Germany.\n\n"
            "## 1940\n"
            "- **May-Jun**: Fall of France. Dunkirk evacuation.\n"
            "- **Jul-Oct**: Battle of Britain — RAF defends against Luftwaffe.\n\n"
            "## 1941\n"
            "- **Jun 22**: Operation Barbarossa — Germany invades the Soviet Union.\n"
            "- **Dec 7**: Japan attacks Pearl Harbor — US enters the war.\n\n"
            "## 1942-1943\n"
            "- **Feb 1943**: Battle of Stalingrad ends — turning point on Eastern Front.\n"
            "- **Jul 1943**: Allied invasion of Sicily.\n\n"
            "## 1944\n"
            "- **Jun 6**: D-Day — Allied landings in Normandy.\n"
            "- **Aug 25**: Liberation of Paris.\n\n"
            "## 1945\n"
            "- **Apr 30**: Hitler dies in his bunker.\n"
            "- **May 8**: V-E Day — Germany surrenders.\n"
            "- **Aug 6 & 9**: Atomic bombs on Hiroshima and Nagasaki.\n"
            "- **Sep 2**: V-J Day — Japan surrenders. WWII ends.\n"
        ),
        "tags": ["history", "wwii", "timeline"],
    },
]


def seed_notes(db: Session, user_id: str) -> list[Note]:
    notes: list[Note] = []
    for data in NOTES:
        note = Note(
            user_id=user_id,
            title=data["title"],
            description=data["description"],
            content=data["content"],
            source=NoteSource.USER_CREATED,
            tags=data["tags"],
        )
        db.add(note)
        db.flush()
        notes.append(note)

    db.commit()

    indexed = 0
    for note in notes:
        try:
            embedding_service.index_note(db, note_id=note.id)
            indexed += 1
        except Exception:
            print(f"  (skipped embedding for '{note.title}' — SYSTEM_OPENAI_API_KEY may not be set)")

    print(f"  ({indexed}/{len(notes)} notes indexed with embeddings)")
    return notes
