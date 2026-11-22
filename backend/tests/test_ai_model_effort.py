"""Tests for the Anthropic model and effort settings (no DB, no network).

Covers: the defaults and the merge of the settings, the request that goes to the SDK (effort only on Haiku 5.5),
parsing of responses that start with `thinking` blocks, the refusal on each kind of route, the Class key rule,
the thinking blocks in the Assistant tool loop, and the OpenRouter price mapping.

Run:  pytest tests/test_ai_model_effort.py
"""

from __future__ import annotations

import json
from collections.abc import Callable, Generator
from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from anthropic.types import RedactedThinkingBlock, TextBlock, ThinkingBlock, ToolUseBlock
from fastapi import HTTPException
from pydantic import ValidationError

from app.core.ai_settings import (
    DEFAULT_AI_EFFORT,
    DEFAULT_ANTHROPIC_MODEL,
    HAIKU_4_5,
    HAIKU_5_5,
    AiAction,
    AiEffort,
    resolve_anthropic_model,
    resolve_effort_map,
)
from app.core.enums import AIProvider, AnswerStatus, KeySource, LongTextLength, QuestionType
from app.core.model_registry import SDK_TO_OPENROUTER
from app.models.user import User
from app.schemas.assist import AssistMessage, AssistRequest
from app.schemas.question import LongTextContent, RubricItem
from app.schemas.user import AiEffortSettings, AiEffortUpdate, UserRead, UserUpdate
from app.services import (
    challenge_service,
    grading_service,
    llm,
    llm_key_service,
    pricing_service,
    user_service,
)
from app.services.ai_settings_service import efforts_of
from app.services.assist_service import _to_anthropic_messages, stream_assist
from app.services.llm import (
    REFUSAL_MESSAGE,
    THINKING_HEADROOM,
    AIRefusalError,
    AnthropicLLMClient,
    CompletionResult,
    StreamResult,
    TextDelta,
    ToolCallDelta,
    complete_for_user,
)
from app.services.llm_key_service import KeyPlan, ResolvedLLM
from tests.llm_fakes import resolve_to

ASSIST = "app.services.assist_service"
_PLAIN_USER = SimpleNamespace(id="u1", ai_provider=None)


def _client(model: str = HAIKU_5_5) -> AnthropicLLMClient:
    return AnthropicLLMClient(api_key="sk-ant-test", model=model)  # type: ignore[arg-type]


def _response(*blocks: Any, stop_reason: str = "end_turn") -> SimpleNamespace:
    return SimpleNamespace(
        content=list(blocks), stop_reason=stop_reason, usage=SimpleNamespace(input_tokens=10, output_tokens=20)
    )


def _text(text: str) -> TextBlock:
    return TextBlock(type="text", text=text)


def _thinking() -> ThinkingBlock:
    return ThinkingBlock(type="thinking", thinking="Let me think.", signature="sig-123")


def _complete_with(client: AnthropicLLMClient, response: SimpleNamespace, effort: AiEffort = "high") -> Any:
    client._client = MagicMock()
    client._client.messages.create.return_value = response
    result = client.complete(system="sys", user_prompt="usr", max_tokens=1000, effort=effort)
    return result, client._client.messages.create.call_args.kwargs


def _fake_stream(final: SimpleNamespace) -> MagicMock:
    stream = MagicMock()
    stream.__enter__.return_value = stream
    stream.__iter__.return_value = iter([])
    stream.get_final_message.return_value = final
    return stream


def _drain(gen: Generator[Any, None, StreamResult]) -> StreamResult:
    while True:
        try:
            next(gen)
        except StopIteration as stop:
            return stop.value


# ---------------------------------------------------------------------------
# Defaults and merge
# ---------------------------------------------------------------------------


class TestSettingsResolvers:
    def test_no_saved_model_gives_haiku_5_5(self) -> None:
        assert resolve_anthropic_model(None) == HAIKU_5_5 == DEFAULT_ANTHROPIC_MODEL

    def test_saved_model_is_kept(self) -> None:
        assert resolve_anthropic_model(HAIKU_4_5) == HAIKU_4_5

    def test_a_model_that_is_not_offered_any_more_gives_the_default(self) -> None:
        assert resolve_anthropic_model("claude-haiku-9") == HAIKU_5_5

    def test_every_action_has_a_default_effort(self) -> None:
        assert DEFAULT_AI_EFFORT == {
            "grading": "high",
            "challenge": "high",
            "test_generation": "high",
            "note_generation": "medium",
            "note_edit": "medium",
            "assistant_chat": "medium",
        }

    def test_saved_levels_override_the_defaults(self) -> None:
        resolved = resolve_effort_map({"grading": "low", "note_edit": "max"})

        assert resolved["grading"] == "low"
        assert resolved["note_edit"] == "max"
        assert resolved["challenge"] == "high"

    def test_unknown_actions_and_levels_in_the_row_are_ignored(self) -> None:
        resolved = resolve_effort_map({"grading": "ultra", "removed_action": "low", "challenge": 3})

        assert resolved == DEFAULT_AI_EFFORT

    def test_headroom_has_a_value_for_every_effort_level(self) -> None:
        assert set(THINKING_HEADROOM) == {"low", "medium", "high", "xhigh", "max"}


