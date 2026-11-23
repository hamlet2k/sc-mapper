import { mountDeviceList } from "./views/DeviceList";
import { mountMappingView } from "./views/MappingView";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("missing #app");
}

app.innerHTML = `
  <h1>SC Tauri</h1>
  <section id="devices"></section>
  <section id="mapping"></section>
`;

const devices = document.querySelector<HTMLElement>("#devices");
const mapping = document.querySelector<HTMLElement>("#mapping");
if (!devices || !mapping) {
  throw new Error("missing view roots");
}

mountDeviceList(devices);
mountMappingView(mapping);
