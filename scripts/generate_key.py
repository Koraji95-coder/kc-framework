#!/usr/bin/env python3
"""
generate_key.py — Generate a new Chamber 19 activation PIN.

Prints the JSON entry ready to paste into the Drive auth file under "keys".

Usage:
    python scripts/generate_key.py --name "Alice Johnson" --expires "2026-12-31"

The PIN format is R3P-XXXX-XXXX where X is an uppercase alphanumeric character.
Prefix R3P identifies the key format version and makes PINs visually distinct.
"""

import argparse
import json
import random
import re
import string
from datetime import date


ALPHABET = string.ascii_uppercase + string.digits
PIN_PREFIX = "R3P"
SEGMENT_LEN = 4
NUM_SEGMENTS = 2


def generate_pin() -> str:
    segments = [
        "".join(random.choices(ALPHABET, k=SEGMENT_LEN))
        for _ in range(NUM_SEGMENTS)
    ]
    return f"{PIN_PREFIX}-{'-'.join(segments)}"


def validate_expires(value: str) -> str:
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise argparse.ArgumentTypeError(
            f"--expires must be YYYY-MM-DD, got: {value!r}"
        )
    try:
        year, month, day = (int(p) for p in value.split("-"))
        date(year, month, day)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(str(exc)) from exc
    return value


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate a Chamber 19 activation PIN entry.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--name",
        required=True,
        help='Full name of the engineer, e.g. "Alice Johnson"',
    )
    parser.add_argument(
        "--expires",
        required=True,
        type=validate_expires,
        help="Expiry date in YYYY-MM-DD format",
    )
    args = parser.parse_args()

    pin = generate_pin()
    today = date.today().isoformat()

    entry = {
        "name": args.name,
        "active": True,
        "issued": today,
        "expires": args.expires,
    }

    print(f"\nNew PIN: {pin}\n")
    print("Paste this into your Drive auth file under the top-level \"keys\" object:\n")
    print(json.dumps({pin: entry}, indent=2))
    print()
    print("Then share the PIN with the engineer via a secure channel.")


if __name__ == "__main__":
    main()
