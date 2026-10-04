#!/usr/bin/env bash
# Claude Code SessionStart hook: prints the project's current state so every session starts
# oriented — what's next, and whether anything is blocked — without the user re-explaining.
cd "$(dirname "$0")/../.." || exit 0

echo "## Drop a Bop — session briefing (auto-generated)"
echo
echo "Rules: CLAUDE.md. Spec: docs/SPEC.md. Use /next-task to continue the roadmap."
echo

next=$(grep -m1 -E '^- \[ \] \*\*' docs/ROADMAP.md 2>/dev/null)
if [ -n "$next" ]; then
  echo "Next roadmap task: ${next#- \[ \] }"
  case "$next" in
    *"[HUMAN]"*) echo "  → This is a HUMAN task: explain the steps to Ethan; do not attempt it yourself." ;;
  esac
else
  echo "All roadmap tasks are checked off."
fi

done_count=$(grep -cE '^- \[x\] \*\*' docs/ROADMAP.md 2>/dev/null || echo 0)
open_count=$(grep -cE '^- \[ \] \*\*' docs/ROADMAP.md 2>/dev/null || echo 0)
echo "Progress: $done_count done, $open_count remaining."
echo

# Show the blocked/questions section if it has real entries.
blocked=$(awk '/^## Blocked/{f=1;next} /^## /{f=0} f' docs/PROGRESS.md 2>/dev/null | grep -E '^- \[ \]' || true)
if [ -n "$blocked" ]; then
  echo "Open questions / blockers (from docs/PROGRESS.md):"
  echo "$blocked"
  echo
fi

if ! git diff --quiet 2>/dev/null || [ -n "$(git ls-files -o --exclude-standard 2>/dev/null)" ]; then
  echo "Note: the working tree has uncommitted changes from a previous session — review them before starting new work."
fi
exit 0
