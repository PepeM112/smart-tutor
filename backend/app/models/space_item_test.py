from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SpaceItemTest(Base):
    """A test (variant) of a TEST item. Each attempt uses one variant (see space_attempt_service).

    Draft items link the PUBLISHED tests; a content twin is made on the first edit (see space_draft_service).
    """

    __tablename__ = "space_item_test"

    item_id: Mapped[str] = mapped_column(String(26), ForeignKey("space_item.id", ondelete="CASCADE"), primary_key=True)
    test_id: Mapped[str] = mapped_column(
        String(26), ForeignKey("test.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    position: Mapped[int] = mapped_column(Integer)
