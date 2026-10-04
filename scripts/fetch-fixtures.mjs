// Downloads real Star Citizen keybinding files (pinned commits) into .tmp/fixtures/ for the device-settings round-trip tests.
// They are not committed (third-party files); `npm run test:unit` uses them when present.
//   node scripts/fetch-fixtures.mjs
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const SCD = 'https://raw.githubusercontent.com/x3nnnonn/StarCitizenDiff/908b76a0485036161ba700d369c7d92aca1c847b/P4kContents/Data/Libs/Config/Mappings';
const OSI = 'https://raw.githubusercontent.com/Osiris-DevWorks/sc-profile-editor/63f1bb4ef8c1517a4118990d9da8dd31c98dbf40/example-profiles';
export const FIXTURES = {
  // shipped with the game (4.10 LIVE, Data/Libs/Config/Mappings)
  'game_layout_vkb_gnx_prem_dual.xml': `${SCD}/layout_vkb_gnx_prem_dual.xml`,
  'game_layout_t16000m_twcs.xml': `${SCD}/layout_t16000m_twcs.xml`,
  'game_layout_hotas_warthog.xml': `${SCD}/layout_hotas_warthog.xml`,
  // written by the game for players (exported layouts / actionmaps.xml)
  'osiris_layout_VirpilOCT25_exported.xml': `${OSI}/layout_VirpilOCT25_exported.xml`,
  'osiris_layout_DualVPCAlphas_exported.xml': `${OSI}/layout_DualVPCAlphas_exported.xml`,
  'osiris_layout_HOTAS_exported.xml': `${OSI}/layout_HOTAS_exported.xml`,
  'philchuang_actionmaps.3.17.4.xml': 'https://raw.githubusercontent.com/philchuang/spacesimcontrolmanager/b557af0801291a4443f9b7adb544a6cf26b472ef/samples/SC/actionmaps.3.17.4.xml',
  'subs_actionmaps_ENH_NXT_481_LIVE.xml': 'https://raw.githubusercontent.com/Subs-Curated-Bindings/VKB-Dual-GladiatorNXT/ddbdfdd207056e5d8d74d1f43d780247b425ba22/.Assets/actionmaps_ENH_NXT_481_LIVE.xml',
};
const dir = new URL('../.tmp/fixtures/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const [name, url] of Object.entries(FIXTURES)) {
  const dest = new URL(name, dir);
  if (existsSync(dest)) continue;
  const res = await fetch(url);
  if (!res.ok) { console.warn(`[fixtures] ${res.status} ${url}`); continue; }
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  console.log(`[fixtures] ${name}`);
}
