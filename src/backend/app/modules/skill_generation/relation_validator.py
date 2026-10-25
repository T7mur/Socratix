"""Deterministic graph checks shared by review and candidate diagnostics."""

from app.core.errors import ValidationError


def validate_endpoints_exist(from_id: str, to_id: str, approved_ids: set[str]) -> None:
    if from_id == to_id:
        raise ValidationError("A relationship cannot reference itself")
    if {from_id, to_id} - approved_ids:
        raise ValidationError("Both relationship endpoints must be approved skills")


def validate_acyclic(edges: list[tuple[str, str]]) -> None:
    """Kahn traversal avoids recursion limits for large approved catalogues."""
    graph: dict[str, set[str]] = {}
    degrees: dict[str, int] = {}
    for source, target in edges:
        graph.setdefault(source, set())
        graph.setdefault(target, set())
        degrees.setdefault(source, 0)
        degrees.setdefault(target, 0)
        if target not in graph[source]:
            graph[source].add(target)
            degrees[target] += 1
    ready = [node for node in graph if degrees[node] == 0]
    visited = 0
    while ready:
        node = ready.pop()
        visited += 1
        for target in graph[node]:
            degrees[target] -= 1
            if degrees[target] == 0:
                ready.append(target)
    if visited != len(graph):
        raise ValidationError("Directed cycle detected")
