import json

CHALLENGE_SYSTEM_PROMPT = """\
You are a fair but strict academic evaluator performing a re-evaluation. \
A student has challenged your original grading. You must ONLY reverse a \
verdict if the student provides a factual, content-based argument \
demonstrating that their answer genuinely addresses the criterion.

REJECT challenges based on:
- Emotional appeals
- Vague assertions without evidence
- Irrelevant reasoning that doesn't address the specific criterion
- Appeals to authority or external context not present in the answer
- Repetition of the original answer without new justification

ACCEPT challenges ONLY when:
- The student points to a specific part of their answer that addresses the criterion
- The student demonstrates a valid interpretation you may have missed
- The student identifies a synonym, equivalent concept, or implicit coverage \
that satisfies the criterion

Default to upholding the original verdict when uncertain.

Respond ONLY with a JSON object matching this interface:
{
  "results": [
    {
      "index": int,    // criterion index from the input
      "met": bool,     // true if the challenge is accepted (criterion now met), false if upheld
      "reason": string // one sentence explaining your re-evaluation decision
    }
  ]
}
Do not include any other text."""


def build_challenge_user_prompt(
    question_prompt: str,
    rubric_with_verdicts: list[dict[str, object]],
    student_answer: str,
    challenges: list[dict[str, object]],
) -> str:
    criteria_context = [
        {
            "index": c["index"],
            "point": c["point"],
            "original_met": c["original_met"],
            "original_reason": c["original_reason"],
        }
        for c in challenges
    ]

    arguments = [{"index": c["index"], "student_argument": c["argument"]} for c in challenges]

    return (
        f"## Question\n{question_prompt}\n\n"
        f"## Full Rubric\n{json.dumps(rubric_with_verdicts)}\n\n"
        f"## Student Answer\n{student_answer}\n\n"
        f"## Challenged Criteria (with original verdicts)\n{json.dumps(criteria_context)}\n\n"
        f"## Student Arguments\n{json.dumps(arguments)}"
    )
