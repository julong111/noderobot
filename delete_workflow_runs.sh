#!/bin/bash

# 如果存在 .env 文件，则加载它
if [ -f .env ]; then
  # 使用 set -a 来导出所有从 .env 加载的变量，使其对子进程可用
  set -a
  source .env
  set +a
fi

# 检查 GITHUB_TOKEN 环境变量是否设置
if [ -z "$GITHUB_TOKEN" ]; then
  echo "错误: 环境变量 GITHUB_TOKEN 未设置。"
  echo "请在.env文件中设置您的 GitHub Token 后再运行脚本。"
  echo "例如: export GITHUB_TOKEN='your_token_here'"
  exit 1
fi

owner="julong111"
repo="noderobot"

# 获取所有 workflow run 的 ID
runs=$(curl -s -H "Authorization: token $GITHUB_TOKEN" \
    "https://api.github.com/repos/$owner/$repo/actions/runs?per_page=200" | jq '.workflow_runs[].id')

# 批量删除
for run_id in $runs; do
  echo "Deleting run: $run_id"
  curl -X DELETE -H "Authorization: token $GITHUB_TOKEN" \
    "https://api.github.com/repos/$owner/$repo/actions/runs/$run_id"
  echo ""
done