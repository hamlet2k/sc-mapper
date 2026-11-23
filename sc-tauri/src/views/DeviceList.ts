import { loadProfile } from "../api";

/** Placeholder device list view. No enumeration yet. */
export function mountDeviceList(root: HTMLElement): void {
  root.innerHTML = "<h2>Devices</h2><p>No devices (stub).</p>";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Load profile";
  button.addEventListener("click", () => {
    void loadProfile();
  });
  root.append(button);
}
