"""A fake target callable for exercising the eval runner without any real
LLM call, API key, or network access."""


def fake_answer(question: str, courses: list[dict]) -> str:
    code = courses[0]["course_code"]
    return f"Based on the listings, {code} is a good fit for '{question}'. [{code}]"
