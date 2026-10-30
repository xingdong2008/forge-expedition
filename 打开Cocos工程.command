#!/bin/zsh
cd -- "${0:A:h}"
creator_app='/Applications/Cocos/Creator/3.8.8/CocosCreator.app'
if [[ ! -d "$creator_app" ]]; then
  creator_app='/Applications/CocosCreator.app'
fi
if [[ ! -d "$creator_app" ]]; then
  print '未找到 Cocos Creator 3.8.8，请通过 Cocos Dashboard 打开本目录中的 cocos 工程。'
  read '?按回车关闭…'
  exit 1
fi
open -a "$creator_app" --args --project "$PWD/cocos"
