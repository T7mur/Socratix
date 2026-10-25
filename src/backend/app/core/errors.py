"""Domain-safe failures shared by repositories and HTTP adapters."""


class ConflictError(Exception):
    """A stale version, duplicate write or invalid workflow transition."""


class NotFoundError(Exception):
    """An authorised resource does not exist."""


class ForbiddenError(Exception):
    """The caller lacks permission."""


class ValidationError(Exception):
    """A deterministic business invariant was violated."""
