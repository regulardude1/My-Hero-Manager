// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::fs;
use std::path::Path;
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::collections::HashMap;
use std::os::windows::process::CommandExt;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

// Simple base64 encoder removed for performance. 
// We now use relative paths so GLTFLoader can fetch the raw files.

#[derive(Serialize, Deserialize)]
struct ModInfo {
    id: String,
    name: String,
    author: String,
    version: String,
    category: String,
    character: String,
    active: bool,
    folder_path: String,
    #[serde(default)]
    modified_files: Vec<String>,
    created_at: u64,
    #[serde(default)]
    url: Option<String>,
    pak_name: Option<String>,
    pak_size: Option<u64>,
}

fn load_cache() -> HashMap<String, serde_json::Value> {
    let cache_path = get_data_dir().join("cache/character_scan_cache.json");
    if let Ok(content) = fs::read_to_string(&cache_path) {
        if let Ok(json) = serde_json::from_str(&content) {
            return json;
        }
    }
    HashMap::new()
}

fn save_cache(cache: &HashMap<String, serde_json::Value>) {
    let cache_dir = get_data_dir().join("cache");
    let _ = fs::create_dir_all(&cache_dir);
    if let Ok(json) = serde_json::to_string_pretty(cache) {
        let _ = fs::write(cache_dir.join("character_scan_cache.json"), json);
    }
}

pub fn get_characters_map() -> HashMap<String, String> {
    let cache_dir = get_data_dir().join("cache");
    let _ = fs::create_dir_all(&cache_dir);
    let map_path = cache_dir.join("characters.json");
    
    if let Ok(content) = fs::read_to_string(&map_path) {
        if let Ok(map) = serde_json::from_str::<HashMap<String, String>>(&content) {
            return map;
        }
    }
    
    let mut default_map = HashMap::new();
    default_map.insert("000".to_string(), "All".to_string());
    default_map.insert("001".to_string(), "Izuku Midoriya".to_string());
    default_map.insert("002".to_string(), "Katsuki Bakugo".to_string());
    default_map.insert("003".to_string(), "Ochako Uraraka".to_string());
    default_map.insert("004".to_string(), "Shoto Todoroki".to_string());
    default_map.insert("005".to_string(), "Tenya Iida".to_string());
    default_map.insert("006".to_string(), "Tsuyu Asui".to_string());
    default_map.insert("007".to_string(), "Denki Kaminari".to_string());
    default_map.insert("008".to_string(), "Eijiro Kirishima".to_string());
    default_map.insert("009".to_string(), "Kyoka Jiro".to_string());
    default_map.insert("010".to_string(), "Momo Yaoyorozu".to_string());
    default_map.insert("011".to_string(), "Fumikage Tokoyami".to_string());
    default_map.insert("012".to_string(), "All Might".to_string());
    default_map.insert("013".to_string(), "Shota Aizawa".to_string());
    default_map.insert("014".to_string(), "Gran Torino".to_string());
    default_map.insert("015".to_string(), "Minoru Mineta".to_string());
    default_map.insert("016".to_string(), "All For One".to_string());
    default_map.insert("017".to_string(), "Dabi".to_string());
    default_map.insert("018".to_string(), "Himiko Toga".to_string());
    default_map.insert("019".to_string(), "Stain".to_string());
    default_map.insert("020".to_string(), "Muscular".to_string());
    default_map.insert("022".to_string(), "Inasa Yoarashi".to_string());
    default_map.insert("023".to_string(), "Endeavor".to_string());
    default_map.insert("024".to_string(), "Mirio Togata".to_string());
    default_map.insert("025".to_string(), "Nejire Hado".to_string());
    default_map.insert("026".to_string(), "Tamaki Amajiki".to_string());
    default_map.insert("031".to_string(), "Sir Nighteye".to_string());
    default_map.insert("032".to_string(), "Gang Orca".to_string());
    default_map.insert("034".to_string(), "Overhaul".to_string());
    default_map.insert("037".to_string(), "Twice".to_string());
    default_map.insert("043".to_string(), "Hawks".to_string());
    default_map.insert("046".to_string(), "Itsuka Kendo".to_string());
    default_map.insert("047".to_string(), "Tetsutetsu".to_string());
    default_map.insert("100".to_string(), "Mt. Lady".to_string());
    default_map.insert("101".to_string(), "Cementoss".to_string());
    default_map.insert("102".to_string(), "Ibara Shiozaki".to_string());
    default_map.insert("104".to_string(), "Neito Monoma".to_string());
    default_map.insert("109".to_string(), "Present Mic".to_string());
    default_map.insert("111".to_string(), "Mirko".to_string());
    default_map.insert("113".to_string(), "Midnight".to_string());
    default_map.insert("114".to_string(), "Star and Stripe".to_string());
    default_map.insert("115".to_string(), "Lady Nagant".to_string());
    default_map.insert("116".to_string(), "Shinso".to_string());
    default_map.insert("200".to_string(), "Armored All Might".to_string());
    default_map.insert("201".to_string(), "All For One".to_string());
    default_map.insert("202".to_string(), "Deku OFA".to_string());
    default_map.insert("203".to_string(), "Shigaraki AFO".to_string());

    if let Ok(json) = serde_json::to_string_pretty(&default_map) {
        let _ = fs::write(&map_path, json);
    }
    
    default_map
}

use std::sync::OnceLock;

static DATA_DIR: OnceLock<std::path::PathBuf> = OnceLock::new();
static TOOLS_DIR: OnceLock<std::path::PathBuf> = OnceLock::new();

fn get_data_dir() -> std::path::PathBuf {
    DATA_DIR.get().cloned().unwrap_or_else(|| {
        let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
        let parent = cwd.parent().unwrap_or(&cwd).to_path_buf();
        if parent.join("src-tauri").exists() { parent } else { cwd }
    })
}

fn get_tools_dir() -> std::path::PathBuf {
    TOOLS_DIR.get().cloned().unwrap_or_else(|| {
        get_data_dir().join("tools")
    })
}