class TestUserSchemas:
    def _user(self, **fields: Any) -> User:
        return User(
            id="u1",
            username="u",
            email="u@example.com",
            hashed_password="x",
            status=1,
            role=2,
            locale="en",
            theme="system",
            time_format="24h",
            initial_ease_factor=2.5,
            **fields,
        )

    def test_user_read_shows_the_default_model_and_the_full_effort_map(self) -> None:
        read = UserRead.model_validate(self._user())

        assert read.anthropic_model == HAIKU_5_5
        assert read.ai_effort.model_dump() == DEFAULT_AI_EFFORT

    def test_user_read_ignores_a_stored_action_that_no_longer_exists(self) -> None:
        read = UserRead.model_validate(self._user(ai_effort={"answer_correction": "max", "grading": "low"}))

        assert read.ai_effort.grading == "low"
        assert "answer_correction" not in read.ai_effort.model_dump()

    def test_the_effort_schema_has_one_field_per_action(self) -> None:
        assert set(AiEffortSettings.model_fields) == set(DEFAULT_AI_EFFORT)
        assert set(AiEffortUpdate.model_fields) == set(DEFAULT_AI_EFFORT)

    def test_user_read_merges_the_saved_values(self) -> None:
        read = UserRead.model_validate(self._user(anthropic_model=HAIKU_4_5, ai_effort={"grading": "xhigh"}))

        assert read.anthropic_model == HAIKU_4_5
        assert read.ai_effort.grading == "xhigh"
        assert read.ai_effort.challenge == "high"

    def test_user_read_uses_camel_case_keys(self) -> None:
        dumped = UserRead.model_validate(self._user()).model_dump(by_alias=True)

        assert {"anthropicModel", "aiEffort"} <= dumped.keys()

    @pytest.mark.parametrize(
        "payload",
        [
            {"anthropic_model": "claude-opus-4"},
            {"ai_effort": {"grading": "ultra"}},
        ],
    )
    def test_user_update_rejects_unknown_values(self, payload: dict[str, Any]) -> None:
        with pytest.raises(ValidationError):
            UserUpdate.model_validate(payload)

    def test_user_update_accepts_a_partial_map(self) -> None:
        data = UserUpdate.model_validate({"aiEffort": {"grading": "max"}, "anthropicModel": HAIKU_4_5})

        assert data.ai_effort is not None
        assert data.ai_effort.model_dump(exclude_unset=True) == {"grading": "max"}
        assert data.anthropic_model == HAIKU_4_5


class TestUpdateUser:
    def _update(self, user: User, **payload: Any) -> User:
        return user_service.update_user(MagicMock(), current_user=user, data=UserUpdate.model_validate(payload))

    def test_a_partial_effort_update_keeps_the_other_saved_levels(self) -> None:
        user = User(ai_effort={"grading": "low", "challenge": "max"})

        self._update(user, ai_effort={"grading": "xhigh"})

        assert user.ai_effort == {"grading": "xhigh", "challenge": "max"}

    def test_a_null_level_resets_only_that_action(self) -> None:
        user = User(ai_effort={"grading": "low", "challenge": "max"})

        self._update(user, ai_effort={"grading": None})

        assert user.ai_effort == {"challenge": "max"}

    def test_null_effort_resets_every_action(self) -> None:
        user = User(ai_effort={"grading": "low"})

        self._update(user, ai_effort=None)

        assert user.ai_effort == {}

    def test_null_model_resets_to_the_default(self) -> None:
        user = User(anthropic_model=HAIKU_4_5)

        self._update(user, anthropic_model=None)

        assert user.anthropic_model is None


# ---------------------------------------------------------------------------
# The request that goes to the SDK
# ---------------------------------------------------------------------------


