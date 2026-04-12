# Agent-Assisted Development Workflow Resources

Curated during Phase 2 planning (2026-04-11). References for managing AI coding agents — workflow patterns, issue-driven development, parallel execution.

---

## Tier 1: Directly Applicable

**CCPM — Claude Code Project Management**
- URL: https://aroussi.com/post/ccpm-claude-code-project-management
- PRD → Epic → GitHub Issues → Parallel Execution. GitHub Issues as single source of truth (not chat history). Every commit ties to an issue with acceptance criteria.

**ACE — Advanced Context Engineering for Coding Agents**
- URL: https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/ace-fca.md
- Research → Plan → Implement with context compaction between phases. Keep context at 40-60%. Use subagents for search/summarize to protect parent context.

**GitHub Spec-Driven Development Toolkit (Spec Kit)**
- URL: https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/
- Specify → Plan → Tasks → Implement. Each task must be "implementable and testable in isolation." Open-source, works with Claude Code.

## Tier 2: Useful Reference

**Boris Cherny's Parallel Workflow Guide**
- URL: https://www.shareuhack.com/en/posts/claude-code-parallel-workflow-guide-2026
- Claude Code creator runs 10-15 sessions. Key rule: only parallelize tasks with no shared file modifications. Start with 3-5 worktrees. Check at 5 min, sweep every 15-20 min.

**Anthropic 2026 Agentic Coding Trends Report**
- URL: https://resources.anthropic.com/hubfs/2026%20Agentic%20Coding%20Trends%20Report.pdf
- 40-62% of AI-generated code has security vulnerabilities. "Intern model" works best — AI as capable junior requiring supervision. Strong CI/CD + test automation teams benefit most.

## Tier 3: ECC Local Patterns

**Autonomous Loops Skill** — `reference_repo/everything-claude-code/skills/autonomous-loops/SKILL.md`
- "Continuous Claude PR Loop": issue → worktree → TDD → PR → CI → merge → clean. Multi-day iterative projects.
- "De-Sloppify Pattern": dedicated cleanup pass after implementation.
- "RFC-Driven DAG": large features decomposed into work units with separate context per stage.

**Verification Loop Skill** — `reference_repo/everything-claude-code/skills/verification-loop/SKILL.md`
- 6-phase verification: Build → Type Check → Lint → Tests (80%+ coverage) → Security Scan → Diff Review. Produces structured PASS/FAIL report.

**dmux Workflows Skill** — `reference_repo/everything-claude-code/skills/dmux-workflows/SKILL.md`
- Multi-agent orchestration via tmux. Patterns: Research+Implement parallel, Multi-File Feature, Test+Fix Loop, Code Review Pipeline.
