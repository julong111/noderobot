#!/bin/bash

# 定义日志函数
function log_info() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] $1"
}

function log_error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] $1"
}

log_info "脚本开始执行..."

# 如果存在 .env 文件，则加载它
if [ -f .env ]; then
  log_info "检测到 .env 文件，正在加载..."
  # 使用 set -a 来导出所有从 .env 加载的变量，使其对子进程可用
  set -a
  source .env
  set +a
else
  log_info "未检测到 .env 文件，跳过加载。"
fi

# 如果提供了命令行参数，则将其作为 GITHUB_TOKEN
if [ -n "$1" ]; then
  log_info "检测到命令行参数，将使用参数作为 GITHUB_TOKEN。"
  GITHUB_TOKEN="$1"
fi

# 检查 GITHUB_TOKEN 环境变量是否设置
if [ -z "$GITHUB_TOKEN" ]; then
  log_error "未提供 GitHub Token。"
  echo "用法: $0 [token]"
  echo "或者设置环境变量 GITHUB_TOKEN，或在 .env 文件中配置。"
  exit 1
fi

owner="julong111"
repo="noderobot"
per_page=100

log_info "目标仓库: $owner/$repo"
log_info "正在获取 workflow runs 列表..."

# 创建临时文件存储所有 runs
runs_file=$(mktemp)

# 获取第一页
page=1
response=$(curl -s -H "Authorization: token $GITHUB_TOKEN" \
    "https://api.github.com/repos/$owner/$repo/actions/runs?per_page=$per_page&page=$page")

# 检查 API 响应是否包含 workflow_runs
if ! echo "$response" | jq -e '.workflow_runs' > /dev/null; then
  log_error "API 请求失败或未返回 workflow_runs。"
  log_error "响应内容: $response"
  rm "$runs_file"
  exit 1
fi

# 获取总数
total_count=$(echo "$response" | jq '.total_count')
log_info "API 请求成功，总记录数: $total_count"

if [ "$total_count" -eq 0 ]; then
  log_info "没有运行记录。脚本结束。"
  rm "$runs_file"
  exit 0
fi

# 保存第一页数据 (id, workflow_id, updated_at)
echo "$response" | jq -r '.workflow_runs[] | "\(.id) \(.workflow_id) \(.updated_at)"' >> "$runs_file"

# 计算总页数
total_pages=$(( (total_count + per_page - 1) / per_page ))
log_info "总页数: $total_pages"

# 获取剩余页数
for (( p=2; p<=total_pages; p++ )); do
  log_info "正在获取第 $p / $total_pages 页..."
  response=$(curl -s -H "Authorization: token $GITHUB_TOKEN" \
      "https://api.github.com/repos/$owner/$repo/actions/runs?per_page=$per_page&page=$p")
  echo "$response" | jq -r '.workflow_runs[] | "\(.id) \(.workflow_id) \(.updated_at)"' >> "$runs_file"
done

log_info "所有记录获取完毕，正在按 updated_at 排序并解析需要删除的记录..."

# 按 updated_at 降序排序 (最新的在前面)
sort -k3 -r "$runs_file" -o "$runs_file"

# 解析需要删除的 ID
seen_workflows=" "
ids_to_delete=()

while read -r run_id workflow_id updated_at; do
  if [[ "$seen_workflows" == *" $workflow_id "* ]]; then
    ids_to_delete+=("$run_id")
  else
    seen_workflows+="$workflow_id "
    log_info "保留 Workflow $workflow_id 的最新记录 (ID: $run_id, Updated: $updated_at)"
  fi
done < "$runs_file"

delete_count=${#ids_to_delete[@]}
log_info "解析完成，共有 $delete_count 条记录等待删除。"

# 批量删除
for run_id in "${ids_to_delete[@]}"; do
  log_info "正在删除 Run ID: $run_id ..."
  curl -s -X DELETE -H "Authorization: token $GITHUB_TOKEN" \
    "https://api.github.com/repos/$owner/$repo/actions/runs/$run_id"
done

rm "$runs_file"
log_info "清理完成。"