class TestRequestKwargs:
    @pytest.mark.parametrize("effort", ["low", "medium", "high", "xhigh", "max"])
    def test_haiku_5_5_sends_the_effort_and_gives_room_for_thinking(self, effort: AiEffort) -> None:
        _, kwargs = _complete_with(_client(HAIKU_5_5), _response(_text("ok")), effort)

        assert kwargs["model"] == HAIKU_5_5
        assert kwargs["output_config"] == {"effort": effort}
        assert kwargs["max_tokens"] == 1000 + THINKING_HEADROOM[effort]

    def test_haiku_4_5_sends_no_effort_and_no_thinking(self) -> None:
        _, kwargs = _complete_with(_client(HAIKU_4_5), _response(_text("ok")), "max")

        assert kwargs["model"] == HAIKU_4_5
        assert kwargs["max_tokens"] == 1000
        assert not {"output_config", "thinking"} & kwargs.keys()

    @pytest.mark.parametrize("model", [HAIKU_4_5, HAIKU_5_5])
    def test_no_sampling_parameter_or_prefill_is_ever_sent(self, model: str) -> None:
        _, kwargs = _complete_with(_client(model), _response(_text("ok")))

        assert not {"temperature", "top_p", "top_k", "thinking"} & kwargs.keys()
        assert [m["role"] for m in kwargs["messages"]] == ["user"]

    def test_the_result_names_the_model_that_ran(self) -> None:
        for model in (HAIKU_4_5, HAIKU_5_5):
            result, _ = _complete_with(_client(model), _response(_text("ok")))
            assert result.model == model

    @pytest.mark.parametrize(("model", "sends_effort"), [(HAIKU_5_5, True), (HAIKU_4_5, False)])
    def test_the_stream_follows_the_same_rule(self, model: str, sends_effort: bool) -> None:
        client = _client(model)
        client._client = MagicMock()
        client._client.messages.stream.return_value = _fake_stream(_response(_text("ok")))

        result = _drain(
            client.stream_with_tools(
                system="s", messages=[{"role": "user", "content": "hi"}], max_tokens=500, effort="low"
            )
        )

        kwargs = client._client.messages.stream.call_args.kwargs
        assert ("output_config" in kwargs) is sends_effort
        assert kwargs.get("output_config") == ({"effort": "low"} if sends_effort else None)
        assert kwargs["max_tokens"] == (500 + THINKING_HEADROOM["low"] if sends_effort else 500)
        assert "thinking" not in kwargs
        assert result.model == model


# ---------------------------------------------------------------------------
# Parsing by block type
# ---------------------------------------------------------------------------


class TestResponseParsing:
    def test_a_response_that_starts_with_a_thinking_block_is_parsed(self) -> None:
        result, _ = _complete_with(_client(), _response(_thinking(), _text("The answer.")))

        assert result.text == "The answer."

    def test_redacted_thinking_is_ignored(self) -> None:
        redacted = RedactedThinkingBlock(type="redacted_thinking", data="encrypted")

        result, _ = _complete_with(_client(), _response(redacted, _thinking(), _text("Done.")))

        assert result.text == "Done."

    def test_text_blocks_are_joined(self) -> None:
        result, _ = _complete_with(_client(), _response(_thinking(), _text("Part one. "), _text("Part two.")))

        assert result.text == "Part one. Part two."

    def test_thinking_only_response_is_an_error_not_an_empty_answer(self) -> None:
        with pytest.raises(ValueError, match="empty text"):
            _complete_with(_client(), _response(_thinking(), stop_reason="max_tokens"))

    def test_max_tokens_sets_the_truncated_flag(self) -> None:
        result, _ = _complete_with(_client(), _response(_thinking(), _text("Cut of"), stop_reason="max_tokens"))

        assert result.truncated is True

    def test_the_stream_returns_the_thinking_blocks_with_their_signature(self) -> None:
        tool = ToolUseBlock(type="tool_use", id="tc1", name="list_notes", input={})
        final = _response(
            _thinking(),
            RedactedThinkingBlock(type="redacted_thinking", data="enc"),
            _text("ok"),
            tool,
            stop_reason="tool_use",
        )
        client = _client()
        client._client = MagicMock()
        client._client.messages.stream.return_value = _fake_stream(final)

        result = _drain(client.stream_with_tools(system="s", messages=[], max_tokens=500, effort="medium"))

        assert result.thinking_blocks == [
            {"type": "thinking", "thinking": "Let me think.", "signature": "sig-123"},
            {"type": "redacted_thinking", "data": "enc"},
        ]


# ---------------------------------------------------------------------------
# Refusal
# ---------------------------------------------------------------------------


class TestRefusal:
    def test_the_client_raises_one_specific_error(self) -> None:
        with pytest.raises(AIRefusalError, match="declined"):
            _complete_with(_client(), _response(stop_reason="refusal"))

    def test_a_refusal_with_partial_text_is_still_a_refusal(self) -> None:
        with pytest.raises(AIRefusalError):
            _complete_with(_client(), _response(_thinking(), _text("I cannot"), stop_reason="refusal"))

    def test_request_routes_get_a_422_with_a_clear_detail(self) -> None:
        llm_that_refuses = MagicMock()
        llm_that_refuses.complete.side_effect = AIRefusalError()
        user = SimpleNamespace(ai_provider=None, anthropic_model=None, ai_effort=None)

        with (
            patch.object(llm, "get_user_llm_client", return_value=llm_that_refuses),
            pytest.raises(HTTPException) as exc,
        ):
            complete_for_user(user=user, action="note_generation", system="s", user_prompt="u", max_tokens=100)  # type: ignore[arg-type]

        assert exc.value.status_code == 422
        assert exc.value.detail == REFUSAL_MESSAGE

    def test_the_assistant_stream_sends_an_error_event_and_one_done(self) -> None:
        refused = StreamResult(stop_reason="refusal", text="", input_tokens=7, output_tokens=3, provider="anthropic")
        events = _run_assistant(_ScriptedLLM(refused))

        names = [name for name, _ in events]
        assert names[-2:] == ["error", "done"]
        assert dict(events)["error"] == {"message": REFUSAL_MESSAGE}

    def test_the_assistant_books_the_tokens_of_the_refused_round(self) -> None:
        refused = StreamResult(stop_reason="refusal", text="", input_tokens=7, output_tokens=3, provider="anthropic")

        events = _run_assistant(_ScriptedLLM(refused))

        assert dict(events)["done"]["usage"] == {"input_tokens": 7, "output_tokens": 3}


