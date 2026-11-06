#!/usr/bin/env bash
# 用途：在本机（已 `gh auth login`）一键把部署所需的 GitHub Secrets 批量写入仓库。
# 步骤：
#   1) 复制 .env.deploy.example 为 .env.deploy 并填入你的值（空着的项会被跳过）
#   2) 在本机终端运行： bash scripts/setup-github-secrets.sh
# 注意：BETTER_AUTH_SECRET 若留空会自动用 openssl 生成；.env.deploy 含真实密钥，已被 .gitignore 忽略，切勿提交。

set -euo pipefail

REPO="zhengshengzhan/qr-manager"
ENV_FILE=".env.deploy"

if ! command -v gh >/dev/null 2>&1; then
  echo "❌ 未检测到 gh，请先安装 GitHub CLI 并运行 'gh auth login'"
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ 未找到 $ENV_FILE，请先复制 .env.deploy.example 并填写"
  exit 1
fi

# 读取 .env.deploy（支持 KEY="value with spaces"、跳过空行与 # 注释）
declare -A VARS
while IFS= read -r line; do
  line="${line%%#*}"
  line="$(echo "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  [ -z "$line" ] && continue
  key="${line%%=*}"
  val="${line#*=}"
  val="${val%\"}"; val="${val#\"}"
  val="${val%\'}"; val="${val#\'}"
  VARS["$key"]="$val"
done < "$ENV_FILE"

# BETTER_AUTH_SECRET 留空则自动生成
if [ -z "${VARS[BETTER_AUTH_SECRET]:-}" ]; then
  VARS[BETTER_AUTH_SECRET]="$(openssl rand -base64 32)"
  echo "🔑 已自动生成 BETTER_AUTH_SECRET"
fi

SECRETS=(
  CLOUDFLARE_API_TOKEN
  CLOUDFLARE_ACCOUNT_ID
  CUSTOM_DOMAIN
  BETTER_AUTH_SECRET
  BETTER_AUTH_URL
  BETTER_AUTH_GITHUB_CLIENT_ID
  BETTER_AUTH_GITHUB_CLIENT_SECRET
  RESEND_API_KEY
  RESEND_SENDER_ADDRESS
  NEXT_PUBLIC_MAX_FILE_MB
  NEXT_PUBLIC_BUCKET_ADDRESS
)

for s in "${SECRETS[@]}"; do
  val="${VARS[$s]:-}"
  if [ -z "$val" ]; then
    echo "⏭️  跳过空值: $s"
    continue
  fi
  echo "➕ 设置 $s ..."
  gh secret set "$s" -b "$val" -R "$REPO"
done

echo ""
echo "✅ Secrets 写入完成。"
echo "👉 下一步：GitHub 仓库 → Actions → Deploy Worker → Run workflow → 选 main → Run"
