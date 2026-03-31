from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class BaseSchema(BaseModel):
    """
    Ensures Python snake_case becomes Frontend camelCase.
    Also allows reading from SQLAlchemy ORM objects (from_attributes).
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)