def _long_text_question() -> SimpleNamespace:
    content = LongTextContent(length_limit=LongTextLength.SHORT, rubric=[RubricItem(point="Names it", weight=1.0)])
    return SimpleNamespace(
        id="q1", question_type=int(QuestionType.LONG_TEXT), prompt="Q?", content=content.model_dump(), points=1.0
    )


class TestAsyncGradingRefusal:
    def _run(self, llm_client: Any, resolver: Any = None) -> SimpleNamespace:
        answer = SimpleNamespace(
            id="a1",
            question_id="q1",
            status=int(AnswerStatus.PENDING),
            override_score=None,
            override_status=None,
            user_answer="my answer",
            rubric_result=None,
        )
        test_result = SimpleNamespace(id="r1", user_id="u1", answers=[answer], space_item_id=None)
        db = MagicMock()
        db.execute.return_value.scalars.return_value.all.return_value = [_long_text_question()]

        with (
            patch.object(grading_service, "SessionLocal", return_value=db),
            patch.object(grading_service.test_result_crud, "lock_for_grading"),
            patch.object(grading_service.test_result_crud, "lock"),
            patch.object(grading_service.answer_crud, "get_test_result_with_answers", return_value=test_result),
            patch.object(grading_service.user_crud, "get_by_id", return_value=_PLAIN_USER),
            patch.object(grading_service, "resolve_llm", side_effect=resolver or resolve_to(llm_client)),
            patch.object(grading_service, "recalculate_test_result"),
            patch.object(grading_service, "space_progress_service"),
            patch("app.services.token_usage_service.record_usage"),
        ):
            grading_service.grade_pending_answers("r1")
        return answer

    def test_a_refused_answer_is_marked_failed(self) -> None:
        client = MagicMock()
        client.name = "fake"
        client.complete.side_effect = AIRefusalError()

        answer = self._run(client)

        assert answer.status == int(AnswerStatus.FAILED)

    def test_grading_passes_the_effort_of_the_user_for_grading(self) -> None:
        client = MagicMock()
        client.name = "fake"
        client.complete.return_value = CompletionResult(
            text=json.dumps({"results": [{"index": 0, "met": True, "reason": "ok"}]}),
            input_tokens=1,
            output_tokens=1,
            provider="anthropic",
            model=HAIKU_5_5,
        )

        def resolver(db: Any, user: Any, space_id: Any = None) -> ResolvedLLM:
            efforts: dict[AiAction, AiEffort] = {**DEFAULT_AI_EFFORT, "grading": "xhigh"}
            return ResolvedLLM(client, AIProvider.ANTHROPIC, KeySource.STUDENT, None, efforts)

        self._run(client, resolver)

        assert client.complete.call_args.kwargs["effort"] == "xhigh"


class TestChallengeRefusal:
    def _run(self, client: Any) -> MagicMock:
        content = _long_text_question().content
        answer = SimpleNamespace(
            id="a1",
            question_id="q1",
            test_result_id="r1",
            user_answer="my answer",
            rubric_result=[
                {
                    "point": "Names it",
                    "met": False,
                    "reason": "no",
                    "weight": 1.0,
                    "challenge_result": {"argument": "I did", "met": None, "reason": ""},
                }
            ],
        )
        question = SimpleNamespace(prompt="Q?", content=content)
        test_result = SimpleNamespace(id="r1", user_id="u1", space_item_id=None)
        with (
            patch.object(challenge_service, "SessionLocal", return_value=MagicMock()),
            patch.object(challenge_service.answer_crud, "get_by_id", return_value=answer),
            patch.object(challenge_service.question_crud, "get_by_id", return_value=question),
            patch.object(challenge_service.answer_crud, "get_test_result_with_answers", return_value=test_result),
            patch.object(challenge_service.user_crud, "get_by_id", return_value=_PLAIN_USER),
            patch.object(challenge_service, "resolve_llm", side_effect=resolve_to(client)),
            patch("app.services.token_usage_service.record_usage"),
            patch.object(challenge_service, "_mark_challenge_as_failed") as mark_failed,
        ):
            challenge_service.process_challenge("a1")
        return mark_failed

    def test_a_refused_challenge_is_marked_failed(self) -> None:
        client = MagicMock()
        client.complete.side_effect = AIRefusalError()

        self._run(client).assert_called_once()

    def test_challenge_uses_the_challenge_effort(self) -> None:
        client = MagicMock()
        client.complete.return_value = CompletionResult(
            text=json.dumps({"results": [{"index": 0, "met": False, "reason": "still no"}]}),
            input_tokens=1,
            output_tokens=1,
            provider="anthropic",
            model=HAIKU_5_5,
        )

        self._run(client).assert_not_called()

        assert client.complete.call_args.kwargs["effort"] == DEFAULT_AI_EFFORT["challenge"]


