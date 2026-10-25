"""Public skill-generation persistence boundary; implementation stays in shared DB adapters."""

from app.db.repositories.catalogue import CatalogueRepository

__all__ = ["CatalogueRepository"]
