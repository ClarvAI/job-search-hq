#!/usr/bin/env bash
# Status line: the job pipeline in one line.
cat >/dev/null
s="$(bash "$(dirname "$0")/summary.sh" short 2>/dev/null)"
{ [ "$s" = "no tracker" ] || [ -z "$s" ]; } && s="nothing tracked yet (try /find-jobs)"
echo "Job search: $s"