# ---------------------------------------------------------------------------
# Which model and which effort a call gets
# ---------------------------------------------------------------------------


class TestModelAndEffortResolution:
    def _user(self, **fields: Any) -> SimpleNamespace:
        base = {
            "id": "u1",
            "ai_provider": None,
            "encrypted_anthropic_key": "enc",
            "encrypted_openai_key": None,
            "anthropic_model": None,
            "ai_effort": None,
        }
        return SimpleNamespace(**{**base, **fields})

    def _resolve(self, user: SimpleNamespace, plan: KeyPlan) -> ResolvedLLM:
        with (
            patch.object(llm_key_service, "plan_key", return_value=plan),
            patch.object(llm_key_service, "decrypt_key", return_value="sk-ant-test"),
            patch.object(llm, "decrypt_key", return_value="sk-ant-test"),
        ):
            return llm_key_service.resolve_llm(MagicMock(), user, None)  # type: ignore[arg-type]

    def test_a_user_with_no_saved_model_gets_haiku_5_5(self) -> None:
        resolved = self._resolve(self._user(), KeyPlan(KeySource.STUDENT))

        assert isinstance(resolved.client, AnthropicLLMClient)
        assert resolved.client.model == HAIKU_5_5

    def test_the_saved_model_is_the_model_of_the_next_call(self) -> None:
        resolved = self._resolve(self._user(anthropic_model=HAIKU_4_5), KeyPlan(KeySource.STUDENT))

        assert isinstance(resolved.client, AnthropicLLMClient)
        assert resolved.client.model == HAIKU_4_5

    def test_a_student_call_uses_the_saved_efforts(self) -> None:
        resolved = self._resolve(self._user(ai_effort={"grading": "low"}), KeyPlan(KeySource.STUDENT))

        assert resolved.effort("grading") == "low"
        assert resolved.effort("challenge") == "high"

    def test_a_class_key_call_ignores_the_model_and_the_efforts_of_the_student(self) -> None:
        settings = SimpleNamespace(encrypted_class_key="enc", ai_provider=int(AIProvider.ANTHROPIC))
        plan = KeyPlan(KeySource.CLASS, settings=settings, classroom_id="c1")  # type: ignore[arg-type]
        student = self._user(anthropic_model=HAIKU_4_5, ai_effort={"grading": "low", "assistant_chat": "max"})

        resolved = self._resolve(student, plan)

        assert resolved.key_source == KeySource.CLASS
        assert isinstance(resolved.client, AnthropicLLMClient)
        assert resolved.client.model == DEFAULT_ANTHROPIC_MODEL
        assert resolved.efforts == DEFAULT_AI_EFFORT

    def test_a_personal_call_without_a_classroom_uses_the_user_effort(self) -> None:
        user = self._user(ai_effort={"note_generation": "max"})
        client = MagicMock()
        client.complete.return_value = CompletionResult(
            text="ok", input_tokens=1, output_tokens=1, provider="anthropic", model=HAIKU_5_5
        )

        with patch.object(llm, "get_user_llm_client", return_value=client):
            complete_for_user(user=user, action="note_generation", system="s", user_prompt="u", max_tokens=10)  # type: ignore[arg-type]

        assert client.complete.call_args.kwargs["effort"] == "max"

    @pytest.mark.parametrize(
        ("module", "function", "kwargs", "action"),
        [
            ("note_service", "generate_note", {}, "note_generation"),
        ],
    )
    def test_note_generation_names_its_action(
        self, module: str, function: str, kwargs: dict[str, Any], action: str
    ) -> None:
        from app.schemas.note import NoteGenerate
        from app.services import note_service

        completion = CompletionResult(text="## T", input_tokens=1, output_tokens=1, provider="anthropic", model="m")
        with (
            patch.object(note_service, "complete_for_user", return_value=completion) as call,
            patch.object(note_service, "token_usage_service"),
            patch.object(note_service, "note_crud"),
            patch.object(note_service, "_validate_folder_ownership"),
            patch.object(note_service, "folder_crud"),
        ):
            note_service.generate_note(MagicMock(), current_user=MagicMock(), data=NoteGenerate(topic="Cells"))

        assert call.call_args.kwargs["action"] == action

    def test_note_edits_name_the_note_edit_action(self) -> None:
        from app.schemas.note import NoteChunkEdit
        from app.services import note_service

        completion = CompletionResult(text="x", input_tokens=1, output_tokens=1, provider="anthropic", model="m")
        note = MagicMock(content="Some content")
        with (
            patch.object(note_service, "complete_for_user", return_value=completion) as call,
            patch.object(note_service, "token_usage_service"),
            patch.object(note_service, "get_live_note", return_value=note),
        ):
            note_service.preview_refine_note(MagicMock(), note_id="n", current_user=MagicMock(), instructions="shorter")
            note_service.edit_note_chunk(
                MagicMock(),
                note_id="n",
                current_user=MagicMock(),
                data=NoteChunkEdit(full_text="abc def", selected_text="abc", instructions="x"),
            )

        assert [c.kwargs["action"] for c in call.call_args_list] == ["note_edit", "note_edit"]

    def test_test_generation_names_its_action(self) -> None:
        from app.services import test_generation_service

        completion = CompletionResult(text="not json", input_tokens=1, output_tokens=1, provider="anthropic", model="m")
        with (
            patch.object(test_generation_service, "complete_for_user", return_value=completion) as call,
            patch.object(test_generation_service, "token_usage_service"),
            pytest.raises(HTTPException),
        ):
            test_generation_service._call_and_validate(
                MagicMock(), user=MagicMock(), user_prompt="p", requested_types={QuestionType.SIMPLE}
            )

        assert {c.kwargs["action"] for c in call.call_args_list} == {"test_generation"}

    def test_every_action_of_the_literal_has_a_default(self) -> None:
        from typing import get_args

        assert set(get_args(AiAction)) == set(DEFAULT_AI_EFFORT)


