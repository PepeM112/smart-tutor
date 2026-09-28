from typing import ClassVar

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class BaseSchema(BaseModel):
    """
    Base schema for all SmartTutor Pydantic models.
    - snake_case (Python) <-> camelCase (Frontend)
    - Allows initialization using both field names and aliases.
    - Enables SQLAlchemy ORM compatibility (from_attributes).
    """

    model_config = ConfigDict(
        alias_generator=to_camel, validate_by_name=True, validate_by_alias=True, from_attributes=True
    )

    # Schemas such as `TestRead` start with "Test", so pytest tries to collect them as test
    # classes when a test file imports them. Dunder names are not Pydantic fields.
    __test__: ClassVar[bool] = False
