#!/bin/zsh
cd -- "${0:A:h}"
open -a /Applications/CocosCreator.app --args --project "$PWD/cocos"