# ---------------------------------------------------------------------------
# Assistant tool loop
# ---------------------------------------------------------------------------


class _ScriptedLLM:
    """One scripted `StreamResult` per round. It keeps the request of each round."""

    def __init__(self, *rounds: StreamResult) -> None:
        self._rounds = iter(rounds)
        self.calls: list[dict[str, Any]] = []

    def stream_with_tools(self, **kwargs: Any) -> Generator[TextDelta, None, StreamResult]:
        self.calls.append({**kwargs, "messages": json.loads(json.dumps(kwargs["messages"]))})
        result = next(self._rounds)
        yield TextDelta("ok")
        return result


def _resolve_with_user_efforts(llm_client: Any) -> Callable[..., ResolvedLLM]:
    def _resolve(db: Any, user: User, space_id: str | None = None) -> ResolvedLLM:
        return ResolvedLLM(llm_client, AIProvider.ANTHROPIC, KeySource.STUDENT, space_id, efforts_of(user))

    return _resolve


def _run_assistant(
    llm_client: Any,
    user: User | None = None,
    request: AssistRequest | None = None,
    *,
    needs_confirmation: bool | Callable[[Any, str], bool] = False,
) -> list[tuple[str, dict[str, Any]]]:
    request = request or AssistRequest(messages=[AssistMessage(role="user", content="hi")])
    with (
        patch(f"{ASSIST}.resolve_llm", side_effect=_resolve_with_user_efforts(llm_client)),
        patch(f"{ASSIST}.execute_tool") as execute,
        patch(f"{ASSIST}.token_usage_service"),
        patch(
            f"{ASSIST}.needs_confirmation",
            **(
                {"side_effect": needs_confirmation}
                if callable(needs_confirmation)
                else {"return_value": needs_confirmation}
            ),
        ),
        patch(f"{ASSIST}.build_confirm_context", return_value=None),
    ):
        execute.return_value = MagicMock(output="found 2 notes", metadata=None)
        chunks = list(
            stream_assist(
                MagicMock(),
                current_user=user or User(id="u1", username="u", email="e", hashed_password="x"),
                request=request,
            )
        )
    return [
        (chunk.split("\n")[0].removeprefix("event: "), json.loads(chunk.split("\n")[1].removeprefix("data: ")))
        for chunk in chunks
    ]


class TestAssistantToolLoop:
    THINKING: list[dict[str, object]] = [
        {"type": "thinking", "thinking": "I need the notes first.", "signature": "sig-abc"},
        {"type": "redacted_thinking", "data": "enc-data"},
    ]

    def _two_rounds(self) -> _ScriptedLLM:
        call = ToolCallDelta(id="tc1", name="list_notes", arguments={})
        first = StreamResult(
            stop_reason="tool_use", text="Let me look.", tool_calls=[call], thinking_blocks=list(self.THINKING)
        )
        return _ScriptedLLM(first, StreamResult(stop_reason="end_turn", text="Done."))

    def test_the_thinking_blocks_go_back_first_and_unchanged_with_the_tool_results(self) -> None:
        scripted = self._two_rounds()

        _run_assistant(scripted)

        second_round = scripted.calls[1]["messages"]
        assistant_turn, tool_results_turn = second_round[-2], second_round[-1]
        assert assistant_turn["role"] == "assistant"
        assert assistant_turn["content"][:2] == self.THINKING
        assert [block["type"] for block in assistant_turn["content"][2:]] == ["text", "tool_use"]
        assert tool_results_turn["content"][0]["type"] == "tool_result"
        assert tool_results_turn["content"][0]["tool_use_id"] == "tc1"

    def test_the_effort_of_the_assistant_chat_is_sent_in_every_round(self) -> None:
        scripted = self._two_rounds()
        user = User(id="u1", username="u", email="e", hashed_password="x", ai_effort={"assistant_chat": "xhigh"})

        _run_assistant(scripted, user)

        assert [call["effort"] for call in scripted.calls] == ["xhigh", "xhigh"]

    def test_a_round_without_thinking_keeps_the_old_message_shape(self) -> None:
        call = ToolCallDelta(id="tc1", name="list_notes", arguments={})
        scripted = _ScriptedLLM(
            StreamResult(stop_reason="tool_use", text="", tool_calls=[call]),
            StreamResult(stop_reason="end_turn", text="Done."),
        )

        _run_assistant(scripted)

        assert [b["type"] for b in scripted.calls[1]["messages"][-2]["content"]] == ["tool_use"]


