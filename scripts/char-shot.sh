#!/bin/sh
# 生成角色：sh scripts/char-shot.sh hero
T=/c/ashenbell-tools; cd $T
U1="ual/x/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb"; U2=$(find ual/x2 -name 'UAL2_Standard.glb')
blender-4.2.3-windows-x64/blender.exe -b --addons bl_ext.user_default.mpfb -P "C:/Users/ngant/OneDrive/桌面/my-first-website/ashenbell/scripts/blender/make_character.py" -- $1 C:/ashenbell-tools/out/$1.glb C:/ashenbell-tools/assets "$U1" "$U2" > out/$1.log 2>&1
grep -E 'DONE|Traceback|Error:' out/$1.log | tail -3 | cut -c1-160
cp out/$1.glb "/c/Users/ngant/OneDrive/桌面/my-first-website/ashenbell/public/assets/models/$1.glb"
