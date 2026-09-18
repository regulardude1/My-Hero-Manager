use std::collections::HashMap;
use std::fs;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use crate::util::{get_data_dir, sanitize_folder_name};
use crate::install::extract_and_install_mod;

// XOR obfuscation key — keeps the token from being stored in plain text
pub const TOKEN_XOR_KEY: &[u8] = b"PlusUltraModManager2024!";

pub fn xor_bytes(data: &[u8]) -> Vec<u8> {
    data.iter()
        .enumerate()
        .map(|(i, b)| b ^ TOKEN_XOR_KEY[i % TOKEN_XOR_KEY.len()])
        .collect()
}

pub fn get_cache_dir() -> std::path::PathBuf {
    get_data_dir().join("cache")
}

/// Save a Discord token to disk, XOR-obfuscated then base64-encoded.
#[tauri::command]
pub fn save_discord_token(token: String) -> Result<(), String> {
    let cache_dir = get_cache_dir();
    let _ = fs::create_dir_all(&cache_dir);
    let obfuscated = xor_bytes(token.as_bytes());
    let encoded = BASE64.encode(&obfuscated);
    fs::write(cache_dir.join("discord_token.enc"), encoded)
        .map_err(|e| format!("Failed to save token: {}", e))
}

/// Load and decode the Discord token from disk. Returns empty string if not found.
#[tauri::command]
pub fn load_discord_token() -> Result<String, String> {
    let token_path = get_cache_dir().join("discord_token.enc");
    if !token_path.exists() {
        // Migrate from old plaintext file if it exists
        let old_path = get_cache_dir().join("discord_token.txt");
        if old_path.exists() {
            if let Ok(old_token) = fs::read_to_string(&old_path) {
                let token = old_token.trim().to_string();
                if !token.is_empty() {
                    // Re-save encrypted and delete old file
                    let obfuscated = xor_bytes(token.as_bytes());
                    let encoded = BASE64.encode(&obfuscated);
                    let _ = fs::write(&token_path, encoded);
                    let _ = fs::remove_file(&old_path);
                    return Ok(token);
                }
            }
        }
        return Ok(String::new());
    }
    let encoded = fs::read_to_string(&token_path).map_err(|e| format!("Read error: {}", e))?;
    let decoded = BASE64.decode(encoded.trim())
        .map_err(|e| format!("Base64 decode error: {}", e))?;
    let token_bytes = xor_bytes(&decoded);
    String::from_utf8(token_bytes).map_err(|e| format!("UTF-8 decode error: {}", e))
}

/// Clear the saved Discord token from disk.
#[tauri::command]
pub fn clear_discord_token() -> Result<(), String> {
    let token_path = get_cache_dir().join("discord_token.enc");
    if token_path.exists() {
        fs::remove_file(&token_path).map_err(|e| format!("Failed to remove token: {}", e))?;
    }
    Ok(())
}

/// Validate a Discord token and return the user's username.
#[tauri::command]
pub async fn validate_discord_token(token: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    
    // 1. Fetch user profile
    let res = client
        .get("https://discord.com/api/v9/users/@me")
        .header("Authorization", &token)
        .header("Content-Type", "application/json")
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Invalid token (HTTP {})", res.status()));
    }
    
    let user: serde_json::Value = res.json().await.map_err(|e| format!("JSON parse error: {}", e))?;
    let username = user
        .get("global_name")
        .or_else(|| user.get("username"))
        .and_then(|v| v.as_str())
        .unwrap_or("User")
        .to_string();

    // 2. Fetch user guilds
    let guilds_res = client
        .get("https://discord.com/api/v9/users/@me/guilds")
        .header("Authorization", &token)
        .header("Content-Type", "application/json")
        .send()
        .await
        .map_err(|e| format!("Guilds request failed: {}", e))?;

    let mut user_guilds: Vec<serde_json::Value> = Vec::new();
    if guilds_res.status().is_success() {
        if let Ok(guilds) = guilds_res.json::<Vec<serde_json::Value>>().await {
            user_guilds = guilds;
        } else {
            println!("[validate_discord_token] Failed to parse guilds JSON");
        }
    } else {
        println!("[validate_discord_token] Guilds request failed with status: {}", guilds_res.status());
    }

    println!("[validate_discord_token] Username: {}, Found {} guilds", username, user_guilds.len());

    Ok(serde_json::json!({
        "username": username,
        "guilds": user_guilds
    }))
}

