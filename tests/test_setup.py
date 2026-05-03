"""Tests for the portable setup helper."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import setup


def test_parse_env_ignores_comments_and_quotes():
    values = setup._parse_env("""
    # comment
    OPENAI_API_KEY="sk-test"
    FEISHU_APP_ID='cli_test'
    FEISHU_APP_SECRET=secret
    """)

    assert values["OPENAI_API_KEY"] == "sk-test"
    assert values["FEISHU_APP_ID"] == "cli_test"
    assert values["FEISHU_APP_SECRET"] == "secret"


def test_is_configured_rejects_placeholders():
    assert setup._is_configured("real-value") is True
    assert setup._is_configured("") is False
    assert setup._is_configured("your-api-key-here") is False
    assert setup._is_configured("cli_xxxxxxxxxxxxxxxx") is False


def test_check_env_rejects_missing_and_placeholder_values(tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text(
        "\n".join([
            "OPENAI_API_KEY=your-api-key-here",
            "FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxx",
            "FEISHU_APP_SECRET=",
        ]),
        encoding="utf-8",
    )

    assert setup.check_env(str(env_file)) is False


def test_check_env_accepts_configured_values(tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text(
        "\n".join([
            "OPENAI_API_KEY=sk-test",
            "FEISHU_APP_ID=cli_testvalue",
            "FEISHU_APP_SECRET=real-secret",
        ]),
        encoding="utf-8",
    )

    assert setup.check_env(str(env_file)) is True


def test_check_config_rejects_missing_file(tmp_path):
    assert setup.check_config(str(tmp_path / "missing.yaml")) is False


def test_check_config_accepts_required_sections(tmp_path):
    config_file = tmp_path / "config.yaml"
    config_file.write_text(
        """
model:
  default: gpt-4.1
  provider: openai
gateway:
  default_platform: feishu
  platforms:
    feishu:
      connection_mode: websocket
""",
        encoding="utf-8",
    )

    assert setup.check_config(str(config_file)) is True


def test_ensure_feishu_quiet_display_appends_when_safe(tmp_path):
    config_file = tmp_path / "config.yaml"
    config_file.write_text(
        """
model:
  default: gpt-4.1
gateway:
  default_platform: feishu
  platforms:
    feishu:
      connection_mode: websocket
""",
        encoding="utf-8",
    )

    assert setup.ensure_feishu_quiet_display(str(config_file)) is True
    content = config_file.read_text(encoding="utf-8")
    assert "tool_progress: off" in content
    backup_file = tmp_path / "config.yaml.pilotflow.bak"
    assert backup_file.exists()
    assert "tool_progress: off" not in backup_file.read_text(encoding="utf-8")


def test_ensure_feishu_quiet_display_warns_on_existing_display(tmp_path):
    config_file = tmp_path / "config.yaml"
    config_file.write_text(
        """
display:
  tool_progress: new
""",
        encoding="utf-8",
    )

    assert setup.ensure_feishu_quiet_display(str(config_file)) is False
    assert config_file.read_text(encoding="utf-8").count("display:") == 1


def test_copy_plugin_and_skills_to_hermes_layout(tmp_path):
    src_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    hermes_dir = tmp_path / "hermes-agent"
    (hermes_dir / "plugins").mkdir(parents=True)
    (hermes_dir / "skills").mkdir()

    setup.copy_plugin(src_dir, str(hermes_dir))
    setup.copy_skills(src_dir, str(hermes_dir))

    assert (hermes_dir / "plugins" / "pilotflow" / "__init__.py").exists()
    assert (hermes_dir / "plugins" / "pilotflow" / "tools.py").exists()
    assert (hermes_dir / "plugins" / "pilotflow" / "plugin.yaml").exists()
    assert (hermes_dir / "skills" / "pilotflow" / "SKILL.md").exists()
    assert (hermes_dir / "skills" / "pilotflow" / "DESCRIPTION.md").exists()
    assert setup.validate_install(str(hermes_dir)) is True
