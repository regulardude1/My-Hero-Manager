use crate::util::get_data_dir;
use crate::install::extract_and_install_mod;
use std::io::Write;

/// Open a visible Tauri webview to allow the user to log into Nexus Mods.
#[tauri::command]
pub async fn open_nexus_login(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;

    // Close existing login window if any
    if let Some(existing) = app.get_window("nexus_login") {
        let _ = existing.close();
        std::thread::sleep(std::time::Duration::from_millis(200));
    }

    let url_str = "https://users.nexusmods.com/auth/sign_in";

    let window = tauri::WindowBuilder::new(
        &app,
        "nexus_login",
    )
    .title("Login to Nexus Mods")
    .inner_size(800.0, 700.0)
    .center()
    .build()
    .map_err(|e| format!("Failed to create window: {}", e))?;

    // Detect a successful sign-in (site shows a Sign Out control on account pages)
    // and signal completion via a special local URL.
    let signed_in_detect_script = r#"
        (function () {
            const isAuthPage = () => /auth\/sign_in|users\/register/i.test(window.location.href);
            const hasSignOut = () => {
                const els = document.querySelectorAll('a, button, [role="button"]');
                for (const el of els) {
                    const t = (el.innerText || el.textContent || '').toLowerCase().trim();
                    const href = (el.getAttribute('href') || '').toLowerCase();
                    if (t === 'sign out' || t === 'signout' || href.includes('signout')) return true;
                }
                return false;
            };
            let n = 0;
            const iv = setInterval(() => {
                n++;
                try {
                    if (!isAuthPage() && hasSignOut()) {
                        clearInterval(iv);
                        window.location.href = "http://nexus-login-done.local/signed-in";
                        return;
                    }
                } catch (e) { /* keep watching */ }
                if (n > 120) clearInterval(iv); // ~2 minute cap
            }, 1000);
        })();
    "#;

    let app_nav = app.clone();
    let webview = tauri::webview::WebviewBuilder::new(
        "nexus_login_webview",
        tauri::WebviewUrl::External(
            url_str.parse().map_err(|_| "Invalid URL".to_string())?
        ),
    )
    .initialization_script(signed_in_detect_script)
    .data_directory(nexus_profile_dir())
    .on_navigation(move |url| {
        if url.as_str().contains("nexus-login-done.local") {
            use tauri::Emitter;
            let _ = app_nav.emit("nexus-signed-in", serde_json::json!({}));
            if let Some(w) = app_nav.get_window("nexus_login") {
                let _ = w.close();
            }
            return false;
        }
        true
    })
    .auto_resize();

    window.add_child(
        webview,
        tauri::LogicalPosition::new(0, 0),
        window.inner_size().map_err(|e| format!("{}", e))?,
    ).map_err(|e| format!("Failed to add webview: {}", e))?;

    Ok("opened".to_string())
}

/// Append a line to the sign-out diagnostic log (LocalAppData/MyHeroManager).
fn log_signout(line: &str) {
    let path = get_data_dir().join("nexus_signout.log");
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let content = format!("[{}] {}\n", stamp, line);
    let _ = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .and_then(|mut f| f.write_all(content.as_bytes()));
}