/// Fetch Discord mod threads from the Endeavor Headquarters server.
#[tauri::command]
pub async fn fetch_discord_mods(token: String, guild_id: String, offset: u32, nsfw: bool) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let headers_map = {
        let mut m = reqwest::header::HeaderMap::new();
        m.insert("Authorization", token.parse().map_err(|e: reqwest::header::InvalidHeaderValue| e.to_string())?);
        m.insert("Content-Type", "application/json".parse().unwrap());
        m
    };

    // 2. Get channels and find mod_archive forum channels
    let channels_res = client
        .get(format!("https://discord.com/api/v9/guilds/{}/channels", guild_id))
        .headers(headers_map.clone())
        .send()
        .await
        .map_err(|e| format!("Channels request failed: {}", e))?;

    if !channels_res.status().is_success() {
        return Err(format!("Failed to fetch channels (HTTP {})", channels_res.status()));
    }

    let channels: Vec<serde_json::Value> = channels_res.json().await.map_err(|e| e.to_string())?;

    let mut sfw_channel_ids: Vec<String> = Vec::new();
    let mut nsfw_channel_ids: Vec<String> = Vec::new();
    let mut channel_tags: HashMap<String, HashMap<String, String>> = HashMap::new();

    for c in &channels {
        let cname = c.get("name").and_then(|n| n.as_str()).unwrap_or("").to_lowercase();
        let cid = c.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if cid.is_empty() { continue; }

        let is_momo = guild_id == "1508333307354415245";
        let is_target = if is_momo {
            cid == "1508656874600267926"
        } else {
            cname.contains("mod_archive") || cid == "1452026167489200351"
        };

        if is_target {
            let is_nsfw = c.get("nsfw").and_then(|v| v.as_bool()).unwrap_or(false)
                || cname.contains("18+") || cname.contains("nsfw") || cname.contains("\u{1f51e}")
                || cid == "1452026167489200351";

            if is_nsfw {
                nsfw_channel_ids.push(cid.clone());
            } else {
                sfw_channel_ids.push(cid.clone());
            }

            if let Some(tags) = c.get("available_tags").and_then(|t| t.as_array()) {
                let mut tag_map = HashMap::new();
                for tag in tags {
                    let tid = tag.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let tname = tag.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    if !tid.is_empty() {
                        tag_map.insert(tid, tname);
                    }
                }
                channel_tags.insert(cid, tag_map);
            }
        }
    }

    let all_channel_ids: Vec<String> = sfw_channel_ids.iter().chain(nsfw_channel_ids.iter()).cloned().collect();
    if all_channel_ids.is_empty() {
        let available: Vec<String> = channels.iter().filter_map(|c| c.get("name").and_then(|v| v.as_str()).map(|s| s.to_string())).collect();
        return Err(format!("No target channels found. Target was 1508656874600267926. Found: {}", available.join(", ")));
    }

    let channel_id = if nsfw {
        nsfw_channel_ids.get(0).cloned().unwrap_or_default()
    } else {
        sfw_channel_ids.get(0).cloned().unwrap_or_default()
    };

    if channel_id.is_empty() {
        if nsfw {
            return Err("No 18+ mod channels found in this server.".to_string());
        } else {
            return Err("This server's mod channel is age-restricted. Please click the 18+ toggle.".to_string());
        }
    }

    let threads_url = format!(
        "https://discord.com/api/v9/channels/{}/threads/search?sort_by=creation_time&sort_order=desc&limit=25&offset={}",
        channel_id, offset
    );

    let threads_res = client
        .get(&threads_url)
        .headers(headers_map.clone())
        .send()
        .await
        .map_err(|e| format!("Threads request failed: {}", e))?;

    let threads_json: serde_json::Value = threads_res.json().await.map_err(|e| e.to_string())?;

    if let Some(msg) = threads_json.get("message").and_then(|m| m.as_str()) {
        return Err(format!("Discord API Error: {}", msg));
    }

    let threads = threads_json.get("threads").cloned().unwrap_or(serde_json::json!([]));
    if threads.as_array().map_or(true, |a| a.is_empty()) && offset == 0 {
        return Err(format!("Zero threads returned from channel {}. Raw response: {}", channel_id, threads_json.to_string()));
    }

    Ok(serde_json::json!({
        "threads": threads,
        "sfw_channel_ids": sfw_channel_ids,
        "nsfw_channel_ids": nsfw_channel_ids,
        "channel_tags": channel_tags,
        "guild_id": guild_id,
    }))
}