class TestPausedTurnThinking:
    """A write tool pauses the stream. The next request replays the paused turn from the client history."""

    THINKING: list[dict[str, object]] = [{"type": "thinking", "thinking": "Plan.", "signature": "sig-1"}]
    WRITE_CALL = ToolCallDelta(id="w1", name="create_folder", arguments={"name": "x"})

    def _resume_request(self) -> AssistRequest:
        return AssistRequest.model_validate(
            {
                "messages": [
                    {"role": "user", "content": "make a folder"},
                    {
                        "role": "assistant",
                        "content": "Sure.",
                        "toolCalls": [{"id": "w1", "name": "create_folder", "arguments": {"name": "x"}}],
                        "thinkingBlocks": self.THINKING,
                    },
                ],
                "toolConfirmations": [{"toolCallId": "w1", "approved": True}],
            }
        )

    def test_the_round_end_event_carries_the_thinking_blocks_of_the_paused_turn(self) -> None:
        first = StreamResult(
            stop_reason="tool_use", text="Sure.", tool_calls=[self.WRITE_CALL], thinking_blocks=list(self.THINKING)
        )

        events = _run_assistant(_ScriptedLLM(first), needs_confirmation=True)

        names = [name for name, _ in events]
        assert names[-3:] == ["confirm_required", "round_end", "done"]
        assert dict(events)["round_end"] == {"thinking_blocks": self.THINKING}
        done = dict(events)["done"]
        assert done["pending_confirmations"] == ["w1"]
        assert "thinking_blocks" not in done

    def test_the_round_end_event_has_no_blocks_when_the_model_sent_none(self) -> None:
        first = StreamResult(stop_reason="tool_use", text="Sure.", tool_calls=[self.WRITE_CALL])

        events = _run_assistant(_ScriptedLLM(first), needs_confirmation=True)

        assert dict(events)["round_end"] == {"thinking_blocks": []}

    def test_haiku_5_5_gets_the_blocks_first_in_the_replayed_assistant_turn(self) -> None:
        scripted = _ScriptedLLM(StreamResult(stop_reason="end_turn", text="Done."))

        with patch.object(AnthropicLLMClient, "stream_with_tools", scripted.stream_with_tools):
            _run_assistant(_client(HAIKU_5_5), request=self._resume_request())

        assistant_turn = scripted.calls[0]["messages"][1]
        assert assistant_turn["content"][0] == self.THINKING[0]
        assert [b["type"] for b in assistant_turn["content"]] == ["thinking", "text", "tool_use"]

    def test_haiku_4_5_drops_the_blocks(self) -> None:
        scripted = _ScriptedLLM(StreamResult(stop_reason="end_turn", text="Done."))

        with patch.object(AnthropicLLMClient, "stream_with_tools", scripted.stream_with_tools):
            _run_assistant(_client(HAIKU_4_5), request=self._resume_request())

        assistant_turn = scripted.calls[0]["messages"][1]
        assert [b["type"] for b in assistant_turn["content"]] == ["text", "tool_use"]

    def test_a_redacted_block_goes_back_with_only_its_data(self) -> None:
        message = AssistMessage.model_validate(
            {"role": "assistant", "content": "", "thinkingBlocks": [{"type": "redacted_thinking", "data": "enc"}]}
        )

        out = _to_anthropic_messages([message], keep_thinking=True)

        assert out[0]["content"] == [{"type": "redacted_thinking", "data": "enc"}]


