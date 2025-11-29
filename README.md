程序处理流程

从freenodes/clashfree下载最新的clash配置到本地source目录freenodes-clashfree-original.yml。  因为这个里面会有错误的节点，需要过滤。

执行merge合并
读取sources.json的配置，读取过滤后的节点和其它节点来源。
清洗合并并输出到merge.yml   如果没有更新的-采用hash检测，则停止输出

执行clash_to_v2rayn.py 将merge.yml转为v2rayn订阅输出到v2rayn.txt


delete_workflow_runs.sh  清理workflow记录脚本

ClashParty

JuACL4SSR
https://raw.githubusercontent.com/julong111/noderobot/refs/heads/test/config/JuACL4SSR.yaml


freenodes-clashfree-julong
https://raw.githubusercontent.com/julong111/noderobot/refs/heads/test/s/freenodes-clashfree.yml


go4sharing-github
https://raw.githubusercontent.com/go4sharing/sub/refs/heads/main/sub.yaml


NoMoreWalls-proxy
https://ghproxy.cfd/https://raw.githubusercontent.com/peasoft/NoMoreWalls/refs/heads/master/list.meta.yml


python src/merge.py --sources src/dev-sources.json --output s/dev-merge.yml


go4sharing-proxy
https://ghproxy.cfd/https://raw.githubusercontent.com/go4sharing/sub/refs/heads/main/sub.yaml