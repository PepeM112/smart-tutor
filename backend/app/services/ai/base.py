from abc import ABC, abstractmethod

from app.core.enums import NoteLength


class AIProvider(ABC):
    @property
    @abstractmethod
    def name(self) -> str: ...

    @abstractmethod
    def generate_notes(
        self,
        topic: str,
        guidance: str | None = None,
        length: NoteLength | None = None,
    ) -> str: ...
