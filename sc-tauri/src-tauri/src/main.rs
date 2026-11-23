//! Desktop entry point for the SC Tauri skeleton.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod profiles;
mod usb;
mod xml;

#[tauri::command]
fn load_profile() -> Result<String, String> {
    let _devices = usb::list_devices();
    let _maps = xml::read_actionmaps("")?;
    profiles::drop_profile()
}

#[tauri::command]
fn swap_profile() -> Result<String, String> {
    xml::write_actionmaps("", "")?;
    profiles::console_command("")
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![load_profile, swap_profile])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