/// Dedicated browser profile for the Nexus popups (login + download).
/// The Nexus web session lives only inside this folder, so signing out can be
/// done by deleting it — guaranteed clean, and it never touches the app's own
/// saved data (theme, game path, collections, ...).
fn nexus_profile_dir() -> std::path::PathBuf {
    let dir = get_data_dir().join("nexus-web-profile");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// Sign out of Nexus Mods: close the Nexus popups and delete the dedicated
/// browser profile that holds the Nexus web session. Deleting the profile
/// guarantees the session (including HttpOnly cookies) is gone, and it never
/// touches the app's own saved data (theme, game path, collections, ...).
#[tauri::command]
pub async fn nexus_signout(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Emitter;
    use tauri::Manager;

    log_signout("signout requested (profile delete)");

    // Close the Nexus popups first so they stop using the profile.
    for name in ["nexus_login", "nexus_dl"] {
        if let Some(w) = app.get_window(name) {
            let _ = w.close();
        }
    }

    let profile = nexus_profile_dir();
    log_signout(&format!("profile dir = {}", profile.display()));

    // WebView2 may briefly lock the folder right after the windows close,
    // so retry the deletion a few times.
    let mut last_err = String::from("not attempted");
    let mut deleted = false;
    for attempt in 0..10 {
        if !profile.exists() {
            deleted = true;
            break;
        }
        match std::fs::remove_dir_all(&profile) {
            Ok(()) => {
                deleted = true;
                break;
            }
            Err(e) => {
                last_err = e.to_string();
                log_signout(&format!(
                    "delete attempt {} failed: {}",
                    attempt + 1,
                    last_err
                ));
                std::thread::sleep(std::time::Duration::from_millis(300));
            }
        }
    }

    if deleted {
        log_signout("signout complete: profile deleted");
        let _ = app.emit("nexus-signed-out", serde_json::json!({}));
        Ok("signed out".to_string())
    } else {
        log_signout(&format!("signout FAILED: {}", last_err));
        let _ = app.emit(
            "nexus-signout-failed",
            serde_json::json!({ "error": last_err }),
        );
        Err(format!("Could not delete the Nexus profile: {}", last_err))
    }
}

/// Open a Tauri webview popup to the Nexus Mods files page.
/// The webview's on_download handler intercepts the download and installs the mod directly.
#[tauri::command]
pub async fn open_nexus_download(
    app: tauri::AppHandle,
    mod_id: u32,
    file_id: u32,
    file_name: String,
    mod_title: String,
    mod_author: String,
) -> Result<String, String> {
    use tauri::Manager;
    use tauri::Emitter;

    // Close existing download window if any
    if let Some(existing) = app.get_window("nexus_dl") {
        let _ = existing.close();
        // Brief pause to let it fully close
        std::thread::sleep(std::time::Duration::from_millis(200));
    }

    let url_str = format!(
        "https://www.nexusmods.com/myheroultrarumble/mods/{}?tab=files&file_id={}",
        mod_id, file_id
    );

    let temp_dir = get_data_dir().join("cache").join("downloads");
    let _ = std::fs::create_dir_all(&temp_dir);
    let temp_dir_c = temp_dir.clone();

    let fn_c = file_name.clone();
    let title_c = mod_title.clone();
    let author_c = mod_author.clone();

    // Create a hidden Window (will be shown if Cloudflare challenges us)
    let window = tauri::WindowBuilder::new(
        &app,
        "nexus_dl",
    )
    .title("Nexus Mods Download")
    .inner_size(1000.0, 800.0)
    .center()
    .visible(false)
    .build()
    .map_err(|e| format!("Failed to create window: {}", e))?;

    let auto_download_script = r#"
        window.addEventListener('DOMContentLoaded', () => {
            let attempt = 0;
            let cfShown = false;
            const checkInterval = setInterval(() => {
                attempt++;
                
                try {
                    // Check if we are being challenged by Cloudflare
                    if (!cfShown && (document.title.includes('Just a moment') || document.querySelector('.cf-turnstile') || document.querySelector('#challenge-running'))) {
                        cfShown = true;
                        window.location.href = "http://nexus-dl-error.local/cloudflare";
                    }

                    // Check if we are being prompted to log in
                    const loginLink = document.querySelector('a[href*="/auth/sign_in"], a[href*="users/register"]');
                    if (loginLink) {
                        clearInterval(checkInterval);
                        window.location.href = "http://nexus-dl-error.local/login-required";
                        return;
                    }

                    // Recursively search through standard DOM and all Shadow DOMs
                    function findAndClick(root) {
                        const allNodes = root.querySelectorAll('*');
                        for (let el of allNodes) {
                            if (el.shadowRoot) {
                                let res = findAndClick(el.shadowRoot);
                                if (res) return res;
                            }
                            const tag = el.tagName ? el.tagName.toUpperCase() : '';
                            if (tag === 'BUTTON' || tag === 'A' || el.getAttribute('role') === 'button') {
                                const text = (el.innerText || el.textContent || '').toLowerCase().trim();
                                if (text === 'continue' || text === 'view adult content' || text.includes('adult content')) {
                                    el.click();
                                    return "CONTINUE";
                                }
                                if (text.includes('slow download') || text.includes('slow') || el.id === 'slowDownloadButton') {
                                    console.log('Found button inside shadow DOM!', el);
                                    el.click();
                                    return "DOWNLOADED";
                                }
                            }
                        }
                        return null;
                    }

                    let res = findAndClick(document);
                    if (res === "DOWNLOADED") {
                        clearInterval(checkInterval);
                        return;
                    }
                } catch (e) {
                    console.error(e);
                }
                
                if (attempt > 60) {
                    // Give up after 60 seconds
                    clearInterval(checkInterval);
                    window.location.href = "http://nexus-dl-error.local/not-found";
                }
            }, 1000);
        });
    "#;

    let app_nav = app.clone();
    let fn_c2 = file_name.clone();
    // Create a WebviewBuilder with on_download handler and initialization script
    let webview = tauri::webview::WebviewBuilder::new(
        "nexus_dl_webview",
        tauri::WebviewUrl::External(
            url_str.parse().map_err(|_| "Invalid URL".to_string())?
        ),
    )
    .initialization_script(auto_download_script)
    .data_directory(nexus_profile_dir())
    .on_navigation(move |url| {
        let url_str = url.as_str();
        if url_str.contains("nexus-dl-error.local") {
            if url_str.contains("cloudflare") {
                if let Some(w) = app_nav.get_window("nexus_dl") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
                return false;
            }

            let msg = if url_str.contains("login-required") {
                "LOGIN_REQUIRED"
            } else {
                "NOT_FOUND"
            };
            let _ = app_nav.emit("nexus-download-complete", serde_json::json!({
                "success": false,
                "message": msg,
                "fileName": fn_c2.as_str(),
            }));
            if let Some(win) = app_nav.get_window("nexus_dl") {
                let _ = win.close();
            }
            return false;
        }
        true
    })
    .auto_resize()
    .on_download(move |webview, event| {
        match event {
            tauri::webview::DownloadEvent::Requested { url: _dl_url, destination } => {
                let _ = webview.emit("nexus-download-status", serde_json::json!({
                    "message": "Downloading...",
                    "fileName": fn_c.as_str(),
                }));
                // Route the download to our temp cache folder
                *destination = temp_dir_c.join(&fn_c);
                true // allow the download
            }
            tauri::webview::DownloadEvent::Finished { url: _, path, success } => {
                if success {
                    if let Some(ref p) = path {
                        // Install the mod from the downloaded temp file
                        let msg = match extract_and_install_mod(p, &title_c, &author_c, "Nexus", None) {
                            Ok(s) => s,
                            Err(e) => e,
                        };
                        // Emit event so the React frontend knows the download finished
                        let _ = webview.emit("nexus-download-complete", serde_json::json!({
                            "success": true,
                            "message": msg,
                            "fileName": fn_c.as_str(),
                        }));
                    }
                    // Close the popup window
                    let handle = webview.app_handle().clone();
                    if let Some(win) = handle.get_window("nexus_dl") {
                        let _ = win.close();
                    }
                }
                true
            }
            _ => false,
        }
    });

    window.add_child(
        webview,
        tauri::LogicalPosition::new(0, 0),
        window.inner_size().map_err(|e| format!("{}", e))?,
    ).map_err(|e| format!("Failed to add webview: {}", e))?;

    Ok("opened".to_string())
}