/// Fetch a specific thread's metadata directly
#[tauri::command]
pub async fn fetch_discord_thread(token: String, thread_id: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let mut headers_map = reqwest::header::HeaderMap::new();
    headers_map.insert(
        "Authorization",
        token.parse().map_err(|_| "Invalid token format".to_string())?,
    );

    let url = format!("https://discord.com/api/v9/channels/{}", thread_id);
    let res = client
        .get(&url)
        .headers(headers_map)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    
    if let Some(msg) = json.get("message").and_then(|m| m.as_str()) {
        return Err(format!("Discord API Error: {}", msg));
    }

    Ok(json)
}

/// Fetch thread messages to extract thumbnail & download links.
#[tauri::command]
pub async fn fetch_thread_messages(token: String, thread_id: String, last_message_id: Option<String>, ignore_cache: bool) -> Result<serde_json::Value, String> {
    let cache_dir = get_data_dir().join("cache").join("discord_threads");
    let _ = fs::create_dir_all(&cache_dir);
    
    let mut all_messages_opt: Option<Vec<serde_json::Value>> = None;

    // Check cache
    if !ignore_cache {
        if let Some(lmid) = &last_message_id {
            let cache_file = cache_dir.join(format!("{}_{}.json", thread_id, lmid));
            if cache_file.exists() {
                if let Ok(content) = fs::read_to_string(&cache_file) {
                    if let Ok(json) = serde_json::from_str::<Vec<serde_json::Value>>(&content) {
                        all_messages_opt = Some(json);
                    }
                }
            }
        }
    }

    let all_messages = if let Some(cached) = all_messages_opt {
        cached
    } else {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .map_err(|e| e.to_string())?;

        let mut fetched_msgs: Vec<serde_json::Value> = Vec::new();
        let mut last_id: Option<String> = None;

        for _ in 0..4 { // Fetch up to 400 messages
            let mut url = format!(
                "https://discord.com/api/v9/channels/{}/messages?limit=100",
                thread_id
            );
            if let Some(before) = &last_id {
                url.push_str(&format!("&before={}", before));
            }

            let res = client
                .get(&url)
                .header("Authorization", &token)
                .header("Content-Type", "application/json")
                .send()
                .await
                .map_err(|e| format!("Request failed: {}", e))?;

            if res.status().is_success() {
                let msgs: Vec<serde_json::Value> = res.json().await.map_err(|e| e.to_string())?;
                if msgs.is_empty() {
                    break;
                }
                last_id = msgs.last()
                    .and_then(|m| m.get("id"))
                    .and_then(|s| s.as_str())
                    .map(|s| s.to_string());
                
                let count = msgs.len();
                fetched_msgs.extend(msgs);
                if count < 100 {
                    break;
                }
            } else if res.status().as_u16() == 429 {
                if fetched_msgs.is_empty() {
                    return Err("rate_limited".to_string());
                }
                break;
            } else {
                if fetched_msgs.is_empty() {
                    return Err(format!("HTTP {}", res.status()));
                }
                break;
            }
        }

        let json_val = serde_json::json!(fetched_msgs);

        // Save to cache
        if let Some(lmid) = &last_message_id {
            if let Ok(entries) = fs::read_dir(&cache_dir) {
                for entry in entries.flatten() {
                    let fname = entry.file_name().to_string_lossy().to_string();
                    if fname.starts_with(&format!("{}_", thread_id)) {
                        let _ = fs::remove_file(entry.path());
                    }
                }
            }
            let cache_file = cache_dir.join(format!("{}_{}.json", thread_id, lmid));
            if let Ok(json_str) = serde_json::to_string(&json_val) {
                let _ = fs::write(cache_file, json_str);
            }
        }
        
        fetched_msgs
    };

    // Strip out heavy/useless data for IPC to keep JS main thread buttery smooth
    let mut stripped_messages = Vec::new();
    for mut msg in all_messages {
        let is_op = msg.get("id").and_then(|v| v.as_str()) == Some(thread_id.as_str());
        let has_http = msg.get("content").and_then(|v| v.as_str()).map(|s| s.contains("http")).unwrap_or(false);
        let has_attachments = msg.get("attachments").and_then(|v| v.as_array()).map(|a| !a.is_empty()).unwrap_or(false);
        let has_embeds = msg.get("embeds").and_then(|v| v.as_array()).map(|e| !e.is_empty()).unwrap_or(false);
        
        if is_op || has_http || has_attachments || has_embeds {
            if let Some(obj) = msg.as_object_mut() {
                obj.retain(|k, _| {
                    k == "id" || k == "author" || k == "content" || k == "attachments" || k == "embeds"
                });
            }
            stripped_messages.push(msg);
        }
    }

    Ok(serde_json::json!(stripped_messages))
}

