#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ "$(aws sts get-caller-identity --query Account --output text)" == 905106554499 ]]

work=$(mktemp -d)
trap 'rm -f "$work"/service.json "$work"/containers.json "$work"/endpoint.json; rmdir "$work"' EXIT

verify_public() {
  curl -fsS --max-time 10 "$SITE/health" >/dev/null &&
    curl -fsS --max-time 10 -H 'Cache-Control: no-cache' "$SITE/api/version" |
    jq -e --arg expected "$EXPECTED_VERSION" '.version == $expected' >/dev/null
}

head=$(gh api "repos/$GITHUB_REPOSITORY/commits/$GITHUB_REF_NAME" --jq .sha)
if [[ "$head" != "$GITHUB_SHA" ]]; then
  echo "A newer commit superseded this run."
  exit 0
fi

ready='.containerServices[0] | .state == "RUNNING" and .currentDeployment.state == "ACTIVE" and .nextDeployment == null'
for ((attempt=0; attempt<36; attempt++)); do
  aws lightsail get-container-services --service-name "$SERVICE" > "$work/service.json"
  if jq -e "$ready" "$work/service.json" >/dev/null; then
    break
  fi
  sleep 10
done
if ! jq -e "$ready" "$work/service.json" >/dev/null; then
  echo "::error::Lightsail did not settle before the deployment deadline."
  exit 1
fi
if verify_public; then
  echo "The tested application version is already live."
  exit 0
fi

label="gha-${GITHUB_SHA:0:12}-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
aws lightsail push-container-image --service-name "$SERVICE" --label "$label" --image "dawamkom:$GITHUB_SHA"
image=$(aws lightsail get-container-images --service-name "$SERVICE" |
  jq -er --arg label "$label" '.containerImages[] | select(.image | split(".") | .[-2] == $label) | .image')

baseline=$(jq -er '.containerServices[0].currentDeployment.version' "$work/service.json")
aws lightsail get-container-services --service-name "$SERVICE" > "$work/service.json"
jq -e --argjson baseline "$baseline" '.containerServices[0] | .currentDeployment.version == $baseline and .nextDeployment == null' "$work/service.json" >/dev/null
head=$(gh api "repos/$GITHUB_REPOSITORY/commits/$GITHUB_REF_NAME" --jq .sha)
if [[ "$head" != "$GITHUB_SHA" ]]; then
  echo "A newer commit superseded this run before deployment."
  exit 0
fi

jq --arg image "$image" '.containerServices[0].currentDeployment | .publicEndpoint.containerName as $name | .containers | .[$name].image = $image' "$work/service.json" > "$work/containers.json"
jq '.containerServices[0].currentDeployment.publicEndpoint' "$work/service.json" > "$work/endpoint.json"
version=$(aws lightsail create-container-service-deployment --service-name "$SERVICE" \
  --containers "file://$work/containers.json" --public-endpoint "file://$work/endpoint.json" \
  --query 'containerService.nextDeployment.version' --output text)
[[ "$version" =~ ^[0-9]+$ ]]
echo "Submitted Lightsail deployment $version."
for ((attempt=0; attempt<60; attempt++)); do
  aws lightsail get-container-services --service-name "$SERVICE" > "$work/service.json"
  if jq -e --argjson version "$version" '.containerServices[0] | .currentDeployment.version == $version and .currentDeployment.state == "ACTIVE" and .nextDeployment == null' "$work/service.json" >/dev/null && verify_public; then
    echo "Lightsail deployment $version is active and public version $EXPECTED_VERSION passed verification."
    exit 0
  fi
  if jq -e --argjson version "$version" '.containerServices[0] | .state == "RUNNING" and .currentDeployment.version != $version and .nextDeployment == null' "$work/service.json" >/dev/null; then
    echo "::error::Lightsail rollout ended before deployment $version became active."
    exit 1
  fi
  sleep 10
done
echo "::error::Deployment $version did not pass live verification on time."
exit 1
