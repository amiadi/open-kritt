"""Safe, non-operational assessment capability catalog.

These declarations describe bounded review workflows only. They contain no target
clients, payloads, discovery logic, network access, or device operations.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SafeCapabilityAdapter:
    """Reviewed capability metadata for future isolated-lab adapter work."""

    adapter_id: str
    capability: str
    action_types: tuple[str, ...]
    evidence_kinds: tuple[str, ...]
    target_operations_enabled: bool = False


SAFE_CAPABILITY_ADAPTERS = (
    SafeCapabilityAdapter(
        adapter_id="infrastructure-inventory-review",
        capability="infrastructure",
        action_types=("asset_inventory", "service_exposure_review"),
        evidence_kinds=("declared_target_inventory", "operator_supplied_service_manifest"),
    ),
    SafeCapabilityAdapter(
        adapter_id="web-surface-review",
        capability="web_application",
        action_types=("application_surface_inventory", "safe_input_validation_review"),
        evidence_kinds=("declared_route_inventory", "operator_supplied_http_transcript"),
    ),
    SafeCapabilityAdapter(
        adapter_id="embedded-read-only-inventory",
        capability="embedded",
        action_types=("firmware_and_interface_inventory", "read_only_interface_discovery"),
        evidence_kinds=("supplied_firmware_manifest", "operator_supplied_interface_manifest"),
    ),
)


def safe_adapter_for(capability: str) -> SafeCapabilityAdapter | None:
    """Return the static safe adapter declaration for a supported capability."""

    return next((adapter for adapter in SAFE_CAPABILITY_ADAPTERS if adapter.capability == capability), None)
