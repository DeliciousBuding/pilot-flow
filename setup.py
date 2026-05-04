#!/usr/bin/env python3
"""PilotFlow setup script — automates plugin installation into hermes-agent.

Usage:
    python setup.py [--hermes-dir /path/to/hermes-agent]

This script:
1. Copies PilotFlow plugin to hermes-agent/plugins/
2. Copies PilotFlow skills to hermes-agent/skills/
3. Checks for required environment variables
4. Validates the installation
"""

import argparse
import json
import os
import shutil
import sys


REQUIRED_ENV = ["OPENAI_API_KEY", "FEISHU_APP_ID", "FEISHU_APP_SECRET"]
RECOMMENDED_CONFIG_MARKERS = ("provider:", "gateway:", "default_platform:", "feishu:")
QUIET_DISPLAY_BLOCK = """

# PilotFlow: keep Feishu group chats free of internal tool-progress text.
display:
  platforms:
    feishu:
      tool_progress: off
"""
PLACEHOLDER_MARKERS = ("your-", "xxx", "xxxxx", "changeme", "example")


def find_hermes_dir():
    """Try to find hermes-agent directory."""
    candidates = [
        os.path.expanduser("~/hermes-agent"),
        os.path.join(os.path.dirname(__file__), "..", "hermes-agent"),
        os.path.join(os.path.dirname(__file__), "..", "..", "hermes-agent"),
    ]
    for c in candidates:
        if os.path.isdir(os.path.join(c, "plugins")):
            return os.path.abspath(c)
    return None


def copy_plugin(src_dir, dst_dir):
    """Copy plugin files."""
    src = os.path.join(src_dir, "plugins", "pilotflow")
    dst = os.path.join(dst_dir, "plugins", "pilotflow")
    os.makedirs(dst, exist_ok=True)
    for f in ["__init__.py", "tools.py", "trace.py", "plugin.yaml"]:
        shutil.copy2(os.path.join(src, f), os.path.join(dst, f))
    print(f"  Copied plugin to {dst}")


def copy_skills(src_dir, dst_dir):
    """Copy skill files."""
    src = os.path.join(src_dir, "skills", "pilotflow")
    dst = os.path.join(dst_dir, "skills", "pilotflow")
    os.makedirs(dst, exist_ok=True)
    for f in ["SKILL.md", "DESCRIPTION.md"]:
        if os.path.exists(os.path.join(src, f)):
            shutil.copy2(os.path.join(src, f), os.path.join(dst, f))
    print(f"  Copied skills to {dst}")


def _parse_env(content):
    """Parse simple KEY=VALUE lines from an env file."""
    values = {}
    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def _is_configured(value):
    if not value:
        return False
    lowered = value.lower()
    return not any(marker in lowered for marker in PLACEHOLDER_MARKERS)


def _backup_file(path):
    """Create a reversible backup next to the original file."""
    backup_path = f"{path}.pilotflow.bak"
    shutil.copy2(path, backup_path)
    return backup_path


def _load_lark_cli_profiles(config_file=None):
    """Load lark-cli profile metadata without exposing stored secrets."""
    config_file = config_file or os.path.expanduser("~/.lark-cli/config.json")
    if not os.path.exists(config_file):
        return []
    try:
        with open(config_file, encoding="utf-8") as f:
            config = json.load(f)
    except (OSError, json.JSONDecodeError):
        return []
    profiles = []
    for app in config.get("apps", []):
        app_id = app.get("appId") or ""
        if not app_id:
            continue
        profiles.append(
            {
                "name": app.get("name") or app_id,
                "app_id": app_id,
                "secret_source": (app.get("appSecret") or {}).get("source") or "unknown",
            }
        )
    return profiles


def _matching_lark_cli_profile(app_id, config_file=None):
    """Return the lark-cli profile matching a Feishu app id, if present."""
    if not app_id:
        return None
    for profile in _load_lark_cli_profiles(config_file):
        if profile.get("app_id") == app_id:
            return profile
    return None


def check_env(env_file=None, lark_cli_config_file=None):
    """Check for required environment variables."""
    env_file = env_file or os.path.expanduser("~/.hermes/.env")
    if not os.path.exists(env_file):
        print(f"  WARNING: {env_file} not found")
        print("  Create it with: cp .env.example ~/.hermes/.env")
        print("  Then edit with your Feishu credentials")
        return False

    missing = []
    with open(env_file) as f:
        values = _parse_env(f.read())
        for var in REQUIRED_ENV:
            if not _is_configured(values.get(var, "")):
                missing.append(var)

    if missing:
        print(f"  WARNING: Missing in {env_file}: {', '.join(missing)}")
        profile = _matching_lark_cli_profile(values.get("FEISHU_APP_ID", ""), lark_cli_config_file)
        if profile and "FEISHU_APP_SECRET" in missing:
            print(
                "  NOTE: lark-cli profile "
                f"'{profile['name']}' has the same FEISHU_APP_ID "
                f"(secret source: {profile['secret_source']})."
            )
            print("  Hermes gateway does not read lark-cli keychain secrets automatically.")
            print("  Copy the matching app secret into ~/.hermes/.env as FEISHU_APP_SECRET before live E2E.")
        return False

    print(f"  Environment OK ({env_file})")
    return True