class TestPerRoundHistory:
    """One stream can run several rounds. The history keeps one assistant message per round, as the model saw it."""

    T1: list[dict[str, object]] = [{"type": "thinking", "thinking": "One.", "signature": "sig-1"}]
    T2: list[dict[str, object]] = [{"type": "thinking", "thinking": "Two.", "signature": "sig-2"}]

    def _history_request(self) -> AssistRequest:
        return AssistRequest.model_validate(
            {
                "messages": [
                    {"role": "user", "content": "go"},
                    {
                        "role": "assistant",
                        "content": "Looking.",
                        "toolCalls": [{"id": "A", "name": "list_notes", "arguments": {}}],
                        "thinkingBlocks": self.T1,
                    },
                    {"role": "tool", "content": "", "toolResults": [{"toolCallId": "A", "output": "notes"}]},
                    {
                        "role": "assistant",
                        "content": "Creating.",
                        "toolCalls": [{"id": "B", "name": "create_folder", "arguments": {}}],
                        "thinkingBlocks": self.T2,
                    },
                ],
                "toolConfirmations": [{"toolCallId": "B", "approved": True}],
            }
        )

    def test_a_two_round_stream_sends_one_round_end_per_round_with_its_own_blocks(self) -> None:
        read = ToolCallDelta(id="A", name="list_notes", arguments={})
        write = ToolCallDelta(id="B", name="create_folder", arguments={})
        scripted = _ScriptedLLM(
            StreamResult(stop_reason="tool_use", text="Looking.", tool_calls=[read], thinking_blocks=list(self.T1)),
            StreamResult(stop_reason="tool_use", text="Creating.", tool_calls=[write], thinking_blocks=list(self.T2)),
        )

        events = _run_assistant(scripted, needs_confirmation=lambda _user, name: name == "create_folder")

        names = [name for name, _ in events]
        assert names == [
            "text_delta",
            "tool_call",
            "tool_result",
            "round_end",
            "text_delta",
            "tool_call",
            "confirm_required",
            "round_end",
            "done",
        ]
        assert [data for name, data in events if name == "round_end"] == [
            {"thinking_blocks": self.T1},
            {"thinking_blocks": self.T2},
        ]

    def test_haiku_5_5_replays_one_assistant_message_per_round_with_its_blocks(self) -> None:
        scripted = _ScriptedLLM(StreamResult(stop_reason="end_turn", text="Done."))

        with patch.object(AnthropicLLMClient, "stream_with_tools", scripted.stream_with_tools):
            _run_assistant(_client(HAIKU_5_5), request=self._history_request())

        messages = scripted.calls[0]["messages"]
        assert [
            (m["role"], [b["type"] for b in m["content"]] if isinstance(m["content"], list) else None)
            for m in messages[1:]
        ] == [
            ("assistant", ["thinking", "text", "tool_use"]),
            ("user", ["tool_result"]),
            ("assistant", ["thinking", "text", "tool_use"]),
            ("user", ["tool_result"]),
        ]
        assert messages[1]["content"][0] == self.T1[0]
        assert messages[3]["content"][0] == self.T2[0]

    def test_haiku_4_5_replays_the_same_rounds_without_blocks(self) -> None:
        scripted = _ScriptedLLM(StreamResult(stop_reason="end_turn", text="Done."))

        with patch.object(AnthropicLLMClient, "stream_with_tools", scripted.stream_with_tools):
            _run_assistant(_client(HAIKU_4_5), request=self._history_request())

        messages = scripted.calls[0]["messages"]
        assert [m["role"] for m in messages] == ["user", "assistant", "user", "assistant", "user"]
        assert all(
            b["type"] != "thinking" for m in messages[1:] for b in m["content"] if isinstance(m["content"], list)
        )


# ---------------------------------------------------------------------------
# Pricing
# ---------------------------------------------------------------------------


class TestPricing:
    def test_both_models_have_an_openrouter_id(self) -> None:
        assert SDK_TO_OPENROUTER[HAIKU_4_5] == "anthropic/claude-haiku-4.5"
        assert SDK_TO_OPENROUTER[HAIKU_5_5] == "anthropic/claude-haiku-5.5"

    def _fetch(self, listing: list[dict[str, Any]]) -> list[dict[str, Any]]:
        response = MagicMock()
        response.json.return_value = {"data": listing}
        with (
            patch.object(pricing_service.httpx, "get", return_value=response),
            patch.object(pricing_service.pricing_crud, "upsert_prices", return_value=1) as upsert,
        ):
            pricing_service.fetch_and_update_prices(MagicMock())
        return upsert.call_args.kwargs["prices"]

    @staticmethod
    def _entry(model_id: str, prompt: str, completion: str) -> dict[str, Any]:
        return {"id": model_id, "pricing": {"prompt": prompt, "completion": completion}}

    def test_a_1m_variant_is_stored_under_the_plain_id(self) -> None:
        prices = self._fetch([self._entry("anthropic/claude-haiku-5.5[1m]", "0.0000001", "0.0000005")])

        assert [p["model_id"] for p in prices] == ["anthropic/claude-haiku-5.5"]
        assert str(prices[0]["input_price"]) == "1E-7"

    def test_the_plain_id_wins_over_the_variant_in_any_order(self) -> None:
        plain = self._entry("anthropic/claude-haiku-5.5", "0.0000001", "0.0000005")
        variant = self._entry("anthropic/claude-haiku-5.5[1m]", "0.0000005", "0.0000025")

        for listing in ([plain, variant], [variant, plain]):
            prices = self._fetch(listing)
            assert len(prices) == 1
            assert str(prices[0]["output_price"]) == "5E-7"

    def test_models_that_are_not_ours_are_skipped(self) -> None:
        prices = self._fetch(
            [self._entry("anthropic/claude-haiku-4.5", "0.000001", "0.000005"), self._entry("other/model", "1", "1")]
        )

        assert [p["model_id"] for p in prices] == ["anthropic/claude-haiku-4.5"]
