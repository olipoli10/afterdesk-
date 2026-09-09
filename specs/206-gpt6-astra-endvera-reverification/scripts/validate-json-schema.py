import json
import pathlib
import sys
from importlib.metadata import version

from jsonschema import Draft202012Validator, FormatChecker


def main() -> int:
    if len(sys.argv) != 3:
        print("JSON_SCHEMA_ARGUMENTS_REQUIRED", file=sys.stderr)
        return 2

    if version("jsonschema") != "4.26.0":
        print("JSON_SCHEMA_VERSION_REQUIRED:4.26.0", file=sys.stderr)
        return 3

    schema_path = pathlib.Path(sys.argv[1])
    instance_path = pathlib.Path(sys.argv[2])

    with schema_path.open("r", encoding="utf-8") as handle:
        schema = json.load(handle)
    with instance_path.open("r", encoding="utf-8") as handle:
        instance = json.load(handle)

    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    errors = sorted(validator.iter_errors(instance), key=lambda error: list(error.absolute_path))
    if errors:
        for error in errors[:20]:
            path = "/".join(str(part) for part in error.absolute_path) or "$"
            print(f"JSON_SCHEMA_INVALID:{path}:{error.message}", file=sys.stderr)
        return 1

    print("JSON_SCHEMA_VALID")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
