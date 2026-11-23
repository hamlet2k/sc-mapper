# sc-tauri

Bare Tauri 2 skeleton for a future desktop shell of SC Mapper.

This is a frame only. The Rust modules (`usb`, `xml`, `profiles`) and the frontend views are empty stubs with the right names and wiring so the project can compile. There is no USB enumeration, XML read/write, or profile logic yet.

Do not treat this as a runnable app. The `dev` / `tauri` scripts are declared for later use; they have not been run as part of scaffolding this repo.

The frontend is plain TypeScript + Vite. The Tauri scripts in `package.json` are declared but should not be started unless you are ready to run the app.

Compile-only checks used while scaffolding: `npx tsc --noEmit` and `cargo check` in `src-tauri`. Current Tauri 2 needs a recent Rust toolchain (rustup stable, 1.90+). A `rust-toolchain.toml` pins this repo to stable.
