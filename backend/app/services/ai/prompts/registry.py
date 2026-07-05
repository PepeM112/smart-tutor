from dataclasses import dataclass


@dataclass
class PromptTemplate:
    """A named prompt template that can be registered for reuse across AI features."""

    name: str
    system_prompt: str
    description: str


class PromptRegistry:
    """Simple dict-backed registry for prompt templates."""

    def __init__(self) -> None:
        self._templates: dict[str, PromptTemplate] = {}

    def register(self, template: PromptTemplate) -> None:
        self._templates[template.name] = template

    def get(self, name: str) -> PromptTemplate:
        return self._templates[name]

    def list_all(self) -> list[PromptTemplate]:
        return list(self._templates.values())


registry = PromptRegistry()
