#!/bin/bash

# 如果存在 .env 文件，则加载它
if [ -f .env ]; then
  # 使用 set -a 来导出所有从 .env 加载的变量，使其对子进程可用
  set -a
  source .env
  set +a
fi

# 如果提供了命令行参数，则将其作为 GITHUB_TOKEN
if [ -n "$1" ]; then
  GITHUB_TOKEN="$1"
fi

# 检查 GITHUB_TOKEN 环境变量是否设置
if [ -z "$GITHUB_TOKEN" ]; then
  echo "错误: 未提供 GitHub Token。"
  echo "用法: $0 [token]"
  echo "或者设置环境变量 GITHUB_TOKEN，或在 .env 文件中配置。"
  exit 1
fi

owner="julong111"
repo="noderobot"

echo "正在获取 workflow runs..."
response=$(curl -s -H "Authorization: token $GITHUB_TOKEN" \
    "https://api.github.com/repos/$owner/$repo/actions/runs?per_page=200")

# 检查 API 响应是否包含 workflow_runs
if ! echo "$response" | jq -e '.workflow_runs' > /dev/null; then
  echo "错误: API 请求失败或未返回 workflow_runs。"
  echo "响应内容: $response"
  exit 1
fi

# 获取除最近一条外的所有 workflow run 的 ID
runs=$(echo "$response" | jq '.workflow_runs[1:][].id')

# 批量删除
for run_id in $runs; do
  echo "Deleting run: $run_id"
  curl -X DELETE -H "Authorization: token $GITHUB_TOKEN" \
    "https://api.github.com/repos/$owner/$repo/actions/runs/$run_id"
  echo ""
done