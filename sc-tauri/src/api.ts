import { invoke } from "@tauri-apps/api/core";

/** Thin wrapper around the Rust `load_profile` command. */
export function loadProfile(): Promise<string> {
  return invoke("load_profile");
}

/** Thin wrapper around the Rust `swap_profile` command. */
export function swapProfile(): Promise<string> {
  return invoke("swap_profile");
}
