#!/usr/bin/env bash
# PostToolUse after a file edit (Claude: Write/Edit; Codex: apply_patch). Reminds the assistant
# to fact-check application documents, log shared changes, and point the user to their drafts.
# Usage: after-write.sh [claude|codex]
APP="${1:-claude}"
ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
# Publishing pages is a Claude feature, so only Claude gets the republish reminders.
PUB="$ROOT/profile/published-pages.md"; [ "$APP" = codex ] && PUB=/dev/null
input="$(cat)"
# Claude sends "file_path"; Codex sends a patch with "*** Add File: <path>" / "*** Update File: <path>" lines.
paths="$(printf '%s' "$input" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1 | sed 's#\\\\#/#g')
$(printf '%s' "$input" | sed 's#\\\\#/#g; s/\\r//g; s/\\n/\n/g' | sed -nE 's/^\*\*\* (Add File|Update File|Move to): (.*)$/\2/p')"
if [ "$APP" = codex ]; then OUTBOX="the Outbox (say \\\"show my outbox\\\")"; else OUTBOX="/outbox (if /outbox isn't available in their app, show them the text to copy instead)"; fi

msg=""
# A draft being moved into outbox/sent/ or outbox/discarded/ is being archived, not written.
MOVED=""; case "$paths" in *outbox/sent/*|*outbox/discarded/*) MOVED=1 ;; esac
add() { case "$msg" in *"$1"*) ;; *) msg="${msg:+$msg }$1" ;; esac; }
while IFS= read -r p; do
  [ -n "$p" ] || continue
  p="/$(printf '%s' "$p" | tr '\\' '/' | tr -s '/' | sed 's#^/##')"
  case "$p" in */.agents/*|*/.claude/*|*/.codex/*) continue ;; esac
  case "$p" in
    */jobs/*/resume.md|*/jobs/*/cover-letter.md|*/jobs/*/application-answers.md)
      add "Reminder: before showing the user $(basename "$p"), run the truth-checker review (and voice-editor for prose) on this latest version, then rebuild its .html from the final text." ;;
    */jobs/tracker.csv|*/contacts/contacts.csv)
      APPNAME=Claude; [ "$APP" = codex ] && APPNAME=Codex
      add "Shared record changed: append one line to history/activity.md exactly like: - $(date '+%Y-%m-%d %H:%M') · $APPNAME · <job or person>: <what changed>."
      case "$p" in */jobs/tracker.csv)
        grep -q '"example": true' "$ROOT/pages/dashboard.html" 2>/dev/null && add "The dashboard page still shows example data; refresh its data block from the tracker at the end of this task (pages skill)."
        grep -qE "^\|[[:space:]]*Dashboard[[:space:]]*\|.*https" "$PUB" 2>/dev/null && add "The user's dashboard is published; republish it once you finish this task (see the pages skill)." ;;
      esac ;;
    */profile/story-bank.md|*/knowledge/field/field-primer.md)
      grep -qE "^\|[[:space:]]*Flashcards[[:space:]]*\|.*https" "$PUB" 2>/dev/null && add "The user's flashcards are published and their source changed. Refresh and republish them once you finish this task (see the pages skill)." ;;
    */profile/master-resume.md)
      grep -qE "^\|[[:space:]]*Portfolio[[:space:]]*\|.*https" "$PUB" 2>/dev/null && add "The user's portfolio is published and their master resume changed. Offer to update it; republish only after the user approves." ;;
    */outbox/_*|*/outbox/sent/*|*/outbox/discarded/*) ;;
    */outbox/*.md)
      [ -n "$MOVED" ] || add "This is an Outbox draft. Check it follows the header format in knowledge/outbox-format.md, run voice-editor if not done, and tell the user it's ready in $OUTBOX. Never send it yourself." ;;
  esac
done <<EOF
$paths
EOF
[ -n "$msg" ] && printf '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"%s"}}\n' "$msg"
exit 0
