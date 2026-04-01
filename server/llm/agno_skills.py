"""CLI Skills discovery and instruction generation for Agno Agent."""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def load_skills_info() -> list[dict[str, str]]:
    """扫描 server/config/skills/ 目录，解析每个 .md 文件的 frontmatter。

    Returns:
        [{"name": "officecli", "description": "...", "path": "..."}]
    """
    from pathlib import Path  # noqa: PLC0415

    skills_dir = Path(__file__).resolve().parent.parent / "config" / "skills"
    if not skills_dir.is_dir():
        return []

    skills: list[dict[str, str]] = []
    for md_file in sorted(skills_dir.glob("*.md")):
        try:
            text = md_file.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        if not text.startswith("---"):
            continue
        end = text.find("---", 3)
        if end == -1:
            continue
        frontmatter = text[3:end]
        info: dict[str, str] = {"path": str(md_file)}
        for line in frontmatter.splitlines():
            if ":" in line:
                key, _, val = line.partition(":")
                info[key.strip()] = val.strip()
        if info.get("name"):
            skills.append(info)
    return skills


def build_skills_instruction(lang: str, skills: list[dict[str, str]]) -> str | None:
    """根据已发现的 skills 生成提示词片段，告知 Agent 可通过 shell 调用这些 CLI 工具。"""
    if not skills:
        return None

    lines: list[str] = []
    for s in skills:
        lines.append(f"  - {s['name']}: {s.get('description', '')}")
    skill_list = "\n".join(lines)

    if lang == "zh":
        return (
            "【可用 CLI 技能】以下命令行工具已安装，可通过 run_shell_command 调用：\n"
            f"{skill_list}\n"
            "使用时直接通过 shell 执行命令即可（如 officecli create report.docx）。"
            "如需了解详细用法，可执行 officecli --help 或 officecli <格式> <命令> 查看帮助。"
        )
    return (
        "[Available CLI Skills] The following CLI tools are installed and "
        "can be invoked via run_shell_command:\n"
        f"{skill_list}\n"
        "Run commands directly via shell (e.g. officecli create report.docx). "
        "For detailed usage, run officecli --help or officecli <format> <command>."
    )
