from abc import ABC, abstractmethod
from dataclasses import dataclass

from app.schemas.question import RubricItem


@dataclass(frozen=True)
class CriterionResult:
    index: int
    met: bool
    reason: str = ""


class GradingProvider(ABC):
    @property
    @abstractmethod
    def name(self) -> str: ...

    @abstractmethod
    def grade(
        self,
        prompt: str,
        rubric: list[RubricItem],
        answer: str,
    ) -> list[CriterionResult]: ...