def check_lark_cli_alignment(env_file=None, lark_cli_config_file=None):
    """Check whether the Hermes env app id matches the active lark-cli profile."""
    env_file = env_file or os.path.expanduser("~/.hermes/.env")
    if not os.path.exists(env_file):
        return False

    with open(env_file, encoding="utf-8") as f:
        values = _parse_env(f.read())

    app_id = values.get("FEISHU_APP_ID", "")
    if not app_id:
        return False

    profile = _matching_lark_cli_profile(app_id, lark_cli_config_file)
    if profile:
        print(
            "  lark-cli profile aligned with FEISHU_APP_ID "
            f"({profile['name']}, secret source: {profile['secret_source']})"
        )
        return True

    print("  WARNING: No matching lark-cli profile found for FEISHU_APP_ID")
    return False


def check_config(config_file=None):
    """Check that Hermes config has the required model and Feishu gateway sections."""
    config_file = config_file or os.path.expanduser("~/.hermes/config.yaml")
    if not os.path.exists(config_file):
        print(f"  WARNING: {config_file} not found")
        print("  Create it from INSTALL.md before starting the gateway")
        return False

    with open(config_file) as f:
        content = f.read()
    missing = [marker for marker in RECOMMENDED_CONFIG_MARKERS if marker not in content]
    if missing:
        print(f"  WARNING: {config_file} may be incomplete; missing: {', '.join(missing)}")
        return False

    print(f"  Hermes config OK ({config_file})")
    return True


def _yaml_key_value(raw_line):
    """Parse one simple YAML key/value line without pulling in a YAML dependency."""
    stripped = raw_line.strip()
    if not stripped or stripped.startswith("#") or ":" not in stripped:
        return None
    key, value = stripped.split(":", 1)
    return key.strip(), value.strip()


def _find_yaml_section(lines, path):
    """Find a simple indented YAML section by path and return (line_index, indent)."""
    stack = []
    for index, raw_line in enumerate(lines):
        parsed = _yaml_key_value(raw_line)
        if not parsed:
            continue
        indent = len(raw_line) - len(raw_line.lstrip(" "))
        key, value = parsed
        while stack and stack[-1][0] >= indent:
            stack.pop()
        current_path = [item[1] for item in stack] + [key]
        if current_path == path:
            return index, indent
        if not value:
            stack.append((indent, key))
    return None


def _replace_or_insert_yaml_value(lines, section_path, key, value):
    section = _find_yaml_section(lines, section_path)
    if not section:
        return False
    section_index, section_indent = section
    child_indent = section_indent + 2
    insert_at = section_index + 1
    for index in range(section_index + 1, len(lines)):
        raw_line = lines[index]
        parsed = _yaml_key_value(raw_line)
        if not parsed:
            insert_at = index + 1
            continue
        indent = len(raw_line) - len(raw_line.lstrip(" "))
        if indent <= section_indent:
            break
        if indent == child_indent:
            insert_at = index + 1
            child_key, _ = parsed
            if child_key == key:
                lines[index] = f"{' ' * child_indent}{key}: {value}"
                return True
    lines.insert(insert_at, f"{' ' * child_indent}{key}: {value}")
    return True


def _ensure_yaml_section(lines, parent_path, key):
    section_path = [*parent_path, key]
    existing = _find_yaml_section(lines, section_path)
    if existing:
        return existing
    parent = _find_yaml_section(lines, parent_path)
    if not parent:
        return None
    parent_index, parent_indent = parent
    child_indent = parent_indent + 2
    insert_at = parent_index + 1
    for index in range(parent_index + 1, len(lines)):
        raw_line = lines[index]
        parsed = _yaml_key_value(raw_line)
        if not parsed:
            insert_at = index + 1
            continue
        indent = len(raw_line) - len(raw_line.lstrip(" "))
        if indent <= parent_indent:
            break
        if indent == child_indent:
            insert_at = index + 1
    lines.insert(insert_at, f"{' ' * child_indent}{key}:")
    return insert_at, child_indent


def _has_feishu_tool_progress_off(content):
    lines = content.splitlines()
    stack = []
    for raw_line in lines:
        parsed = _yaml_key_value(raw_line)
        if not parsed:
            continue
        indent = len(raw_line) - len(raw_line.lstrip(" "))
        key, value = parsed
        while stack and stack[-1][0] >= indent:
            stack.pop()
        current_path = [item[1] for item in stack] + [key]
        if current_path == ["display", "platforms", "feishu", "tool_progress"]:
            return value.strip('"').strip("'").lower() == "off"
        if not value:
            stack.append((indent, key))
    return False