fn sanitize_folder_name(title: &str) -> String {
    let mut safe: String = title
        .chars()
        .filter(|&c| c.is_ascii()) // Omit emojis and non-ASCII characters to keep Umodel happy
        .map(|c| if "<>:\"/\\|?*".contains(c) { '_' } else { c })
        .collect();
    safe = safe.trim().to_string();
    if safe.len() > 80 {
        safe.truncate(80);
        safe = safe.trim_end().to_string();
    }
    if safe.is_empty() { "Unknown_Mod".to_string() } else { safe }
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

fn scan_pak_for_character_and_emote(pak_path: &Path) -> (String, String, Vec<String>) {
    let project_root = get_data_dir();
    let tools_dir = get_tools_dir();
    
    let umodel_exe = if tools_dir.join("umodel_64.exe").exists() {
        tools_dir.join("umodel_64.exe")
    } else {
        tools_dir.join("umodel.exe")
    };

    if !umodel_exe.exists() {
        eprintln!("[scan_pak] umodel not found at {:?}", umodel_exe);
        return (String::new(), String::from("Other"), Vec::new());
    }

    // Resolve pak_path to absolute so umodel can always find it
    let abs_pak_path = if pak_path.is_absolute() {
        pak_path.to_path_buf()
    } else {
        project_root.join(pak_path)
    };
    let time_num = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
    let temp_dir = project_root.join(format!("cache/temp_scan_{}", time_num));
    let _ = std::fs::create_dir_all(&temp_dir);
    let temp_pak = temp_dir.join("scan.pak");
    
    // Use hard link for instant "copy", fallback to copy if cross-device
    if std::fs::hard_link(&abs_pak_path, &temp_pak).is_err() {
        let _ = std::fs::copy(&abs_pak_path, &temp_pak);
    }

    let aes_key = "0x332F41B1130F125444A35F420EC6D05EA3E27A972A36DAD90C83FC6958D941C7";
    let output = Command::new(&umodel_exe)
        .arg("-list")
        .arg("-game=ue4.27")
        .arg(format!("-path={}", temp_dir.to_string_lossy()))
        .arg(format!("-aes={}", aes_key))
        .arg("*")
        .creation_flags(0x08000000)
        .output();
        
    // Cleanup temporary scan directory
    let _ = std::fs::remove_dir_all(&temp_dir);
        
    let out_str = match output {
        Ok(out) => {
            let combined = format!("{}{}", String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr));
            eprintln!("[scan_pak] umodel output length: {} bytes, exit: {:?}", combined.len(), out.status.code());
            if combined.len() < 50 {
                eprintln!("[scan_pak] Full output: {}", combined);
            }
            combined
        }
        Err(e) => {
            eprintln!("[scan_pak] Failed to execute umodel: {}", e);
            return (String::new(), String::from("Other"), Vec::new());
        }
    };

    let has_anim = out_str.contains("AnimSequence") || out_str.contains("AnimMontage") || out_str.contains("MeshAnimation") || out_str.contains("/Animations/");
    let has_mesh = out_str.contains("SkeletalMesh") || out_str.contains("StaticMesh") || out_str.contains("/Mesh/") || out_str.contains("SK_") || out_str.contains("SM_");
    let has_audio = out_str.contains("SoundWave") || out_str.contains("Dialogue") || out_str.contains("AkMediaAsset") || out_str.contains("/Sound/") || out_str.contains("/Audio/");
    
    // Extract character ID: look for "Character/Ch" followed by exactly 3 digits
    let mut ch_id = String::new();
    for (i, _) in out_str.match_indices("Character/Ch") {
        let after = &out_str[i + 12..];
        if after.len() >= 3 {
            let candidate = &after[..3];
            if candidate.chars().all(|c| c.is_ascii_digit()) {
                let parsed_id = candidate.to_string();
                if parsed_id != "000" {
                    ch_id = parsed_id;
                    break;
                } else if ch_id.is_empty() {
                    ch_id = parsed_id;
                }
            }
        }
    }
    
    eprintln!("[scan_pak] has_mesh={}, has_anim={}, has_audio={}, ch_id={}", has_mesh, has_anim, has_audio, ch_id);
    
    let mut base_char = String::new();
    let char_map = get_characters_map();

    if !ch_id.is_empty() {
        if let Some(name) = char_map.get(ch_id.as_str()) {
            base_char = name.to_string();
            // Special fallback for Deku OFA slot replacement
            if ch_id == "001" && out_str.to_lowercase().contains("ofa") {
                base_char = "Deku OFA".to_string();
            }
        } else {
            base_char = format!("Ch{}", ch_id);
        }
    }

    if base_char == "All" || base_char.is_empty() {
        let lower_path = pak_path.to_string_lossy().to_lowercase();
        for name in char_map.values() {
            if name == "All" { continue; }
            let simple = name.to_lowercase().replace(" ", "");
            let first = name.split_whitespace().next().unwrap_or("").to_lowercase();
            if lower_path.contains(&simple) || (first.len() > 3 && lower_path.contains(&first)) {
                base_char = name.to_string();
                break;
            }
        }
    }
    
    let lower_out = out_str.to_lowercase();
    let is_explicit_emote = lower_out.contains("/emote/") 
        || lower_out.contains("/emotes/") 
        || lower_out.contains("_emote_")
        || lower_out.contains("emotionact")
        || lower_out.contains("/em/em");
    let is_pure_anim = has_anim && !has_mesh;
    let is_pure_audio = has_audio && !has_mesh;
    
    let is_weapon = lower_out.contains("/weapon/") 
        || lower_out.contains("_wp_")
        || lower_out.contains("/wp_")
        || lower_out.contains("weapons/");

    let category = if is_explicit_emote || is_pure_anim {
        "Emote"
    } else if is_pure_audio {
        "Audio"
    } else if is_weapon {
        "Weapon"
    } else if has_mesh && !base_char.is_empty() {
        "Skin"
    } else if !base_char.is_empty() {
        "Skin"
    } else {
        "Other"
    };

    let mut modified_files = Vec::new();
    for line in out_str.lines() {
        if let Some(path) = line.strip_prefix("Loading package: ") {
            let clean_path = path.split(" Ver:").next().unwrap_or(path).trim();
            modified_files.push(clean_path.to_string());
        }
    }

    eprintln!("[scan_pak] Result: character={}, category={}, modified_files={}", base_char, category, modified_files.len());
    (base_char, category.to_string(), modified_files)
}

