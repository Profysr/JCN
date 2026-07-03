import os
import time
import uuid as _uuid_mod

from django.db import models


def generate_uuid7():
    """
    Generate a UUIDv7 (RFC 9562): 48-bit millisecond timestamp in the most-significant
    bits, version nibble 7, then 74 bits of randomness.

    Time-ordering means new rows always append to the end of the B-tree index rather
    than splitting random pages — critical for write throughput at scale.
    """
    ms = int(time.time() * 1000)
    rand = int.from_bytes(os.urandom(10), "big")  # 80 random bits

    i = (ms & 0xFFFFFFFFFFFF) << 80  # bits 0-47:  48-bit ms timestamp
    i |= 0x7 << 76  # bits 48-51: version = 7
    i |= ((rand >> 62) & 0xFFF) << 64  # bits 52-63: rand_a (12 bits)
    i |= 0x8000000000000000  # bits 64-65: variant = 10
    i |= rand & 0x3FFFFFFFFFFFFFFF  # bits 66-127: rand_b (62 bits)

    return _uuid_mod.UUID(int=i)


class UUIDv7Field(models.UUIDField):
    """
    Drop-in replacement for UUIDField(primary_key=True, default=uuid.uuid4).
    Generates time-sortable UUIDv7 values so ORDER BY id == ORDER BY created_at
    with zero extra cost.

    DB stores a native 16-byte UUID, which is what the API exposes everywhere —
    no prefixing is applied at any layer.
    """

    def __init__(self, *args, **kwargs):
        kwargs.setdefault("primary_key", True)
        kwargs.setdefault("default", generate_uuid7)
        kwargs.setdefault("editable", False)
        super().__init__(*args, **kwargs)
