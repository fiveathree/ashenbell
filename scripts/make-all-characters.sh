#!/bin/sh
# 生成全部角色（要先有 C:/ashenbell-tools 工具）：sh scripts/make-all-characters.sh [角色...]
cd "$(dirname "$0")/.."
for r in ${@:-hero ghoul drowned brute skeleton archer monk abbot npc_ge npc_dala npc_herb}; do echo "== $r"; sh scripts/char-shot.sh $r; done
