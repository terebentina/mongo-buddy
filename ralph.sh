#!/bin/bash

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 {iterations}"
  exit 1
fi

PROGRESS_FILE="prds/progress.txt"
PROMPT_FILE="prds/ralph-prompt.md"

# Initialize progress file if it doesn't exist
if [ ! -f "$PROGRESS_FILE" ]; then
  echo "# Ralph Progress Log" > "$PROGRESS_FILE"
  echo "Started: $(date)" >> "$PROGRESS_FILE"
  echo "---" >> "$PROGRESS_FILE"
fi

for ((i=1; i<=$1; i++)); do
  echo "---------------------------------------"
  echo "Iteration: $i of $1"
  OUTPUT=$(claude --permission-mode bypassPermissions -p < $PROMPT_FILE 2>&1 | tee /dev/stderr) || true

  # Check for completion signal
  if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
    echo ""
    echo "Ralph completed all tasks!"
    echo "Completed at iteration $i of $1."
    exit 0
  fi

  echo "Iteration $i complete. Continuing..."
  echo "---------------------------------------"
  sleep 2
done

echo ""
echo "Ralph reached max iterations ($MAX_ITERATIONS) without completing all tasks."
echo "Check $PROGRESS_FILE for status."
exit 1
