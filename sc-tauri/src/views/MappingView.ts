import { swapProfile } from "../api";

/** Placeholder mapping view. No mapping logic yet. */
export function mountMappingView(root: HTMLElement): void {
  root.innerHTML = "<h2>Mappings</h2><p>No mappings (stub).</p>";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Swap profile";
  button.addEventListener("click", () => {
    void swapProfile();
  });
  root.append(button);
}
