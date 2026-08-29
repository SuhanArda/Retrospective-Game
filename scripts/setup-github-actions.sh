#!/usr/bin/env bash
# Configures the GitHub repository variables and environment secrets that the
# deploy-*.yml workflows read. Run it after `gh auth login`.
#
# Deployment tokens are read from Azure at run time and piped straight into
# `gh secret set`, so no secret is ever written to disk or echoed.
#
# Requires: gh (authenticated), az (logged in to the SabanciDx SaaS Dev tenant).

set -euo pipefail

REPO="${REPO:-sabancidx/Retrospective-Game}"
ENVIRONMENT="${ENVIRONMENT:-dev}"
SUBSCRIPTION="d0613b05-1693-461b-9439-41a59f5f0e1b"
TENANT="31619baa-7f7e-4f94-89b4-22ac17454cf8"
RG="rg-innovation-dev"

API_URL="https://app-retro-game-api-dev-001.azurewebsites.net"
SPIN_URL="https://app-retro-game-spin-dev-001.azurewebsites.net"
PLATFORM_URL="https://green-sand-0f888e703.7.azurestaticapps.net"
RETRO_RUSH_URL="https://ambitious-tree-04c30af03.7.azurestaticapps.net"
RUS_RULETI_URL="https://brave-mushroom-02a211703.7.azurestaticapps.net"
DRAW_AND_GUESS_URL="https://kind-sky-008489b03.7.azurestaticapps.net"
IMPOSTER_URL="https://zealous-meadow-0dc053a03.7.azurestaticapps.net"

command -v gh >/dev/null || { echo "gh CLI is required. See https://cli.github.com"; exit 1; }
command -v az >/dev/null || { echo "az CLI is required."; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Run 'gh auth login' first."; exit 1; }

echo "Creating the ${ENVIRONMENT} environment if it does not exist..."
gh api -X PUT "repos/${REPO}/environments/${ENVIRONMENT}" --silent

echo "Setting repository variables..."
while read -r name value; do
  [ -z "$name" ] && continue
  gh variable set "$name" --repo "$REPO" --body "$value"
  echo "  $name"
done <<EOF
PUBLIC_API_URL $API_URL
PUBLIC_PLATFORM_URL $PLATFORM_URL
PUBLIC_RETRO_RUSH_URL $RETRO_RUSH_URL
PUBLIC_SPIN_URL $SPIN_URL
PUBLIC_RUS_RULETI_URL $RUS_RULETI_URL
PUBLIC_DRAW_AND_GUESS_URL $DRAW_AND_GUESS_URL
PUBLIC_IMPOSTER_URL $IMPOSTER_URL
EOF

echo "Setting Azure identity secrets..."
if [ -z "${AZURE_CLIENT_ID:-}" ]; then
  echo "  AZURE_CLIENT_ID is not set in the environment; skipping the three identity secrets."
  echo "  Create the federated credential first, then re-run with AZURE_CLIENT_ID=<app id>."
else
  printf '%s' "$AZURE_CLIENT_ID"  | gh secret set AZURE_CLIENT_ID       --repo "$REPO" --env "$ENVIRONMENT"
  printf '%s' "$TENANT"           | gh secret set AZURE_TENANT_ID       --repo "$REPO" --env "$ENVIRONMENT"
  printf '%s' "$SUBSCRIPTION"     | gh secret set AZURE_SUBSCRIPTION_ID --repo "$REPO" --env "$ENVIRONMENT"
  echo "  AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID"
fi

echo "Setting Static Web Apps deployment tokens..."
while read -r secret swa; do
  [ -z "$secret" ] && continue
  az rest --method post \
    --url "https://management.azure.com/subscriptions/${SUBSCRIPTION}/resourceGroups/${RG}/providers/Microsoft.Web/staticSites/${swa}/listSecrets?api-version=2022-03-01" \
    --query "properties.apiKey" -o tsv \
    | tr -d '\r\n' \
    | gh secret set "$secret" --repo "$REPO" --env "$ENVIRONMENT"
  echo "  $secret"
done <<EOF
AZURE_SWA_TOKEN_PLATFORM stapp-retro-game-web-dev-001
AZURE_SWA_TOKEN_RETRO_RUSH stapp-retro-game-rush-dev-001
AZURE_SWA_TOKEN_RUS_RULETI stapp-retro-game-rus-ruleti-dev-001
AZURE_SWA_TOKEN_DRAW_AND_GUESS stapp-retro-game-draw-dev-001
AZURE_SWA_TOKEN_IMPOSTER stapp-retro-game-imposter-dev-001
EOF

echo "Done. Verify with: gh variable list --repo $REPO && gh secret list --repo $REPO --env $ENVIRONMENT"