#[tauri::command]
fn get_local_mods(game_path: Option<String>) -> Result<Vec<ModInfo>, String> {
    let project_root = get_data_dir();
    let mods_dir = project_root.join("mods");
    eprintln!("[get_local_mods] project_root={:?}, mods_dir={:?}, exists={}", project_root, mods_dir, mods_dir.exists());
    
    // Pre-calculate which pak files are currently installed in the game
    let mut installed_paks = std::collections::HashSet::new();
    let actual_game_path = game_path.or_else(|| get_mhur_paks_path().ok());
    if let Some(ref path) = actual_game_path {
        let target_dir = Path::new(path).join("~mods");
        if let Ok(entries) = fs::read_dir(&target_dir) {
            for entry in entries.flatten() {
                if let Some(file_name) = entry.file_name().to_str() {
                    installed_paks.insert(file_name.to_lowercase());
                }
            }
        }
    }
    
    let mut mods_list = Vec::new();
    let mut cache = load_cache();
    let mut cache_modified = false;
    
    if let Ok(entries) = fs::read_dir(mods_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let modinfo_path = path.join("modinfo.json");
                if modinfo_path.exists() {
                    if let Ok(content) = fs::read_to_string(&modinfo_path) {
                        let parsed: serde_json::Value = serde_json::from_str(&content).unwrap_or_default();
                        
                        let folder_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                        
                        let name = parsed["name"].as_str().unwrap_or(&folder_name).to_string();
                        let author = parsed["author"].as_str().unwrap_or("Unknown").to_string();
                        let version = parsed["version"].as_str().unwrap_or("1.0").to_string();
                        let url = parsed["url"].as_str().map(|s| s.to_string());
                        let mut category = parsed["category"].as_str().unwrap_or("Other").to_string();
                        let mut character = parsed["character"].as_str().unwrap_or("All").to_string();
                        let folder_path = path.canonicalize().unwrap_or(path.clone()).to_string_lossy().to_string();
                        
                        // Fix windows long path prefix if present
                        let folder_path = folder_path.strip_prefix(r#"\\?\"#).unwrap_or(&folder_path).to_string();

                        // Check if this mod's pak is in the ~mods folder
                        let mut is_active = false;
                        let mut target_pak_paths = Vec::new();
                        
                        let assets_dir = path.join("assets");
                        if assets_dir.exists() && assets_dir.is_dir() {
                            if let Ok(asset_entries) = fs::read_dir(&assets_dir) {
                                for asset in asset_entries.flatten() {
                                    let asset_path = asset.path();
                                    let ext = asset_path.extension().and_then(|s| s.to_str());
                                    if asset_path.is_file() && (ext == Some("pak") || ext == Some("pak_")) {
                                        target_pak_paths.push(asset_path.clone());
                                        if let Some(file_stem) = asset_path.file_stem().and_then(|s| s.to_str()) {
                                            let dest_name = if !file_stem.ends_with("_P") {
                                                format!("{}_P.pak", file_stem)
                                            } else {
                                                format!("{}.pak", file_stem)
                                            };
                                            if installed_paks.contains(&dest_name.to_lowercase()) {
                                                is_active = true;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        
                        let mut mod_modified_files_set = std::collections::HashSet::new();
                        let mut mod_pak_name = None;
                        let mut mod_pak_size = None;
                        
                        if let Some(first_pak) = target_pak_paths.first() {
                            mod_pak_name = first_pak.file_name().and_then(|s| s.to_str()).map(|s| s.to_string());
                            if let Ok(meta) = fs::metadata(first_pak) {
                                mod_pak_size = Some(meta.len());
                            }
                        }
                        
                        for pak_path in &target_pak_paths {
                            let clean_path = pak_path.to_string_lossy().replace(r#"\\?\"#, "").to_lowercase();
                            let cache_key = if let Ok(meta) = fs::metadata(pak_path) {
                                format!("v6|{}|{}|{}", clean_path, meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH).duration_since(std::time::UNIX_EPOCH).unwrap().as_secs(), meta.len())
                            } else {
                                format!("v6|{}", clean_path)
                            };
                            
                            let (ch, cat, files) = if let (Some(cached), Some(mod_files)) = (cache.get(&cache_key), cache.get(&cache_key).and_then(|c| c.get("modified_files").and_then(|v| v.as_array()))) {
                                (
                                    cached.get("character").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                                    cached.get("category").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                                    mod_files.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect::<Vec<String>>()
                                )
                            } else {
                                let (ch, cat, files) = scan_pak_for_character_and_emote(pak_path);
                                cache.insert(cache_key, serde_json::json!({
                                    "character": ch,
                                    "category": cat,
                                    "modified_files": files
                                }));
                                cache_modified = true;
                                (ch, cat, files)
                            };
                            
                            if !ch.is_empty() { character = ch; }
                            if !cat.is_empty() && cat != "Other" { category = cat; }
                            for f in files {
                                mod_modified_files_set.insert(f);
                            }
                        }
                        
                        let mod_modified_files: Vec<String> = mod_modified_files_set.into_iter().collect();

                        let created_at = fs::metadata(&path)
                            .and_then(|m| m.created().or_else(|_| m.modified()))
                            .ok()
                            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                            .map(|d| d.as_secs())
                            .unwrap_or(0);

                        mods_list.push(ModInfo {
                            id: folder_name,
                            name,
                            author,
                            version,
                            category,
                            character,
                            active: is_active,
                            folder_path,
                            modified_files: mod_modified_files,
                            created_at,
                            url,
                            pak_name: mod_pak_name,
                            pak_size: mod_pak_size,
                        });
                    }
                }
            }
        }
    }
    
    if cache_modified {
        save_cache(&cache);
    }
    
    Ok(mods_list)
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn deploy_mods(game_path: String, active_mod_paths: Vec<String>) -> Result<String, String> {
    let target_dir = Path::new(&game_path).join("~mods");
    
    // Create ~mods directory if it doesn't exist
    if !target_dir.exists() {
        fs::create_dir_all(&target_dir).map_err(|e| format!("Failed to create ~mods directory: {}", e))?;
    }
    
    // Clear out existing .pak files in ~mods
    if let Ok(entries) = fs::read_dir(&target_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("pak") {
                let _ = fs::remove_file(&path);
            }
        }
    }
    
    // Copy new .pak files from active mods
    for mod_path_str in active_mod_paths {
        let assets_dir = Path::new(&mod_path_str).join("assets");
        if !assets_dir.exists() || !assets_dir.is_dir() {
            continue;
        }
        
        if let Ok(entries) = fs::read_dir(&assets_dir) {
            for entry in entries.flatten() {
                let file_path = entry.path();
                let ext = file_path.extension().and_then(|s| s.to_str());
                if file_path.is_file() && (ext == Some("pak") || ext == Some("pak_")) {
                    if let Some(file_stem) = file_path.file_stem().and_then(|s| s.to_str()) {
                        let new_file_name = if !file_stem.ends_with("_P") {
                            format!("{}_P.pak", file_stem)
                        } else {
                            format!("{}.pak", file_stem)
                        };
                        let dest_path = target_dir.join(new_file_name);
                        let _ = fs::copy(&file_path, &dest_path);
                    }
                }
            }
        }
    }
    
    Ok("Mods deployed successfully!".into())
}

#[tauri::command]
fn get_mhur_paks_path() -> Result<String, String> {
    fn get_steam_path() -> Option<String> {
        if let Ok(output) = Command::new("reg").args(["query", "HKCU\\Software\\Valve\\Steam", "/v", "SteamPath"]).output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if line.contains("SteamPath") {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 3 {
                        return Some(parts[2..].join(" "));
                    }
                }
            }
        }
        
        if let Ok(output) = Command::new("reg").args(["query", "HKLM\\SOFTWARE\\Wow6432Node\\Valve\\Steam", "/v", "InstallPath"]).output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if line.contains("InstallPath") {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 3 {
                        return Some(parts[2..].join(" "));
                    }
                }
            }
        }
        None
    }

    fn get_library_folders(steam_path: &str) -> Vec<String> {
        let mut libraries = vec![steam_path.to_string()];
        let vdf_path = Path::new(steam_path).join("steamapps").join("libraryfolders.vdf");
        
        if let Ok(content) = fs::read_to_string(&vdf_path) {
            for line in content.lines() {
                let line = line.trim();
                if line.starts_with("\"path\"") {
                    let parts: Vec<&str> = line.split('"').collect();
                    if parts.len() >= 4 {
                        let path = parts[3].replace("\\\\", "\\");
                        libraries.push(path);
                    }
                }
            }
        }
        libraries
    }

    let steam_path = get_steam_path().ok_or("Could not find Steam installation path")?;
    let libs = get_library_folders(&steam_path);
    
    for lib in libs {
        let manifest_path = Path::new(&lib).join("steamapps").join("appmanifest_1607250.acf");
        if let Ok(content) = fs::read_to_string(&manifest_path) {
            for line in content.lines() {
                let line = line.trim();
                if line.starts_with("\"installdir\"") {
                    let parts: Vec<&str> = line.split('"').collect();
                    if parts.len() >= 4 {
                        let install_dir = parts[3];
                        let paks_path = Path::new(&lib)
                            .join("steamapps")
                            .join("common")
                            .join(install_dir)
                            .join("HerovsGame")
                            .join("Content")
                            .join("Paks");
                        
                        if paks_path.exists() {
                            return Ok(paks_path.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
    }
    
    Err("Could not locate My Hero Ultra Rumble Paks folder automatically".into())
}

#[tauri::command]
fn launch_game() -> Result<String, String> {
    use std::process::Command;
    match Command::new("cmd").args(["/C", "start", "steam://rungameid/1607250"]).spawn() {
        Ok(_) => Ok("Game launched successfully!".into()),
        Err(e) => Err(format!("Failed to launch game: {}", e)),
    }
}

#[tauri::command]
fn extract_mod_preview(mod_id: String, folder_path: String) -> Result<String, String> {
    use std::process::Command;
    use std::os::windows::process::CommandExt;
    
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    
    let folder = Path::new(&folder_path);
    let assets_dir = folder.join("assets");
    if !assets_dir.exists() {
        return Err("No assets folder found".to_string());
    }
    let project_root = get_data_dir();
    let tools_dir = get_tools_dir();
    let cache_dir = project_root.join("cache").join("models").join(&mod_id);
    if let Some(parent) = cache_dir.parent() {
        let _ = fs::create_dir_all(parent);
    }
    
    eprintln!("[extract] project_root={}, tools_dir={}, cache_dir={}", 
        project_root.display(), tools_dir.display(), cache_dir.display());
    
    // Check if already extracted (search recursively, prefer _standalone.gltf)
    fn find_gltf(dir: &Path) -> Option<std::path::PathBuf> {
        let mut fallback: Option<std::path::PathBuf> = None;
        fn search(dir: &Path, fallback: &mut Option<std::path::PathBuf>) -> Option<std::path::PathBuf> {
            if let Ok(entries) = fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        if let Some(found) = search(&path, fallback) {
                            return Some(found);
                        }
                    } else {
                        let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                        if name.ends_with("_standalone.gltf") {
                            return Some(path);
                        }
                        match path.extension().and_then(|s| s.to_str()) {
                            Some("glb") => return Some(path),
                            Some("gltf") => { if fallback.is_none() { *fallback = Some(path); } }
                            _ => {}
                        }
                    }
                }
            }
            None
        }
        if let Some(found) = search(dir, &mut fallback) {
            return Some(found);
        }
        fallback
    }
    
    if let Some(cached) = find_gltf(&cache_dir) {
        return Ok(cached.to_string_lossy().to_string());
    }
    
    // Also check the old cache location (src-tauri/cache) for backwards compat
    let base_dir = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    let alt_cache = base_dir.join("cache").join("models").join(&mod_id);
    if alt_cache != cache_dir {
        if let Some(cached) = find_gltf(&alt_cache) {
            return Ok(cached.to_string_lossy().to_string());
        }
    }
    
    // Find umodel executable (prefer 64-bit)
    let umodel_exe = if tools_dir.join("umodel_64.exe").exists() {
        tools_dir.join("umodel_64.exe")
    } else if tools_dir.join("umodel.exe").exists() {
        tools_dir.join("umodel.exe")
    } else {
        return Err(format!("umodel not found in {}", tools_dir.display()));
    };
    
    eprintln!("[extract] Using umodel: {}", umodel_exe.display());
    
    // Find the first .pak file
    let mut pak_file = None;
    if let Ok(entries) = fs::read_dir(&assets_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let ext = path.extension().and_then(|s| s.to_str());
            if ext == Some("pak") || ext == Some("pak_") {
                pak_file = Some(path);
                break;
            }
        }
    }
    
    let pak_file = pak_file.ok_or("No .pak file found in assets/")?;
    let pak_parent = pak_file.parent().unwrap().to_string_lossy().to_string();
    let aes_key = "0x332F41B1130F125444A35F420EC6D05EA3E27A972A36DAD90C83FC6958D941C7";
    let cache_str = cache_dir.to_string_lossy().to_string();
    
    eprintln!("[extract] pak_parent={}, cache_str={}", pak_parent, cache_str);
    
    let run_umodel = |use_notex: bool, temp_pak_dir: &str| -> bool {
        let mut cmd = Command::new(&umodel_exe);
        cmd.current_dir(&tools_dir)
            .arg("-game=ue4.27")
            .arg(format!("-path={}", temp_pak_dir))
            .arg(format!("-aes={}", aes_key))
            .arg("-noanim");
            
        if use_notex {
            cmd.arg("-notex");
        } else {
            cmd.arg("-png"); // Ask for PNGs instead of TGA when extracting textures
        }
        
        let result = cmd.arg("-nooverwrite")
            .arg("-export")
            .arg("-gltf")
            .arg(format!("-out={}", temp_pak_dir)) // Workaround: Extract to temp_dir (no emojis in path) to avoid umodel crashes
            .arg("*")
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .output();
            
        match result {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);
                eprintln!("[extract] umodel exit={}, notex={}, stdout_len={}, stderr_len={}", 
                    output.status, use_notex, stdout.len(), stderr.len());
                if !stdout.is_empty() {
                    eprintln!("[extract] stdout: {}", &stdout[..stdout.len().min(500)]);
                }
                if !stderr.is_empty() {
                    eprintln!("[extract] stderr: {}", &stderr[..stderr.len().min(500)]);
                }
                output.status.success()
            }
            Err(e) => {
                eprintln!("[extract] umodel execution failed: {}", e);
                false
            }
        }
    };
    

    let time_num = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
    let temp_dir = project_root.join(format!("cache/temp_extract_{}", time_num));
    let _ = std::fs::create_dir_all(&temp_dir);
    let temp_pak = temp_dir.join("extract.pak");
    
    if std::fs::hard_link(&pak_file, &temp_pak).is_err() {
        let _ = std::fs::copy(&pak_file, &temp_pak);
    }

    let mut extract_success = run_umodel(false, &temp_dir.to_string_lossy());
    if !extract_success {
        // Fallback: extract without textures if it crashed on a bad texture
        extract_success = run_umodel(true, &temp_dir.to_string_lossy());
    }

    if extract_success {
        // Move temp_dir to cache_dir
        let _ = std::fs::remove_file(&temp_pak); // delete the temp pak so it doesn't get cached
        let _ = std::fs::remove_dir_all(&cache_dir); // remove the empty cache_dir so rename works
        if let Err(e) = std::fs::rename(&temp_dir, &cache_dir) {
            eprintln!("[extract] Failed to rename temp_dir to cache_dir: {}", e);
        }
    } else {
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    if !extract_success {
        if find_gltf(&cache_dir).is_none() {
            return Err("umodel produced no .gltf/.glb files".to_string());
        }
    }
    
    // Search the cache dir recursively for any produced gltf/glb
    if let Some(found) = find_gltf(&cache_dir) {
        eprintln!("[extract] Found: {}", found.display());
        
        // If it's a .gltf (JSON), inline any external .bin buffers as base64 data URIs
        // This makes the file self-contained so Three.js doesn't need to resolve relative paths
        if found.extension().and_then(|s| s.to_str()) == Some("gltf") {
            let standalone = found.with_file_name(
                format!("{}_standalone.gltf", found.file_stem().unwrap().to_string_lossy())
            );
            
            // Only create standalone if it doesn't already exist
            if !standalone.exists() {
                if let Ok(gltf_text) = fs::read_to_string(&found) {
                    if let Ok(mut gltf_json) = serde_json::from_str::<serde_json::Value>(&gltf_text) {
                        let gltf_dir = found.parent().unwrap();
                        let mut modified = false;
                        
                        // We no longer inline .bin buffers to save massive CPU cycles during debug builds.
                        // GLTFLoader in Three.js handles the external .bin files automatically.
                        
                        // INJECT TEXTURES FROM .PROPS.TXT
                        let mut next_image_idx = gltf_json.get("images").and_then(|i| i.as_array()).map_or(0, |a| a.len());
                        let mut next_tex_idx = gltf_json.get("textures").and_then(|t| t.as_array()).map_or(0, |a| a.len());
                        
                        // We need a cloned list of materials to avoid borrowing issues while modifying
                        let mut new_images = Vec::new();
                        let mut new_textures = Vec::new();
                        
                        if let Some(materials) = gltf_json.get_mut("materials").and_then(|m| m.as_array_mut()) {
                            for mat in materials.iter_mut() {
                                if let Some(mat_name) = mat.get("name").and_then(|n| n.as_str()).map(|s| s.to_string()) {
                                    // Path to .props.txt is ../Mat/<mat_name>.props.txt
                                    let props_path = gltf_dir.join("../Mat").join(format!("{}.props.txt", mat_name));
                                    if let Ok(props) = fs::read_to_string(&props_path) {
                                        // Find base color/diffuse texture
                                        let search_keys = ["ColorTexture", "BaseColor", "Diffuse", "Texture"];
                                        let mut found_tex_name = None;
                                        
                                        for key in search_keys {
                                            if let Some(idx) = props.find(key) {
                                                let after = &props[idx..];
                                                if let Some(t2d_idx) = after.find("Texture2D'") {
                                                    let t2d_after = &after[t2d_idx+10..];
                                                    if let Some(end_quote) = t2d_after.find('\'') {
                                                        let path = &t2d_after[..end_quote];
                                                        if let Some(last_slash) = path.rfind('/') {
                                                            let file_dot = &path[last_slash+1..];
                                                            if let Some(dot) = file_dot.find('.') {
                                                                found_tex_name = Some(file_dot[..dot].to_string());
                                                                break;
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        
                                        if let Some(tex_name) = found_tex_name {
                                            let png_path = gltf_dir.join("../Tex").join(format!("{}.png", tex_name));
                                            if png_path.exists() {
                                                let relative_uri = format!("../Tex/{}.png", tex_name);
                                                
                                                new_images.push(serde_json::json!({
                                                    "uri": relative_uri
                                                }));
                                                
                                                new_textures.push(serde_json::json!({
                                                    "source": next_image_idx
                                                }));
                                                
                                                if let Some(pbr) = mat.get_mut("pbrMetallicRoughness").and_then(|p| p.as_object_mut()) {
                                                    pbr.insert("baseColorTexture".to_string(), serde_json::json!({
                                                        "index": next_tex_idx
                                                    }));
                                                } else if let Some(mat_obj) = mat.as_object_mut() {
                                                    mat_obj.insert("pbrMetallicRoughness".to_string(), serde_json::json!({
                                                        "baseColorTexture": {
                                                            "index": next_tex_idx
                                                        }
                                                    }));
                                                }
                                                
                                                next_image_idx += 1;
                                                next_tex_idx += 1;
                                                modified = true;
                                                eprintln!("[extract] Injected texture {} into material {}", tex_name, mat_name);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        
                        // Append the new images and textures to the GLTF
                        if !new_images.is_empty() {
                            if !gltf_json.as_object().unwrap().contains_key("images") {
                                gltf_json.as_object_mut().unwrap().insert("images".to_string(), serde_json::json!([]));
                            }
                            if let Some(images_arr) = gltf_json.get_mut("images").and_then(|i| i.as_array_mut()) {
                                images_arr.extend(new_images);
                            }
                            
                            if !gltf_json.as_object().unwrap().contains_key("textures") {
                                gltf_json.as_object_mut().unwrap().insert("textures".to_string(), serde_json::json!([]));
                            }
                            if let Some(textures_arr) = gltf_json.get_mut("textures").and_then(|t| t.as_array_mut()) {
                                textures_arr.extend(new_textures);
                            }
                        }
                        
                        if modified {
                            if let Ok(new_json) = serde_json::to_string(&gltf_json) {
                                let _ = fs::write(&standalone, &new_json);
                                eprintln!("[extract] Created standalone: {}", standalone.display());
                                return Ok(standalone.to_string_lossy().to_string());
                            }
                        }
                    }
                }
            } else {
                return Ok(standalone.to_string_lossy().to_string());
            }
        }
        
        return Ok(found.to_string_lossy().to_string());
    }
    
    Err("umodel produced no .gltf/.glb files".to_string())
}

// ──────────────────────────────────────────────────────────────────────────────
// Discord Store commands
// ──────────────────────────────────────────────────────────────────────────────

// XOR obfuscation key — keeps the token from being stored in plain text
const TOKEN_XOR_KEY: &[u8] = b"PlusUltraModManager2024!";

fn xor_bytes(data: &[u8]) -> Vec<u8> {
    data.iter()
        .enumerate()
        .map(|(i, b)| b ^ TOKEN_XOR_KEY[i % TOKEN_XOR_KEY.len()])
        .collect()
}

fn get_cache_dir() -> std::path::PathBuf {
    get_data_dir().join("cache")
}

/// Save a Discord token to disk, XOR-obfuscated then base64-encoded.
#[tauri::command]
fn save_discord_token(token: String) -> Result<(), String> {
    let cache_dir = get_cache_dir();
    let _ = fs::create_dir_all(&cache_dir);
    let obfuscated = xor_bytes(token.as_bytes());
    let encoded = BASE64.encode(&obfuscated);
    fs::write(cache_dir.join("discord_token.enc"), encoded)
        .map_err(|e| format!("Failed to save token: {}", e))
}

/// Load and decode the Discord token from disk. Returns empty string if not found.
#[tauri::command]
fn load_discord_token() -> Result<String, String> {
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
fn clear_discord_token() -> Result<(), String> {
    let token_path = get_cache_dir().join("discord_token.enc");
    if token_path.exists() {
        fs::remove_file(&token_path).map_err(|e| format!("Failed to remove token: {}", e))?;
    }
    Ok(())
}

/// Validate a Discord token and return the user's username.
#[tauri::command]
async fn validate_discord_token(token: String) -> Result<serde_json::Value, String> {
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
async fn fetch_discord_mods(token: String, guild_id: String, offset: u32, nsfw: bool) -> Result<serde_json::Value, String> {
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
async fn fetch_discord_thread(token: String, thread_id: String) -> Result<serde_json::Value, String> {
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
async fn fetch_thread_messages(token: String, thread_id: String, last_message_id: Option<String>, ignore_cache: bool) -> Result<serde_json::Value, String> {
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

fn extract_with_winrar(archive_path: &Path, dest_dir: &Path, preserve_paths: bool) -> Result<Vec<String>, String> {
    let winrar_path = Path::new("C:\\Program Files\\WinRAR\\WinRAR.exe");

    if !winrar_path.exists() {
        return Err("WinRAR not found in default path (C:\\Program Files\\WinRAR\\WinRAR.exe). Please install WinRAR to extract .rar/.7z files automatically.".to_string());
    }

    let arg = if preserve_paths { "x" } else { "e" };

    let status = std::process::Command::new(winrar_path)
        .arg(arg)
        .arg("-y")
        .arg("-inul")
        .arg(archive_path)
        .arg("*.pak")
        .arg(dest_dir)
        .status()
        .map_err(|e| format!("Failed to execute WinRAR: {}", e))?;

    if !status.success() {
        return Err("WinRAR extraction failed (or no .pak files inside)".to_string());
    }

    let mut extracted = Vec::new();
    if preserve_paths {
        let mut dirs_to_visit = vec![dest_dir.to_path_buf()];
        while let Some(current_dir) = dirs_to_visit.pop() {
            if let Ok(entries) = fs::read_dir(&current_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        dirs_to_visit.push(path);
                    } else if path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase() == "pak" {
                        if let Ok(rel_path) = path.strip_prefix(dest_dir) {
                            extracted.push(rel_path.to_string_lossy().to_string().replace("\\", "/"));
                        }
                    }
                }
            }
        }
    } else {
        if let Ok(entries) = fs::read_dir(dest_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase() == "pak" {
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        extracted.push(name.to_string());
                    }
                }
            }
        }
    }

    Ok(extracted)
}


/// Download a Discord mod file (.pak/.zip/.rar) and install into the mods folder.
#[tauri::command]
async fn download_discord_mod(
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

/// Open a visible Tauri webview to allow the user to log into Nexus Mods.
#[tauri::command]
async fn open_nexus_login(app: tauri::AppHandle) -> Result<String, String> {
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

    let webview = tauri::webview::WebviewBuilder::new(
        "nexus_login_webview",
        tauri::WebviewUrl::External(
            url_str.parse().map_err(|_| "Invalid URL".to_string())?
        ),
    )
    .auto_resize();

    window.add_child(
        webview,
        tauri::LogicalPosition::new(0, 0),
        window.inner_size().map_err(|e| format!("{}", e))?,
    ).map_err(|e| format!("Failed to add webview: {}", e))?;

    Ok("opened".to_string())
}

/// Open a Tauri webview popup to the Nexus Mods files page.
/// The webview's on_download handler intercepts the download and installs the mod directly.
#[tauri::command]
async fn open_nexus_download(
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

/// Core function to extract and install a mod file (.pak, .zip, .rar, .7z)
/// 
/// - `path`: Path to the downloaded/imported file. This file will be DELETED after successful extraction!
/// - `mod_title`: Title of the mod (used for folder naming and modinfo).
/// - `mod_author`: Author of the mod.
/// - `source_id`: Source identifier (e.g. "GameBanana", "Discord", "Local", "Nexus") used for categorization and IDs.
/// - `source_url`: Optional URL where the mod was downloaded from.
fn extract_and_install_mod(
    path: &std::path::Path, 
    mod_title: &str, 
    mod_author: &str, 
    source_id: &str,
    source_url: Option<&str>
) -> Result<String, String> {
    let safe_title = sanitize_folder_name(mod_title);

    let project_root = get_data_dir();
    let mods_dir = project_root.join("mods");
    let _ = fs::create_dir_all(&mods_dir);

    let raw_fn = path.file_name().unwrap_or_default().to_string_lossy().to_string();
    let ext = path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    if ext == "zip" {
        // Zip Extraction Logic
        let zip_file = fs::File::open(path).map_err(|e| format!("Open zip failed: {}", e))?;
        let mut archive = zip::ZipArchive::new(zip_file).map_err(|e| format!("Read zip failed: {}", e))?;
        
        let mut extracted_count = 0;
        for i in 0..archive.len() {
            let mut entry = match archive.by_index(i) {
                Ok(e) => e,
                Err(_) => continue,
            };
            let entry_name = entry.name().to_string();
            if entry_name.ends_with('/') { continue; }
            if entry_name.to_lowercase().ends_with(".pak") {
                let entry_path = std::path::Path::new(&entry_name);
                let pak_filename = entry_path.file_name().unwrap_or(std::ffi::OsStr::new(&entry_name)).to_string_lossy().to_string();
                let pak_stem = std::path::Path::new(&pak_filename).file_stem().unwrap_or(std::ffi::OsStr::new(&pak_filename)).to_string_lossy().to_string();
                let short_title: String = safe_title.chars().take(20).collect();
                let sub_folder_name = sanitize_folder_name(&format!("{} - {} - {}", short_title, extracted_count, pak_stem));
                let sub_folder = mods_dir.join(&sub_folder_name);
                let base_assets = sub_folder.join("assets");
                let _ = fs::create_dir_all(&base_assets);
                
                let dest = base_assets.join(&pak_filename);
                if let Ok(mut outfile) = fs::File::create(&dest) {
                    if std::io::copy(&mut entry, &mut outfile).is_ok() {
                        extracted_count += 1;
                        let clean_title = mod_title.split(" - ").next().unwrap_or(mod_title).trim();
                        let mut mod_info = serde_json::json!({
                            "id": format!("{}-{}-{}-{}", source_id.to_lowercase(), short_title, extracted_count, pak_stem).replace(" ", "_").replace("/", "_").replace("\\", "_"),
                            "name": format!("{} - {}", clean_title, pak_stem),
                            "author": mod_author,
                            "version": "1.0",
                            "category": source_id,
                            "character": "Unknown",
                            "active": false,
                            "folder_path": sub_folder.to_string_lossy(),
                            "modified_files": [],
                            "created_at": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs(),
                        });
                        if let Some(url) = source_url {
                            mod_info.as_object_mut().unwrap().insert("url".to_string(), serde_json::json!(url));
                        }
                        let _ = fs::write(sub_folder.join("modinfo.json"), serde_json::to_string_pretty(&mod_info).unwrap_or_default());
                    }
                }
            }
        }
        let _ = fs::remove_file(path);
        Ok(format!("Installed {} ({} files split)", mod_title, extracted_count))
    } else if ext == "rar" || ext == "7z" {
        // Rar / 7z Extraction Logic using WinRAR
        let temp_extract_dir = project_root.join("cache").join("temp_extract");
        let _ = fs::create_dir_all(&temp_extract_dir);
        
        match extract_with_winrar(path, &temp_extract_dir, true) {
            Ok(paks) => {
                let mut extracted_count = 0;
                for pak_name_rel in paks {
                    let pak_rel_path = std::path::Path::new(&pak_name_rel);
                    let pak_filename = pak_rel_path.file_name().unwrap_or_default().to_string_lossy().to_string();
                    let pak_stem = std::path::Path::new(&pak_filename).file_stem().unwrap_or_default().to_string_lossy().to_string();
                    let short_title: String = safe_title.chars().take(20).collect();
                    let sub_folder_name = sanitize_folder_name(&format!("{} - {} - {}", short_title, extracted_count, pak_stem));
                    let sub_folder = mods_dir.join(&sub_folder_name);
                    let base_assets = sub_folder.join("assets");
                    let _ = fs::create_dir_all(&base_assets);
                    
                    let src_path = temp_extract_dir.join(&pak_name_rel);
                    let dest_path = base_assets.join(&pak_filename);
                    if fs::copy(&src_path, &dest_path).is_ok() {
                        extracted_count += 1;
                        let clean_title = mod_title.split(" - ").next().unwrap_or(mod_title).trim();
                        let mut mod_info = serde_json::json!({
                            "id": format!("{}-{}-{}-{}", source_id.to_lowercase(), short_title, extracted_count, pak_stem).replace(" ", "_").replace("/", "_").replace("\\", "_"),
                            "name": format!("{} - {}", clean_title, pak_stem),
                            "author": mod_author,
                            "version": "1.0",
                            "category": source_id,
                            "character": "Unknown",
                            "active": false,
                            "folder_path": sub_folder.to_string_lossy(),
                            "modified_files": [],
                            "created_at": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs(),
                        });
                        if let Some(url) = source_url {
                            mod_info.as_object_mut().unwrap().insert("url".to_string(), serde_json::json!(url));
                        }
                        let _ = fs::write(sub_folder.join("modinfo.json"), serde_json::to_string_pretty(&mod_info).unwrap_or_default());
                    }
                }
                let _ = fs::remove_dir_all(&temp_extract_dir);
                let _ = fs::remove_file(path);
                Ok(format!("Installed {} ({} files split)", mod_title, extracted_count))
            }
            Err(e) => {
                let _ = fs::remove_file(path);
                Err(e)
            }
        }
    } else {
        // Single file (.pak, etc.) logic
        let mod_folder = mods_dir.join(&safe_title);
        let base_assets = mod_folder.join("assets");
        let _ = fs::create_dir_all(&base_assets);
        let dest = base_assets.join(&raw_fn);
        fs::copy(path, &dest).map_err(|e| format!("Copy failed: {}", e))?;
        let _ = fs::remove_file(path);

        let mut mod_info = serde_json::json!({
            "id": format!("{}-{}", source_id.to_lowercase(), safe_title),
            "name": mod_title,
            "author": mod_author,
            "version": "1.0",
            "category": source_id,
            "character": "Unknown",
            "active": false,
            "folder_path": mod_folder.to_string_lossy(),
            "modified_files": [],
            "created_at": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs(),
        });
        if let Some(url) = source_url {
            mod_info.as_object_mut().unwrap().insert("url".to_string(), serde_json::json!(url));
        }
        let _ = fs::write(mod_folder.join("modinfo.json"), serde_json::to_string_pretty(&mod_info).unwrap_or_default());

        Ok(format!("Installed {}", mod_title))
    }
}

/// Download a mod file (.pak/.zip/.rar) from an arbitrary URL and install into the mods folder.
#[tauri::command]
async fn download_url_mod(
    url: String,
    file_name: Option<String>,
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
    let request = client.get(&url);

    let response = request.send().await.map_err(|e| format!("Download failed: {}", e))?;
    if !response.status().is_success() {
        return Err(format!("Download HTTP error: {}", response.status()));
    }

    // Extract filename from content-disposition, URL, or provided file_name
    let cd = response.headers()
        .get("content-disposition")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let final_url = response.url().as_str();
    let url_filename = final_url.split('/').last().unwrap_or("mod_file").split('?').next().unwrap_or("mod_file");
    
    let mut raw_fn = if let Some(fn_override) = file_name {
        fn_override
    } else if cd.contains("filename=") {
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

    // Just delegate to extract_and_install_mod for extraction and folder creation
    extract_and_install_mod(&temp_path, &specific_title, &mod_author, "Nexus", Some(&url))
}


#[tauri::command]
fn install_local_mods(file_paths: Vec<String>) -> Result<String, String> {
    let mut installed_mods = Vec::new();
    let mut errors = Vec::new();

    for file_path in file_paths {
        let path = Path::new(&file_path);
        if !path.exists() {
            errors.push(format!("{}: file not found", file_path));
            continue;
        }

        let file_name = match path.file_name().and_then(|s| s.to_str()) {
            Some(name) => name,
            None => {
                errors.push(format!("{}: invalid name", file_path));
                continue;
            }
        };

        let base_fn = path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(file_name)
            .to_string();

        let safe_title = sanitize_folder_name(&base_fn);
        let safe_title = if safe_title.is_empty() { "Imported_Mod".to_string() } else { safe_title };

        // Copy local file to a temp file because extract_and_install_mod will delete it!
        let project_root = get_data_dir();
        let temp_dir = project_root.join("cache").join("downloads");
        let _ = fs::create_dir_all(&temp_dir);
        let temp_path = temp_dir.join(file_name);
        if let Err(e) = fs::copy(&path, &temp_path) {
            errors.push(format!("{}: failed to copy to temp ({})", file_name, e));
            continue;
        }

        match extract_and_install_mod(&temp_path, &safe_title, "Local Import", "Local", None) {
            Ok(msg) => installed_mods.push(msg),
            Err(e) => errors.push(format!("{}: {}", file_name, e)),
        }
    }

    if installed_mods.is_empty() && !errors.is_empty() {
        return Err(format!("Failed to install mods:\n{}", errors.join("\n")));
    }

    let mut result_msg = String::new();
    if !installed_mods.is_empty() {
        result_msg.push_str(&format!("Installed {} mod(s):\n{}", installed_mods.len(), installed_mods.join("\n")));
    }
    if !errors.is_empty() {
        if !result_msg.is_empty() {
            result_msg.push_str("\n\n");
        }
        result_msg.push_str(&format!("Warnings/Errors:\n{}", errors.join("\n")));
    }

    Ok(result_msg)
}

#[tauri::command]
async fn open_discord_login(app: tauri::AppHandle) -> Result<(), String> {
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

#[tauri::command]
fn rename_mod(id: String, new_name: String) -> Result<(), String> {
    let modinfo_path = get_data_dir().join("mods").join(&id).join("modinfo.json");
    if !modinfo_path.exists() { return Err("Mod not found".to_string()); }
    
    let content = fs::read_to_string(&modinfo_path).map_err(|e| e.to_string())?;
    let mut json: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    
    if let Some(obj) = json.as_object_mut() {
        obj.insert("name".to_string(), serde_json::json!(new_name));
    }
    
    fs::write(&modinfo_path, serde_json::to_string_pretty(&json).unwrap_or_default()).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_mod(id: String) -> Result<(), String> {
    let mod_dir = get_data_dir().join("mods").join(&id);
    if mod_dir.exists() { fs::remove_dir_all(mod_dir).map_err(|e| e.to_string())?; }
    Ok(())
}

#[tauri::command]
fn restore_to_default(game_path: Option<String>) -> Result<(), String> {
    let project_root = get_data_dir();
    let mods_dir = project_root.join("mods");
    if mods_dir.exists() {
        let _ = fs::remove_dir_all(&mods_dir);
    }
    
    let actual_game_path = game_path.or_else(|| get_mhur_paks_path().ok());
    if let Some(ref path) = actual_game_path {
        let target_dir = std::path::Path::new(path).join("~mods");
        if target_dir.exists() {
            let _ = fs::remove_dir_all(&target_dir);
        }
    }
    Ok(())
}

use std::path::PathBuf;

#[tauri::command]
async fn get_costumes(game_path: String, character_id: String) -> Result<Vec<serde_json::Value>, String> {
    let app_dir = get_data_dir().join("cache");
    
    if character_id.is_empty() {
        return Err("Character ID is empty.".into());
    }
    
    let tools_dir = get_tools_dir();
    let assets_dir = app_dir.join("assets").join(&character_id);
    
    // Create assets directory
    let _ = std::fs::create_dir_all(&assets_dir);

    let repak_path = tools_dir.join("repak.exe");
    let python_exe = tools_dir.join("python").join("python.exe");
    let ue4dds_script = tools_dir.join("main.py");
    let ffmpeg_path = tools_dir.join("ffmpeg.exe");
    
    let aes_key = "0x332F41B1130F125444A35F420EC6D05EA3E27A972A36DAD90C83FC6958D941C7";
    
    // Construct the actual path to the game's main .pak file safely
    let mut pak_file_path = std::path::PathBuf::from(&game_path);
    if !pak_file_path.to_string_lossy().ends_with(".pak") {
        if pak_file_path.ends_with("Paks") {
            pak_file_path = pak_file_path.join("HerovsGame-WindowsNoEditor.pak");
        } else {
            pak_file_path = pak_file_path.join("HerovsGame").join("Content").join("Paks").join("HerovsGame-WindowsNoEditor.pak");
        }
    }
        
    if !pak_file_path.exists() {
        return Err(format!("Could not find the game .pak file at {}", pak_file_path.display()));
    }
    
    // 1. Unpack Costume UI Images for the specific character
    let _ = Command::new(&repak_path)
        .arg("--aes-key")
        .arg(aes_key)
        .arg("unpack")
        .arg("-o")
        .arg(&assets_dir)
        .arg("-i")
        .arg(format!("**/{}/GUI/Costume/L/*0_*L.*", character_id))
        .arg(&pak_file_path)
        .output();
        
    // 2. Unpack PA_ChXXX.uasset
    let _ = Command::new(&repak_path)
        .arg("--aes-key")
        .arg(aes_key)
        .arg("unpack")
        .arg("-o")
        .arg(&assets_dir)
        .arg("-i")
        .arg(format!("**/{}/PA_{}.*", character_id, character_id))
        .arg(&pak_file_path)
        .output();
        
    let char_dir = assets_dir.join("HerovsGame").join("Content").join("Character").join(&character_id);
    let gui_path = char_dir.join("GUI").join("Costume").join("L");
    let pa_uasset = char_dir.join(format!("PA_{}.uasset", character_id));
    
    // Convert all uasset images to png
    if gui_path.exists() {
        if let Ok(entries) = std::fs::read_dir(&gui_path) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) == Some("uasset") {
                    let tga_path = path.with_extension("tga");
                    let png_path = path.with_extension("png");
                    if !tga_path.exists() && !png_path.exists() {
                        let _ = Command::new(&python_exe)
                            .arg(&ue4dds_script)
                            .arg(&path)
                            .arg(format!("--save_folder={}", gui_path.display()))
                            .arg("--mode=export")
                            .arg("--export_as=tga")
                            .arg("--skip_non_texture")
                            .output();
                    }
                    if tga_path.exists() && !png_path.exists() {
                        let _ = Command::new(&ffmpeg_path).arg("-i").arg(&tga_path).arg(&png_path).output();
                        let _ = std::fs::remove_file(&tga_path);
                    }
                }
            }
        }
    }
    
    let mut costumes = Vec::new();
    
    if pa_uasset.exists() {
        // Run UEJSON to export to json
        let _ = Command::new(&tools_dir.join("UEJSON.exe"))
            .arg("-e")
            .arg(&pa_uasset)
            .creation_flags(0x08000000)
            .output();
            
        let json_path = pa_uasset.with_extension("json");
        if let Ok(content) = std::fs::read_to_string(&json_path) {
            if let Ok(data) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(exports) = data.get("Exports").and_then(|e| e.as_array()) {
                    if let Some(first_export) = exports.first() {
                        if let Some(data_arr) = first_export.get("Data").and_then(|d| d.as_array()) {
                            // Find _costumeMeshs
                            let mut skins_array = None;
                            for value in data_arr {
                                if value.get("Name").and_then(|n| n.as_str()) == Some("_costumeMeshs") {
                                    skins_array = value.get("Value").and_then(|v| v.as_array());
                                    break;
                                }
                            }
                            
                            if let Some(skins) = skins_array {
                                for skin_entry in skins {
                                    // skin_entry is an array
                                    if let Some(arr) = skin_entry.as_array() {
                                        if arr.len() >= 2 {
                                            // Extract skin_id (e.g. 13001100)
                                            let skin_id_val = &arr[0]["Value"];
                                            let skin_id = if skin_id_val.is_number() {
                                                skin_id_val.as_i64().unwrap_or(0).to_string()
                                            } else {
                                                skin_id_val.as_str().unwrap_or("").to_string()
                                            };
                                            
                                            // Extract AssetName
                                            if let Some(asset_name) = arr[1].get("Value").and_then(|v| v.get("AssetPath")).and_then(|a| a.get("AssetName")).and_then(|n| n.as_str()) {
                                                // format: /Game/Character/Ch102/Model/Eq/D1_00/Mesh/SK_Ch102_EqD1_00...
                                                // Extract slot from path
                                                let mut slot_id = "Default".to_string();
                                                let mut display_name = "Default Costume".to_string();
                                                
                                                if let Some(model_idx) = asset_name.find("/Model/") {
                                                    let after_model = &asset_name[model_idx + 7..];
                                                    if let Some(mesh_idx) = after_model.find("/Mesh/") {
                                                        let extracted_slot = &after_model[..mesh_idx];
                                                        
                                                        if extracted_slot != "Default" {
                                                            slot_id = extracted_slot.replace('/', "_");
                                                            
                                                            // Beautify display name
                                                            if slot_id.starts_with("Costume_") {
                                                                display_name = format!("Costume {}", &slot_id[8..]);
                                                            } else if slot_id.starts_with("Eq_") || slot_id.starts_with("Sp_") {
                                                                display_name = format!("Special Costume {}", &slot_id[3..]);
                                                            } else {
                                                                display_name = slot_id.clone();
                                                            }
                                                        }
                                                    }
                                                }
                                                
                                                // Find matching image
                                                let mut final_png = String::new();
                                                if let Ok(png_entries) = std::fs::read_dir(&gui_path) {
                                                    for png_entry in png_entries.flatten() {
                                                        let p = png_entry.path();
                                                        if p.extension().and_then(|s| s.to_str()) == Some("png") {
                                                            let name = p.file_name().unwrap().to_string_lossy();
                                                            if name.contains(&skin_id) {
                                                                final_png = p.to_string_lossy().to_string();
                                                                break;
                                                            }
                                                        }
                                                    }
                                                }
                                                
                                                if !final_png.is_empty() {
                                                    costumes.push(serde_json::json!({
                                                        "id": slot_id,
                                                        "name": display_name,
                                                        "imagePath": final_png
                                                    }));
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Deduplicate by slot_id (just in case)
    let mut unique_costumes = std::collections::HashSet::new();
    costumes.retain(|c| {
        if let Some(id) = c["id"].as_str() {
            unique_costumes.insert(id.to_string())
        } else {
            false
        }
    });

    // Sort so Default is first
    costumes.sort_by(|a, b| {
        let a_id = a["id"].as_str().unwrap_or("");
        let b_id = b["id"].as_str().unwrap_or("");
        if a_id == "Default" { std::cmp::Ordering::Less }
        else if b_id == "Default" { std::cmp::Ordering::Greater }
        else { a_id.cmp(b_id) }
    });

    if costumes.is_empty() {
        return Err("No costumes found or extraction failed.".into());
    }

    Ok(costumes)
}

#[tauri::command]
async fn swap_skin_slot(mod_id: String, mod_path: String, target_slot: String) -> Result<String, String> {
    let project_root = get_data_dir();
    let tools_dir = get_tools_dir();
    
    let python_exe = tools_dir.join("python").join("python.exe");
    let engine_script = tools_dir.join("SkinSwapperEngine.py");
    let uejson_path = tools_dir.join("UEJSON.exe");
    let repak_exe = tools_dir.join("repak.exe");
    let unrealpak_exe = tools_dir.join("UnrealPak.exe");
    
    let python_exe = if python_exe.exists() { python_exe } else { std::path::PathBuf::from("python") };

    if !engine_script.exists() || !uejson_path.exists() || !repak_exe.exists() || !unrealpak_exe.exists() {
        return Err("Missing required tools for skin swapping (repak, UnrealPak, UEJSON, etc).".into());
    }
    
    let assets_dir = Path::new(&mod_path).join("assets");
    let mut pak_file = None;
    if let Ok(entries) = fs::read_dir(&assets_dir) {
        for entry in entries.flatten() {
            if entry.path().extension().and_then(|s| s.to_str()) == Some("pak") {
                pak_file = Some(entry.path());
                break;
            }
        }
    }
    
    let pak_file = pak_file.ok_or("No .pak file found in mod assets")?;
    
    let time_num = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
    let temp_dir = project_root.join(format!("cache/temp_swap_{}", time_num));
    if temp_dir.exists() { let _ = fs::remove_dir_all(&temp_dir); }
    fs::create_dir_all(&temp_dir).map_err(|e| format!("Temp dir error: {}", e))?;
    
    // 1. Unpack with repak
    let output = Command::new(&repak_exe)
        .arg("unpack")
        .arg("-o")
        .arg(&temp_dir)
        .arg(&pak_file)
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| format!("repak failed: {}", e))?;
        
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        let _ = fs::remove_dir_all(&temp_dir);
        return Err(format!("Failed to unpack: {}", err));
    }
    
    // 2. Run Python Engine on the extracted folder
    let output = Command::new(&python_exe)
        .arg(&engine_script)
        .arg(&temp_dir)
        .arg(&target_slot)
        .arg(&uejson_path)
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| {
            let _ = fs::remove_dir_all(&temp_dir);
            format!("SkinSwapperEngine failed: {}", e)
        })?;
        
    let stdout = String::from_utf8_lossy(&output.stdout);
    if !output.status.success() || stdout.contains("Error:") {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        let _ = fs::remove_dir_all(&temp_dir);
        return Err(format!("Engine error: {}\n{}", stdout, err));
    }
    
    // 3. Repack with UnrealPak
    let new_pak = temp_dir.join("repacked.pak");
    let unrealpak_txt = temp_dir.join("unrealpak.txt");
    let temp_dir_abs = temp_dir.canonicalize().unwrap_or(temp_dir.clone());
    let clean_path = temp_dir_abs.to_string_lossy().trim_start_matches(r#"\\?\"#).to_string();
    
    let txt_content = format!("\"{}\\*.*\" \"..\\..\\..\\*.*\"", clean_path);
    fs::write(&unrealpak_txt, txt_content).map_err(|e| format!("unrealpak.txt error: {}", e))?;
    
    let output = Command::new(&unrealpak_exe)
        .arg(&new_pak)
        .arg(format!("-create={}", unrealpak_txt.to_string_lossy()))
        .arg("-compress")
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| {
            let _ = fs::remove_dir_all(&temp_dir);
            format!("UnrealPak failed: {}", e)
        })?;
        
    if !output.status.success() || !new_pak.exists() {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        let _ = fs::remove_dir_all(&temp_dir);
        return Err(format!("Failed to repack: {}", err));
    }
    
    // 4. Backup & Overwrite
    let backup_file = pak_file.with_extension("pak.bak");
    if !backup_file.exists() {
        let _ = fs::copy(&pak_file, &backup_file);
    }
    
    fs::copy(&new_pak, &pak_file).map_err(|e| format!("Failed to overwrite pak: {}", e))?;
    let _ = fs::remove_dir_all(&temp_dir);
    
    // 5. Invalidate cache
    let cache_path = get_data_dir().join("cache/character_scan_cache.json");
    if let Ok(content) = fs::read_to_string(&cache_path) {
        if let Ok(mut json) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(obj) = json.as_object_mut() {
                let lower_mod_id = mod_id.to_lowercase();
                obj.retain(|k, _| !k.to_lowercase().contains(&lower_mod_id));
                let _ = fs::write(cache_path, serde_json::to_string_pretty(&obj).unwrap_or_default());
            }
        }
    }

    Ok(format!("Successfully swapped {} to slot {}", mod_id, target_slot))
}

#[tauri::command]
fn open_mod_folder(id: String) -> Result<(), String> {
    let mod_dir = get_data_dir().join("mods").join(&id);
    if !mod_dir.exists() { return Err("Mod not found".to_string()); }
    
    #[cfg(target_os = "windows")]
    {
        let path = mod_dir.to_string_lossy().replace(r#"\\?\"#, "");
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

use tauri::{tray::TrayIconBuilder, menu::{Menu, MenuItem}, Manager, State};
use std::sync::atomic::{AtomicBool, Ordering};

struct AppState {
    minimize_to_tray: AtomicBool,
}

#[tauri::command]
fn set_minimize_to_tray(enabled: bool, state: State<'_, AppState>) {
    state.minimize_to_tray.store(enabled, Ordering::Relaxed);
}

#[tauri::command]
fn split_mod(mod_id: String) -> Result<String, String> {
    let mods_dir = get_data_dir().join("mods");
    
    // Find the mod folder
    let mut target_folder = None;
    if let Ok(entries) = fs::read_dir(&mods_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let modinfo_path = path.join("modinfo.json");
                if modinfo_path.exists() {
                    if let Ok(content) = fs::read_to_string(&modinfo_path) {
                        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&content) {
                            if parsed["id"].as_str() == Some(&mod_id) {
                                target_folder = Some(path);
                                break;
                            }
                        }
                    }
                }
            }
        }
    }
    
    let folder = target_folder.ok_or_else(|| "Mod folder not found".to_string())?;
    let assets_dir = folder.join("assets");
    if !assets_dir.exists() {
        return Err("No assets folder found to split".into());
    }
    
    let mut paks = Vec::new();
    if let Ok(entries) = fs::read_dir(&assets_dir) {
        for entry in entries.flatten() {
            if entry.path().extension().and_then(|s| s.to_str()) == Some("pak") {
                paks.push(entry.path());
            }
        }
    }
    
    if paks.len() <= 1 {
        return Err("Mod does not contain multiple pak files to split".into());
    }
    
    let original_name = folder.file_name().unwrap_or_default().to_string_lossy().to_string();
    
    let mut created_count = 0;
    for pak_path in paks {
        let pak_name = pak_path.file_stem().unwrap_or_default().to_string_lossy().to_string();
        let new_folder_name = format!("{} - {}", original_name, pak_name);
        let new_folder = mods_dir.join(&new_folder_name);
        let new_assets = new_folder.join("assets");
        
        let _ = fs::create_dir_all(&new_assets);
        
        let dest_pak = new_assets.join(pak_path.file_name().unwrap());
        let _ = fs::copy(&pak_path, &dest_pak);
        
        // Try copying corresponding sig
        let sig_path = pak_path.with_extension("sig");
        if sig_path.exists() {
            let _ = fs::copy(&sig_path, new_assets.join(sig_path.file_name().unwrap()));
        }
        let sig_upper_path = pak_path.with_extension("SIG");
        if sig_upper_path.exists() {
            let _ = fs::copy(&sig_upper_path, new_assets.join(sig_upper_path.file_name().unwrap()));
        }
        
        let mod_info = serde_json::json!({
            "id": format!("nexus-{}", new_folder_name),
            "name": format!("{} - {}", original_name, pak_name),
            "author": "Split Mod",
            "version": "1.0",
            "category": "Split",
            "character": "Unknown",
            "active": false,
            "folder_path": new_folder.to_string_lossy(),
            "modified_files": [],
            "created_at": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs(),
        });
        let _ = fs::write(new_folder.join("modinfo.json"), serde_json::to_string_pretty(&mod_info).unwrap_or_default());
        created_count += 1;
    }
    
    let _ = fs::remove_dir_all(&folder);
    
    Ok(format!("Split into {} individual mods", created_count))
}

#[tauri::command]
fn merge_mods(mod_ids: Vec<String>, new_name: String) -> Result<String, String> {
    if mod_ids.len() < 2 {
        return Err("Need at least 2 mods to merge".into());
    }
    
    let mods_dir = get_data_dir().join("mods");
    
    // Find folders for all mod_ids
    let mut folders_to_merge = Vec::new();
    if let Ok(entries) = fs::read_dir(&mods_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let modinfo_path = path.join("modinfo.json");
                if modinfo_path.exists() {
                    if let Ok(content) = fs::read_to_string(&modinfo_path) {
                        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&content) {
                            if let Some(id) = parsed["id"].as_str() {
                                if mod_ids.contains(&id.to_string()) {
                                    folders_to_merge.push(path);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    if folders_to_merge.is_empty() {
        return Err("No matching mods found".into());
    }
    
    let safe_name = new_name.replace(|c: char| !c.is_alphanumeric() && c != ' ' && c != '-', "_");
    let new_folder = mods_dir.join(&safe_name);
    let new_assets = new_folder.join("assets");
    
    let _ = fs::create_dir_all(&new_assets);
    
    let mut moved_files = 0;
    
    for folder in &folders_to_merge {
        let assets_dir = folder.join("assets");
        if assets_dir.exists() {
            if let Ok(entries) = fs::read_dir(&assets_dir) {
                for entry in entries.flatten() {
                    let file_path = entry.path();
                    if file_path.is_file() {
                        let dest_path = new_assets.join(file_path.file_name().unwrap());
                        if fs::copy(&file_path, &dest_path).is_ok() {
                            moved_files += 1;
                        }
                    }
                }
            }
        }
    }
    
    let mod_info = serde_json::json!({
        "id": format!("nexus-{}", safe_name),
        "name": new_name,
        "author": "Merged Mod",
        "version": "1.0",
        "category": "Merged",
        "character": "Unknown",
        "active": false,
        "folder_path": new_folder.to_string_lossy(),
        "modified_files": [],
        "created_at": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs(),
    });
    let _ = fs::write(new_folder.join("modinfo.json"), serde_json::to_string_pretty(&mod_info).unwrap_or_default());
    
    for folder in &folders_to_merge {
        let _ = fs::remove_dir_all(folder);
    }
    
    Ok(format!("Merged {} mods ({} files)", folders_to_merge.len(), moved_files))
}

#[tauri::command]
async fn get_characters() -> Result<Vec<String>, String> {
    let map = get_characters_map();
    let mut names: Vec<String> = map.values()
        .filter(|v| *v != "All")
        .cloned()
        .collect();
    
    // Sort alphabetically, and deduplicate
    names.sort();
    names.dedup();
    
    // Insert "All" at the beginning
    let mut final_names = vec!["All".to_string()];
    final_names.extend(names);
    
    Ok(final_names)
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
            greet,
            launch_game,
            deploy_mods,
            get_local_mods,
            extract_mod_preview,
            get_mhur_paks_path,
            save_discord_token,
            load_discord_token,
            clear_discord_token,
            validate_discord_token,
            fetch_discord_mods,
            fetch_discord_thread,
            fetch_thread_messages,
            download_discord_mod,
            open_nexus_download,
            open_nexus_login,
            download_url_mod,
            open_discord_login,
            install_local_mods,
            rename_mod,
            delete_mod,
            open_mod_folder,
            swap_skin_slot,
            get_costumes,
            set_minimize_to_tray,
            restore_to_default,
            split_mod,
            merge_mods,
            get_characters
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
