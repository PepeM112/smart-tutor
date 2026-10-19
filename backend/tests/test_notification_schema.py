from app.core.enums import NotificationType
from app.schemas.notification import _PAYLOAD_KIND_BY_TYPE


def test_every_notification_type_has_a_payload_kind() -> None:
    """A missing entry is a `KeyError` in `NotificationRead` (not a `ValidationError`), so one bad row gives 500."""
    assert set(_PAYLOAD_KIND_BY_TYPE) == set(NotificationType)