def _merge_feishu_quiet_display(content):
    lines = content.splitlines()
    if not _find_yaml_section(lines, ["display"]):
        return content.rstrip() + QUIET_DISPLAY_BLOCK
    if not _ensure_yaml_section(lines, ["display"], "platforms"):
        return None
    if not _ensure_yaml_section(lines, ["display", "platforms"], "feishu"):
        return None
    if not _replace_or_insert_yaml_value(lines, ["display", "platforms", "feishu"], "tool_progress", "off"):
        return None
    return "\n".join(lines) + ("\n" if content.endswith("\n") else "")


def ensure_feishu_quiet_display(config_file=None):
    """Ensure Feishu does not show Hermes internal tool progress in group chat."""
    config_file = config_file or os.path.expanduser("~/.hermes/config.yaml")
    if not os.path.exists(config_file):
        return False

    with open(config_file, encoding="utf-8") as f:
        content = f.read()

    if _has_feishu_tool_progress_off(content):
        print("  Feishu display noise guard OK")
        return True

    merged_content = _merge_feishu_quiet_display(content)
    if merged_content is None:
        print("  WARNING: config.yaml display settings could not be merged safely")
        print("  Add display.platforms.feishu.tool_progress: off to hide internal tool names")
        return False

    backup_path = _backup_file(config_file)
    with open(config_file, "w", encoding="utf-8") as f:
        f.write(merged_content)
    print(f"  Added Feishu display noise guard (backup: {backup_path})")
    return True


def validate_install(hermes_dir):
    """Validate the installation."""
    plugin_dir = os.path.join(hermes_dir, "plugins", "pilotflow")
    skills_dir = os.path.join(hermes_dir, "skills", "pilotflow")

    checks = [
        (os.path.exists(os.path.join(plugin_dir, "__init__.py")), "plugins/pilotflow/__init__.py"),
        (os.path.exists(os.path.join(plugin_dir, "tools.py")), "plugins/pilotflow/tools.py"),
        (os.path.exists(os.path.join(plugin_dir, "trace.py")), "plugins/pilotflow/trace.py"),
        (os.path.exists(os.path.join(plugin_dir, "plugin.yaml")), "plugins/pilotflow/plugin.yaml"),
        (os.path.exists(os.path.join(skills_dir, "SKILL.md")), "skills/pilotflow/SKILL.md"),
        (os.path.exists(os.path.join(skills_dir, "DESCRIPTION.md")), "skills/pilotflow/DESCRIPTION.md"),
    ]

    all_ok = True
    for ok, name in checks:
        status = "OK" if ok else "MISSING"
        if not ok:
            all_ok = False
        print(f"  {status}: {name}")

    return all_ok


def _runtime_file(hermes_home, filename):
    """Return a runtime profile file path for env/config checks."""
    return os.path.join(os.path.abspath(os.path.expanduser(hermes_home)), filename)


def main():
    parser = argparse.ArgumentParser(description="Install PilotFlow plugin into hermes-agent")
    parser.add_argument("--hermes-dir", help="Path to hermes-agent directory")
    parser.add_argument(
        "--hermes-home",
        default=os.path.expanduser("~/.hermes"),
        help="Hermes runtime profile directory for .env/config checks (default: ~/.hermes)",
    )
    args = parser.parse_args()

    hermes_dir = args.hermes_dir or find_hermes_dir()
    if not hermes_dir:
        print("ERROR: Could not find hermes-agent directory")
        print("Use --hermes-dir to specify the path")
        sys.exit(1)

    src_dir = os.path.dirname(os.path.abspath(__file__))
    env_file = _runtime_file(args.hermes_home, ".env")
    config_file = _runtime_file(args.hermes_home, "config.yaml")

    print(f"PilotFlow Setup")
    print(f"=" * 50)
    print(f"Source: {src_dir}")
    print(f"Target: {hermes_dir}")
    print(f"Hermes home: {os.path.abspath(os.path.expanduser(args.hermes_home))}")
    print()

    print("1. Copying plugin...")
    copy_plugin(src_dir, hermes_dir)

    print("2. Copying skills...")
    copy_skills(src_dir, hermes_dir)

    print("3. Checking environment...")
    env_ok = check_env(env_file)
    check_lark_cli_alignment(env_file)

    print("4. Checking Hermes config...")
    config_ok = check_config(config_file)

    print("4b. Configuring Feishu display...")
    ensure_feishu_quiet_display(config_file)

    print("5. Validating installation...")
    install_ok = validate_install(hermes_dir)

    print()
    if install_ok:
        print("Setup complete!")
        if not env_ok:
            print("WARNING: Environment variables need configuration")
            print(f"Edit {env_file} with your Feishu credentials")
        elif not config_ok:
            print("WARNING: Hermes config needs review")
            print(f"Edit {config_file} using INSTALL.md")
        else:
            print("Run: uv run hermes gateway")
    else:
        print("Setup incomplete — check errors above")
        sys.exit(1)


if __name__ == "__main__":
    main()