/// Download a Discord mod file (.pak/.zip/.rar) and install into the mods folder.
#[tauri::command]
pub async fn download_discord_mod(
    token: String,
    url: String,
    mod_title: String,
    mod_author: String,
) -> Result<String, String> {
    use std::io::Write;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let safe_title = sanitize_folder_name(&mod_title);

    let project_root = get_data_dir();
    let mods_dir = project_root.join("mods");
    let _ = fs::create_dir_all(&mods_dir);

    // Build request
    let mut request = client.get(&url);
    if url.contains("cdn.discordapp.com") || url.contains("media.discordapp.net") {
        request = request.header("Authorization", &token);
    }

    let response = request.send().await.map_err(|e| format!("Download failed: {}", e))?;
    if !response.status().is_success() {
        return Err(format!("Download HTTP error: {}", response.status()));
    }

    // Extract filename from content-disposition or URL
    let cd = response.headers()
        .get("content-disposition")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let url_filename = url.split('/').last().unwrap_or("mod_file").split('?').next().unwrap_or("mod_file");
    let mut raw_fn = if cd.contains("filename=") {
        let after = cd.split("filename=").nth(1).unwrap_or(url_filename);
        after.split(';').next().unwrap_or(url_filename).trim_matches(|c| c == '"' || c == '\'' || c == ' ').to_string()
    } else {
        url_filename.to_string()
    };

    // Sanitize filename for Windows to prevent OS error 123
    raw_fn = raw_fn
        .chars()
        .map(|c| if "<>:\"/\\|?*".contains(c) { '_' } else { c })
        .collect::<String>()
        .trim()
        .to_string();
    
    if raw_fn.is_empty() {
        raw_fn = "mod_file.pak".to_string();
    }

    let bytes = response.bytes().await.map_err(|e| format!("Read body failed: {}", e))?;

    // Save to temp dir first
    let temp_dir = project_root.join("cache").join("downloads");
    let _ = fs::create_dir_all(&temp_dir);
    let temp_path = temp_dir.join(&raw_fn);
    let mut file = fs::File::create(&temp_path).map_err(|e| format!("Create temp file failed: {}", e))?;
    file.write_all(&bytes).map_err(|e| format!("Write failed: {}", e))?;
    drop(file);

    // Determine final folder & extract .pak files
    let ext = std::path::Path::new(&raw_fn)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    let base_fn = std::path::Path::new(&raw_fn)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(&raw_fn)
        .to_string();

    let specific_title = if base_fn.to_lowercase().contains(&safe_title.to_lowercase())
        || safe_title.to_lowercase().contains(&base_fn.to_lowercase())
    {
        safe_title.clone()
    } else {
        format!("{} - {}", safe_title, base_fn)
    };

    let specific_title: String = specific_title
        .chars()
        .map(|c| if "<>:\"/\\|?*".contains(c) { '_' } else { c })
        .collect();

    // Delegate to unified extraction logic
    extract_and_install_mod(&temp_path, &specific_title, &mod_author, "Discord", Some(&url))
}

