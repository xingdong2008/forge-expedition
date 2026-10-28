import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve('cocos/build/web-mobile');
function jsonIn(directory, prefix) {
  const names = readdirSync(directory).filter(name => name.startsWith(prefix) && name.endsWith('.json'));
  if (names.length !== 1) throw new Error(`Expected one ${prefix} JSON in ${directory}; rebuild into a clean output folder.`);
  return JSON.parse(readFileSync(resolve(directory, names[0]), 'utf8'));
}
const settings = jsonIn(resolve(root, 'src'), 'settings');
const main = jsonIn(resolve(root, 'assets/main'), 'config');
const internal = jsonIn(resolve(root, 'assets/internal'), 'config');
if (!Object.keys(main.scenes ?? {}).some(path => path.endsWith('ForgeTide.scene'))) {
  throw new Error('Cocos output is missing ForgeTide.scene. Open the project in Creator, wait for asset import, and rebuild. CLI exit 36 alone is not sufficient.');
}
if (!internal.uuids?.length) throw new Error('Cocos built-in resources are missing. Reimport in Creator before rebuilding.');
if (settings.rendering.effectSettingsPath && statSync(resolve(root, settings.rendering.effectSettingsPath)).size <= 34) {
  throw new Error('Cocos shader data is empty; the game cannot render.');
}
console.log('Cocos build contains the startup scene, built-in resources and shader data. Browser startup verification is still required.');
