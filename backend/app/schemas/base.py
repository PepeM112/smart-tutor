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
