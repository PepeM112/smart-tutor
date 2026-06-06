from app.services.srs_service import EASE_FLOOR, apply_sm2


class TestSM2Correct:
    def test_first_correct_sets_interval_1(self) -> None:
        result = apply_sm2(quality=5)
        assert result.interval == 1
        assert result.repetitions == 1

    def test_second_correct_sets_interval_6(self) -> None:
        result = apply_sm2(quality=5, repetitions=1, interval=1, ease_factor=2.5)
        assert result.interval == 6
        assert result.repetitions == 2

    def test_third_correct_multiplies_by_ease(self) -> None:
        result = apply_sm2(quality=5, repetitions=2, interval=6, ease_factor=2.5)
        assert result.interval == 15  # round(6 * 2.5)
        assert result.repetitions == 3

    def test_ease_increases_on_perfect_score(self) -> None:
        result = apply_sm2(quality=5, ease_factor=2.5)
        assert result.ease_factor > 2.5


class TestSM2Wrong:
    def test_wrong_resets_to_interval_1(self) -> None:
        result = apply_sm2(quality=1, repetitions=5, interval=30, ease_factor=2.5)
        assert result.interval == 1
        assert result.repetitions == 0

    def test_ease_drops_on_wrong(self) -> None:
        result = apply_sm2(quality=1, ease_factor=2.5)
        assert result.ease_factor < 2.5

    def test_ease_never_below_floor(self) -> None:
        result = apply_sm2(quality=1, ease_factor=EASE_FLOOR)
        assert result.ease_factor >= EASE_FLOOR

    def test_repeated_wrongs_stay_at_floor(self) -> None:
        ef = 2.5
        for _ in range(20):
            r = apply_sm2(quality=1, ease_factor=ef)
            ef = r.ease_factor
        assert ef >= EASE_FLOOR


class TestSM2Partial:
    def test_partial_increments_repetitions(self) -> None:
        result = apply_sm2(quality=3, repetitions=0, interval=0, ease_factor=2.5)
        assert result.repetitions == 1
        assert result.interval == 1

    def test_partial_ease_stays_roughly_flat(self) -> None:
        result = apply_sm2(quality=3, ease_factor=2.5)
        assert abs(result.ease_factor - 2.5) < 0.2


class TestSM2MultiRepetitionProgression:
    def test_five_correct_reviews_grow_interval(self) -> None:
        ef, interval, reps = 2.5, 0, 0
        for _ in range(5):
            r = apply_sm2(quality=5, ease_factor=ef, interval=interval, repetitions=reps)
            ef, interval, reps = r.ease_factor, r.interval, r.repetitions
        assert interval > 30
        assert reps == 5

    def test_next_review_is_in_the_future(self) -> None:
        from datetime import datetime, timezone

        result = apply_sm2(quality=5)
        assert result.next_review > datetime.now(timezone.utc)
