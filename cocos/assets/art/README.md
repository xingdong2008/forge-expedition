# 图片交接目录

请把原创图片放在本目录；程序目前使用占位绘制，尚未绑定任何外部图片。建议按下列文件名和尺寸交付透明 PNG，保持统一像素比例：

| 文件 | 建议画布 | 用途 |
| --- | --- | --- |
| `hero-idle.png`、`hero-run.png` | 每帧 32×32 | 主角待机、四方向移动 |
| `enemy-grunt.png`、`enemy-ranger.png`、`enemy-charger.png`、`enemy-elite.png` | 每帧 32×32 | 四类普通怪物 |
| `boss.png` | 每帧 96×96 | 最终 Boss |
| `arena-ground.png`、`arena-wall.png`、`arena-props.png` | 图块 32×32 | 灰烬庭院地面、墙和装饰 |
| `projectile-player.png`、`projectile-enemy.png` | 16×16 | 弹体 |
| `icon-weapon.png`、`icon-armor.png`、`icon-hp.png`、`icon-mp.png` | 32×32 | 装备和药剂 UI |
| `icon-luck.png`、`icon-quality.png`、`icon-ore.png`、`icon-hide.png` | 32×32 | 锻造与材料 UI |

动画表请同时注明每行帧数、帧率、方向顺序。图片可以先逐项提供；接入时替换 `src/render.ts` 和 `cocos/assets/scripts/ForgeTideBootstrap.ts` 的占位绘制，不影响 `game/` 规则或存档结构。
