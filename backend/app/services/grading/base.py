from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import TypedDict

from typing_extensions import NotRequired

from app.schemas.question import RubricItem


class RawCriterionDict(TypedDict):
    index: int
    met: bool
    reason: NotRequired[str]


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
