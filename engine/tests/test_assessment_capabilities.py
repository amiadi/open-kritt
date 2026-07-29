from open_kritt_engine.assessment_capabilities import SAFE_CAPABILITY_ADAPTERS, safe_adapter_for


def test_every_supported_capability_has_a_non_operational_adapter_declaration():
    assert {adapter.capability for adapter in SAFE_CAPABILITY_ADAPTERS} == {
        "infrastructure",
        "web_application",
        "embedded",
    }
    assert all(not adapter.target_operations_enabled for adapter in SAFE_CAPABILITY_ADAPTERS)
    assert all(adapter.action_types and adapter.evidence_kinds for adapter in SAFE_CAPABILITY_ADAPTERS)


def test_capability_lookup_does_not_fall_back_for_unknown_capabilities():
    assert safe_adapter_for("web_application").adapter_id == "web-surface-review"
    assert safe_adapter_for("unknown") is None
