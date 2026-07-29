from open_kritt_engine.local_model import local_model_configuration


def test_local_model_requires_a_complete_internal_configuration():
    assert local_model_configuration({}) is None
    assert (
        local_model_configuration(
            {
                "OPEN_KRITT_LOCAL_MODEL_PROVIDER": "ollama",
                "OPEN_KRITT_LOCAL_MODEL_ENDPOINT": "http://ollama:11434",
                "OPEN_KRITT_LOCAL_MODEL_ID": "qwen3",
            }
        ).model
        == "qwen3"
    )
    assert (
        local_model_configuration(
            {
                "OPEN_KRITT_LOCAL_MODEL_PROVIDER": "ollama",
                "OPEN_KRITT_LOCAL_MODEL_ENDPOINT": "http://localhost:11434",
                "OPEN_KRITT_LOCAL_MODEL_ID": "qwen3",
            }
        )
        is None
    )


def test_airgap_local_model_configuration_rejects_cloud_credential_fallbacks():
    assert (
        local_model_configuration(
            {
                "OPEN_KRITT_DEPLOYMENT_MODE": "airgap",
                "OPEN_KRITT_LOCAL_MODEL_PROVIDER": "openai_compatible",
                "OPEN_KRITT_LOCAL_MODEL_ENDPOINT": "http://internal-llm:8080/v1",
                "OPEN_KRITT_LOCAL_MODEL_ID": "local-model",
                "OPENAI_API_KEY": "must-not-be-used",
            }
        )
        is None
    )
