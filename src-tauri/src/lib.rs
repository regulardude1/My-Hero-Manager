// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod discord;
mod install;
mod mods;
mod nexus;
mod skin;
mod util;

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{tray::TrayIconBuilder, menu::{Menu, MenuItem}, Manager, State};

use crate::util::{DATA_DIR, TOOLS_DIR};

struct AppState {
    minimize_to_tray: AtomicBool,
}

#[tauri::command]
fn set_minimize_to_tray(enabled: bool, state: State<'_, AppState>) {
    state.minimize_to_tray.store(enabled, Ordering::Relaxed);
}

fn init_dirs(app: &tauri::App) {
    use tauri::Manager;
    #[cfg(target_os = "windows")]
    let data_dir = {
        let mut d = std::path::PathBuf::from(std::env::var("LOCALAPPDATA").unwrap_or_else(|_| "C:\temp".to_string()));
        d.push("MyHeroManager");
        d
    };
    #[cfg(not(target_os = "windows"))]
    let data_dir = std::env::temp_dir().join("MyHeroManager");

    let _ = std::fs::create_dir_all(&data_dir);
    let _ = DATA_DIR.set(data_dir);

    if let Ok(res_dir) = app.path().resource_dir() {
        if res_dir.join("tools").exists() {
            let _ = TOOLS_DIR.set(res_dir.join("tools"));
            return;
        }
    }

    let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    if cwd.join("tools").exists() {
        let _ = TOOLS_DIR.set(cwd.join("tools"));
    } else if let Some(parent) = cwd.parent() {
        if parent.join("tools").exists() {
            let _ = TOOLS_DIR.set(parent.join("tools"));
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            minimize_to_tray: AtomicBool::new(false),
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<AppState>();
                if state.minimize_to_tray.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            init_dirs(app);
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            mods::read_image_base64,
            mods::launch_game,
            mods::deploy_mods,
            mods::get_local_mods,
            mods::extract_mod_preview,
            mods::get_mhur_paks_path,
            discord::save_discord_token,
            discord::load_discord_token,
            discord::clear_discord_token,
            discord::validate_discord_token,
            discord::fetch_discord_mods,
            discord::fetch_discord_thread,
            discord::fetch_thread_messages,
            discord::download_discord_mod,
            nexus::open_nexus_download,
            nexus::open_nexus_login,
            nexus::nexus_signout,
            install::download_url_mod,
            discord::open_discord_login,
            install::install_local_mods,
            mods::rename_mod,
            mods::delete_mod,
            mods::open_mod_folder,
            mods::open_path,
            skin::swap_skin_slot,
            skin::get_mod_file_list,
            skin::get_costumes,
            set_minimize_to_tray,
            mods::restore_to_default,
            mods::split_mod,
            mods::merge_mods,
            mods::get_characters,
            mods::clear_mod_cache,
            install::prepare_import,
            mods::save_folders_json,
            mods::load_folders_json,
            mods::save_collections_json,
            mods::load_collections_json,
            util::check_path_exists,
            util::create_dir_if_not_exists
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
