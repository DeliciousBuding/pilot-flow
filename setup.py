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
import os
import shutil
import sys


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
    for f in ["__init__.py", "tools.py", "plugin.yaml"]:
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


def check_env():
    """Check for required environment variables."""
    env_file = os.path.expanduser("~/.hermes/.env")
    if not os.path.exists(env_file):
        print(f"  WARNING: {env_file} not found")
        print("  Create it with: cp .env.example ~/.hermes/.env")
        print("  Then edit with your Feishu credentials")
        return False

    required = ["OPENAI_API_KEY", "FEISHU_APP_ID", "FEISHU_APP_SECRET"]
    missing = []
    with open(env_file) as f:
        content = f.read()
        for var in required:
            if var not in content or f"{var}=" not in content:
                missing.append(var)

    if missing:
        print(f"  WARNING: Missing in {env_file}: {', '.join(missing)}")
        return False

    print(f"  Environment OK ({env_file})")
    return True


def validate_install(hermes_dir):
    """Validate the installation."""
    plugin_dir = os.path.join(hermes_dir, "plugins", "pilotflow")
    skills_dir = os.path.join(hermes_dir, "skills", "pilotflow")

    checks = [
        (os.path.exists(os.path.join(plugin_dir, "__init__.py")), "plugins/pilotflow/__init__.py"),
        (os.path.exists(os.path.join(plugin_dir, "tools.py")), "plugins/pilotflow/tools.py"),
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


def main():
    parser = argparse.ArgumentParser(description="Install PilotFlow plugin into hermes-agent")
    parser.add_argument("--hermes-dir", help="Path to hermes-agent directory")
    args = parser.parse_args()

    hermes_dir = args.hermes_dir or find_hermes_dir()
    if not hermes_dir:
        print("ERROR: Could not find hermes-agent directory")
        print("Use --hermes-dir to specify the path")
        sys.exit(1)

    src_dir = os.path.dirname(os.path.abspath(__file__))

    print(f"PilotFlow Setup")
    print(f"=" * 50)
    print(f"Source: {src_dir}")
    print(f"Target: {hermes_dir}")
    print()

    print("1. Copying plugin...")
    copy_plugin(src_dir, hermes_dir)

    print("2. Copying skills...")
    copy_skills(src_dir, hermes_dir)

    print("3. Checking environment...")
    env_ok = check_env()

    print("4. Validating installation...")
    install_ok = validate_install(hermes_dir)

    print()
    if install_ok:
        print("Setup complete!")
        if not env_ok:
            print("WARNING: Environment variables need configuration")
            print("Edit ~/.hermes/.env with your Feishu credentials")
        else:
            print("Run: uv run hermes gateway")
    else:
        print("Setup incomplete — check errors above")
        sys.exit(1)


if __name__ == "__main__":
    main()
