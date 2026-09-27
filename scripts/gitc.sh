#!/bin/sh
# Commit as CodingAngel1.
#
# The runtime environment exports GIT_AUTHOR_NAME/GIT_COMMITTER_NAME=LaPoshBaby,
# which outrank `git config`. Every commit must go through this wrapper (or set
# the four variables explicitly) or history gets the wrong identity again.
#
# Usage: scripts/gitc.sh "commit message" [path ...]
#        (no paths = `git commit -a`)
set -e

MSG="$1"; shift || true

if [ -z "$MSG" ]; then
  echo "usage: scripts/gitc.sh \"message\" [paths...]" >&2
  exit 1
fi

export GIT_AUTHOR_NAME="CodingAngel1"
export GIT_AUTHOR_EMAIL="CodingAngel1@users.noreply.github.com"
export GIT_COMMITTER_NAME="CodingAngel1"
export GIT_COMMITTER_EMAIL="CodingAngel1@users.noreply.github.com"

cd "$(git rev-parse --show-toplevel)"

if [ "$#" -gt 0 ]; then
  git add "$@"
  git commit -m "$MSG"
else
  git commit -a -m "$MSG"
fi

echo "--- identity check ---"
git log -1 --format='author:    %an <%ae>%ncommitter: %cn <%ce>'
