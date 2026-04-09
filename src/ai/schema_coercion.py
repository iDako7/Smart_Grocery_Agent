"""Schema coercion pipeline: json.loads() → Pydantic model_validate() → error dict."""

import json

from pydantic import BaseModel, ValidationError


def coerce_tool_args(raw_json: str, model_class: type[BaseModel]) -> BaseModel | dict:
    """Parse JSON string and coerce into a Pydantic model.

    Returns the validated model on success, or an error dict on failure.
    The error dict can be returned to the LLM as a tool result.
    """
    try:
        data = json.loads(raw_json)
    except json.JSONDecodeError as e:
        return {"error": f"Malformed JSON: {e}"}

    try:
        return model_class.model_validate(data)
    except ValidationError as e:
        errors = []
        for err in e.errors():
            loc = ".".join(str(x) for x in err["loc"])
            errors.append(f"{loc}: {err['msg']}")
        return {"error": f"Validation failed: {'; '.join(errors)}"}
