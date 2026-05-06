#!/usr/bin/env python3
"""
generate_key.py — Generate a new Chamber 19 activation PIN.

Prints the plaintext PIN (to share with the engineer) and the JSON entry
ready to paste into the Drive auth file under "keys".  Drive file keys are
HMAC-SHA256(pin, PIN_HASH_SECRET) so the plaintext PIN is never stored in
the Drive file.

Usage:
    python scripts/generate_key.py --name "Alice Johnson" --expires "2026-12-31"

The PIN_HASH_SECRET is read from the ACTIVATION_PIN_HASH_SECRET environment
variable.  Pass --pin-hash-secret to override (useful in CI).

The PIN format is R3P-XXXX-XXXX where X is an uppercase alphanumeric character.
Prefix R3P identifies the key format version and makes PINs visually distinct.
"""

import argparse
import hashlib
import hmac as hmac_lib
import json
import os
import re
import secrets
import string
from datetime import date


ALPHABET = string.ascii_uppercase + string.digits
PIN_PREFIX = "R3P"
SEGMENT_LEN = 4
NUM_SEGMENTS = 2


def generate_pin() -> str:
    segments = [
        "".join(secrets.choice(ALPHABET) for _ in range(SEGMENT_LEN))
        for _ in range(NUM_SEGMENTS)
    ]
    return f"{PIN_PREFIX}-{'-'.join(segments)}"


def hash_pin(pin: str, secret: str) -> str:
    return hmac_lib.new(
        secret.encode(),
        pin.encode(),
        hashlib.sha256,
    ).hexdigest()


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
    parser.add_argument(
        "--pin-hash-secret",
        default=os.environ.get("ACTIVATION_PIN_HASH_SECRET", ""),
        help="HMAC secret used to hash PINs (default: $ACTIVATION_PIN_HASH_SECRET)",
    )
    args = parser.parse_args()

    if not args.pin_hash_secret:
        parser.error(
            "ACTIVATION_PIN_HASH_SECRET is not set.\n"
            "Export it before running, or pass --pin-hash-secret."
        )

    pin = generate_pin()
    pin_key = hash_pin(pin, args.pin_hash_secret)
    today = date.today().isoformat()

    entry = {
        "name": args.name,
        "active": True,
        "issued": today,
        "expires": args.expires,
    }

    print(f"\nPlaintext PIN (share via secure channel): {pin}\n")
    print("Paste this into your Drive auth file under the top-level \"keys\" object:\n")
    print(json.dumps({pin_key: entry}, indent=2))
    print()
    print("The key above is HMAC-SHA256(pin, PIN_HASH_SECRET).")
    print("The plaintext PIN is never written to the Drive file.")


if __name__ == "__main__":
    main()