#[tauri::command]
pub async fn open_discord_login(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::{WebviewWindowBuilder, WebviewUrl, Manager, Emitter};
    use std::time::Duration;
    use std::thread;

    // Check if window already exists
    if let Some(existing) = app.get_webview_window("discord_login") {
        let _ = existing.set_focus();
        return Ok(());
    }

    let window = WebviewWindowBuilder::new(
        &app,
        "discord_login",
        WebviewUrl::External("https://discord.com/login".parse().unwrap())
    )
    .title("Discord Login")
    .inner_size(800.0, 600.0)
    .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
    .build()
    .map_err(|e| e.to_string())?;

    let app_clone = app.clone();
    let window_clone = window.clone();
    
    thread::spawn(move || {
        // Wait for Discord page to load
        thread::sleep(Duration::from_secs(3));
        println!("[Discord Login] Starting token extraction polling...");
        
        for i in 0..600 {
            thread::sleep(Duration::from_secs(1));
            
            // First, check what URL we're on via Tauri's API
            let current_url = match window_clone.url() {
                Ok(u) => u.to_string(),
                Err(_) => {
                    println!("[Discord Login] Window closed (can't get URL)");
                    break;
                }
            };
            
            if i % 5 == 0 {
                println!("[Discord Login] Poll #{}: URL = {}", i, current_url);
            }
            
            // Check if we already have a token in the URL hash
            if current_url.contains("#MHTOKEN_") {
                if let Some(token_part) = current_url.split("#MHTOKEN_").nth(1) {
                    let token = token_part.to_string();
                    if !token.is_empty() && token.len() > 40 {
                        println!("[Discord Login] TOKEN FOUND via hash! Length: {}", token.len());
                        let _ = app_clone.emit("discord-token-found", token);
                        let _ = window_clone.close();
                        return;
                    }
                }
            }
            
            // If still on login page, skip extraction
            if current_url.contains("/login") || current_url.contains("/register") {
                continue;
            }
            
            // User is logged in (URL is /channels or similar) — try to extract token
            let js = r#"
                (function() {
                    try {
                        // Don't re-run if we already found it
                        if (window._mhTokenFound) return;
                        
                        // Step 1: Install network hooks if not already done
                        if (!window._mhHooksInstalled) {
                            window._mhHooksInstalled = true;
                            window._mhCapturedToken = null;
                            
                            // Hook XMLHttpRequest.setRequestHeader
                            var origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
                            XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
                                if (name && name.toLowerCase() === 'authorization' && value && value.length > 40) {
                                    window._mhCapturedToken = value;
                                }
                                return origSetHeader.apply(this, arguments);
                            };
                            
                            // Hook XMLHttpRequest.open to intercept request objects
                            var origOpen = XMLHttpRequest.prototype.open;
                            XMLHttpRequest.prototype.open = function() {
                                this._mhUrl = arguments[1];
                                return origOpen.apply(this, arguments);
                            };
                            
                            // Hook fetch
                            var origFetch = window.fetch;
                            window.fetch = function() {
                                try {
                                    var init = arguments[1];
                                    if (init && init.headers) {
                                        var auth = null;
                                        if (init.headers instanceof Headers) {
                                            auth = init.headers.get('Authorization') || init.headers.get('authorization');
                                        } else if (typeof init.headers === 'object') {
                                            auth = init.headers['Authorization'] || init.headers['authorization'];
                                        }
                                        if (auth && auth.length > 40) {
                                            window._mhCapturedToken = auth;
                                        }
                                    }
                                } catch(e) {}
                                return origFetch.apply(this, arguments);
                            };
                        }
                        
                        var token = window._mhCapturedToken;
                        
                        // Step 2: If no token captured yet, try to trigger a new API request
                        if (!token && !window._mhTriggerSent) {
                            window._mhTriggerSent = true;
                            // Click on different UI elements to trigger API calls
                            try {
                                // Try to navigate to a DM or trigger science/tracking endpoint
                                var links = document.querySelectorAll('a[href*="/channels"]');
                                if (links.length > 1) {
                                    links[1].click();
                                }
                            } catch(e) {}
                        }
                        
                        // Step 3: Also try to trigger via navigating
                        if (!token && window._mhTriggerSent && !window._mhTrigger2) {
                            window._mhTrigger2 = true;
                            try {
                                // Discord sends periodic science/heartbeat requests
                                // Navigate to a different route to force re-fetch
                                var current = window.location.pathname;
                                if (current.includes('/channels/@me')) {
                                    window.history.pushState({}, '', '/channels/@me');
                                    window.dispatchEvent(new PopStateEvent('popstate'));
                                }
                            } catch(e) {}
                        }
                        
                        // Step 4: Broader webpack search - look for token-like strings
                        if (!token) {
                            try {
                                var wp = window.webpackChunkdiscord_app;
                                if (wp) {
                                    wp.push([
                                        [Date.now()],
                                        {},
                                        function(e) {
                                            for (var id in e.c) {
                                                try {
                                                    var exp = e.c[id].exports;
                                                    if (!exp) continue;
                                                    
                                                    // Look for getToken on any depth
                                                    var targets = [exp, exp.default, exp.Z, exp.ZP];
                                                    for (var t = 0; t < targets.length; t++) {
                                                        var obj = targets[t];
                                                        if (!obj) continue;
                                                        if (typeof obj.getToken === 'function') {
                                                            try {
                                                                var val = obj.getToken();
                                                                if (val && typeof val === 'string' && val.length > 40) {
                                                                    token = val;
                                                                }
                                                            } catch(x) {}
                                                        }
                                                        // Also check for _token, token properties
                                                        if (typeof obj.token === 'string' && obj.token.length > 40) {
                                                            token = obj.token;
                                                        }
                                                        if (typeof obj._token === 'string' && obj._token.length > 40) {
                                                            token = obj._token;
                                                        }
                                                    }
                                                    
                                                    // Deep property scan
                                                    for (var prop in exp) {
                                                        try {
                                                            var v = exp[prop];
                                                            if (v && typeof v === 'object') {
                                                                if (typeof v.getToken === 'function') {
                                                                    var r = v.getToken();
                                                                    if (r && typeof r === 'string' && r.length > 40) token = r;
                                                                }
                                                                if (typeof v.token === 'string' && v.token.length > 40) token = v.token;
                                                                if (typeof v._token === 'string' && v._token.length > 40) token = v._token;
                                                            }
                                                        } catch(x) {}
                                                    }
                                                    
                                                    if (token) break;
                                                } catch(x) {}
                                            }
                                        }
                                    ]);
                                    wp.pop();
                                }
                            } catch(e) {}
                        }
                        
                        if (token && typeof token === 'string' && token.length > 40) {
                            window._mhTokenFound = true;
                            window.location.hash = '#MHTOKEN_' + token;
                        }
                    } catch(e) {}
                })();
            "#;

            if window_clone.eval(js).is_err() {
                println!("[Discord Login] eval() failed — window likely closed");
                break;
            }
            
            // Give the hash change a moment to propagate, then check again
            thread::sleep(Duration::from_millis(200));
            
            if let Ok(url_after) = window_clone.url() {
                let url_str = url_after.to_string();
                if url_str.contains("#MHTOKEN_") {
                    if let Some(token_part) = url_str.split("#MHTOKEN_").nth(1) {
                        let token = token_part.to_string();
                        if !token.is_empty() && token.len() > 40 {
                            println!("[Discord Login] TOKEN FOUND! Length: {}", token.len());
                            let _ = app_clone.emit("discord-token-found", token);
                            let _ = window_clone.close();
                            return;
                        }
                    }
                }
            }
        }
        
        println!("[Discord Login] Polling ended without finding token");
    });

    Ok(())
}
