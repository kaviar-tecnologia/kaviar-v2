#!/usr/bin/env bash
set -euo pipefail

echo "ERROR: legacy RBAC production seed is disabled."
echo "Reason: it depended on obsolete schema/accounts and could recreate retired privileged users."
echo "Use explicit, reviewed migrations or purpose-built provisioning flows instead."
exit 1
