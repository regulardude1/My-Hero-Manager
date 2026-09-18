use std::fs;
use std::path::Path;
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::collections::HashSet;
use std::os::windows::process::CommandExt;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use crate::util::{get_data_dir, get_tools_dir, get_characters_map, load_cache, save_cache};

#[derive(Serialize, Deserialize)]
pub struct ModInfo {
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
    #[serde(default)]
    pub pak_hash: Option<String>,
}

pub fn scan_pak_for_character_and_emote(pak_path: &Path) -> (String, String, Vec<String>) {
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
    let has_mesh = out_str.contains("SkeletalMesh") || out_str.contains("StaticMesh") || out_str.contains("/Mesh/") || out_str.contains("SK_") || out_str.contains("SM_") || out_str.to_lowercase().contains("sk_");
    let has_audio = out_str.contains("SoundWave") || out_str.contains("Dialogue") || out_str.contains("AkMediaAsset") || out_str.contains("/Sound/") || out_str.contains("/Audio/");
    
    let lower_out = out_str.to_lowercase();
    
    // Extract character ID: look for "character/ch" followed by exactly 3 digits
    let mut ch_id = String::new();
    for (i, _) in lower_out.match_indices("character/ch") {
        let after = &lower_out[i + 12..];
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
            if ch_id == "001" && lower_out.contains("ofa") {
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
pub async fn get_local_mods(game_path: Option<String>) -> Result<Vec<ModInfo>, String> {
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
                            
                            let mut cached_entry = cache.get(&cache_key);
                            let v5_key = if let Ok(meta) = fs::metadata(pak_path) {
                                format!("v5|{}|{}|{}", clean_path, meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH).duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs(), meta.len())
                            } else {
                                format!("v5|{}", clean_path)
                            };
                            let v4_key = if let Ok(meta) = fs::metadata(pak_path) {
                                format!("v4|{}|{}|{}", clean_path, meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH).duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs(), meta.len())
                            } else {
                                format!("v4|{}", clean_path)
                            };
                            if cached_entry.is_none() {
                                cached_entry = cache.get(&v5_key);
                            }
                            if cached_entry.is_none() {
                                cached_entry = cache.get(&v4_key);
                            }
                            
                            let has_valid_hash = cached_entry
                                .and_then(|c| c.get("pak_hash"))
                                .and_then(|v| v.as_str())
                                .map(|s| !s.is_empty())
                                .unwrap_or(false);

                            let (ch, cat, files, _pak_hash) = if let (Some(cached), Some(mod_files)) = (cached_entry, cached_entry.and_then(|c| c.get("modified_files").and_then(|v| v.as_array()))) {
                                if has_valid_hash {
                                    (
                                        cached.get("character").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                                        cached.get("category").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                                        mod_files.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect::<Vec<String>>(),
                                        cached.get("pak_hash").and_then(|v| v.as_str()).unwrap_or("").to_string()
                                    )
                                } else {
                                    let ch = cached.get("character").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                    let cat = cached.get("category").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                    let files: Vec<String> = mod_files.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect();
                                    let mut hash_str = String::new();
                                    if let Ok(mut file) = fs::File::open(pak_path) {
                                        use sha2::{Sha256, Digest};
                                        use std::io::Read;
                                        let mut hasher = Sha256::new();
                                        let mut buffer = [0; 8192];
                                        while let Ok(count) = file.read(&mut buffer) {
                                            if count == 0 { break; }
                                            hasher.update(&buffer[..count]);
                                        }
                                        hash_str = hasher.finalize().iter().map(|b| format!("{:02x}", b)).collect();
                                    }
                                    cache.insert(cache_key, serde_json::json!({
                                        "character": ch,
                                        "category": cat,
                                        "modified_files": files,
                                        "pak_hash": hash_str
                                    }));
                                    cache_modified = true;
                                    (ch, cat, files, hash_str)
                                }
                            } else {
                                // Cache miss: check if modinfo.json already has character/category
                                // to avoid blocking on expensive umodel scan
                                let modinfo_char = parsed["character"].as_str().unwrap_or("").to_string();
                                let modinfo_cat = parsed["category"].as_str().unwrap_or("").to_string();
                                let has_modinfo_data = !modinfo_char.is_empty() && modinfo_char != "Other" && modinfo_char != "All" && modinfo_char != "Unknown";
                                
                                if has_modinfo_data {
                                    // Use modinfo data, skip expensive scan - cache will rebuild next time
                                    (modinfo_char, modinfo_cat, Vec::new(), String::new())
                                } else {
                                    let (ch, cat, files) = scan_pak_for_character_and_emote(pak_path);
                                    let mut hash_str = String::new();
                                    if let Ok(mut file) = fs::File::open(pak_path) {
                                        use sha2::{Sha256, Digest};
                                        use std::io::Read;
                                        let mut hasher = Sha256::new();
                                        let mut buffer = [0; 8192];
                                        while let Ok(count) = file.read(&mut buffer) {
                                            if count == 0 { break; }
                                            hasher.update(&buffer[..count]);
                                        }
                                        hash_str = hasher.finalize().iter().map(|b| format!("{:02x}", b)).collect();
                                    }
                                    cache.insert(cache_key, serde_json::json!({
                                        "character": ch,
                                        "category": cat,
                                        "modified_files": files,
                                        "pak_hash": hash_str
                                    }));
                                    cache_modified = true;
                                    (ch, cat, files, hash_str)
                                }
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

                        // Update modinfo.json if we found better character or category data
                        let modinfo_char = parsed["character"].as_str().unwrap_or("").to_string();
                        let modinfo_cat = parsed["category"].as_str().unwrap_or("").to_string();
                        
                        let char_improved = character != "Unknown" && character != "Other" && !character.is_empty() && modinfo_char != character;
                        let cat_improved = category != "Other" && !category.is_empty() && modinfo_cat != category;

                        if char_improved || cat_improved {
                            let mut updated_parsed = parsed.clone();
                            if let Some(obj) = updated_parsed.as_object_mut() {
                                if char_improved {
                                    obj.insert("character".to_string(), serde_json::Value::String(character.clone()));
                                }
                                if cat_improved {
                                    obj.insert("category".to_string(), serde_json::Value::String(category.clone()));
                                }
                                if let Ok(new_content) = serde_json::to_string_pretty(&updated_parsed) {
                                    let _ = fs::write(&modinfo_path, new_content);
                                }
                            }
                        }

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
                            pak_hash: {
                                // Find the first non-empty hash from target_pak_paths
                                let mut final_hash = None;
                                for pak_path in &target_pak_paths {
                                    let clean_path = pak_path.to_string_lossy().replace(r#"\\?\"#, "").to_lowercase();
                                    let cache_key = if let Ok(meta) = fs::metadata(pak_path) {
                                        format!("v6|{}|{}|{}", clean_path, meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH).duration_since(std::time::UNIX_EPOCH).unwrap().as_secs(), meta.len())
                                    } else {
                                        format!("v6|{}", clean_path)
                                    };
                                    if let Some(cached) = cache.get(&cache_key) {
                                        if let Some(hash) = cached.get("pak_hash").and_then(|v| v.as_str()) {
                                            if !hash.is_empty() {
                                                final_hash = Some(hash.to_string());
                                                break;
                                            }
                                        }
                                    }
                                }
                                final_hash
                            }
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
pub fn deploy_mods(game_path: String, active_mod_paths: Vec<String>) -> Result<String, String> {
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
pub fn get_mhur_paks_path() -> Result<String, String> {
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
pub fn launch_game() -> Result<String, String> {
    use std::process::Command;
    match Command::new("cmd").args(["/C", "start", "steam://rungameid/1607250"]).spawn() {
        Ok(_) => Ok("Game launched successfully!".into()),
        Err(e) => Err(format!("Failed to launch game: {}", e)),
    }
}

/// Extract bundled emote audio (e.g. a dance song) from the mod's .pak into
/// `out_dir/emote_audio.ogg`.
///
/// Emote paks carry the track as a UE4 `SoundWave` asset: the .uasset header
/// names the class, and the .uexp payload embeds the raw OGG Vorbis stream
/// right after a small serialized-property header. We scan the pak for the
/// first SoundWave .uexp, cut the stream at the "OggS" magic and save it —
/// the webview plays OGG natively, so no re-encoding is needed. Returns the
/// written .ogg path, or None when the pak has no playable audio.
pub fn extract_emote_audio(
    repak: &Path,
    pak: &Path,
    aes_key: &str,
    out_dir: &Path,
) -> Option<std::path::PathBuf> {
    use std::process::Command;
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    // repak subcommand runner: full argument list (order matters: `get <pak> <file>`),
    // returns stdout bytes.
    let pak_str = pak.to_string_lossy().to_string();
    let repak_run = |args: &[String]| -> Option<Vec<u8>> {
        let out = Command::new(repak)
            .arg("-a").arg(aes_key)
            .args(args)
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .ok()
            .filter(|o| o.status.success())?;
        Some(out.stdout)
    };

    let listing_bytes = repak_run(&["list".to_string(), pak_str.clone()])?;
    let listing = String::from_utf8_lossy(&listing_bytes).to_string();

    // Candidate SoundWave .uexp entries. The game stores emote music under
    // Content/CustomNotifys/Songs/ — prefer those, then any other .uexp.
    let mut cands: Vec<String> = listing.lines()
        .map(|l| l.trim().to_string())
        .filter(|l| l.to_ascii_lowercase().ends_with(".uexp"))
        .collect();
    cands.sort_by_key(|l| !l.to_ascii_lowercase().contains("/songs/"));

    for exp in cands.iter().take(8) {
        let asset = format!("{}.uasset", &exp[..exp.len() - ".uexp".len()]);
        let asset_bytes = match repak_run(&["get".to_string(), pak_str.clone(), asset]) {
            Some(b) => b, None => continue,
        };
        if !String::from_utf8_lossy(&asset_bytes).to_string().contains("SoundWave") {
            continue; // not a sound asset (animation/mesh/etc.)
        }
        let exp_bytes = match repak_run(&["get".to_string(), pak_str.clone(), exp.clone()]) {
            Some(b) => b, None => continue,
        };
        let ogg_start = match exp_bytes.windows(4).position(|w| w == b"OggS") {
            Some(i) => i, None => continue, // non-OGG codec — skip
        };
        let ogg = &exp_bytes[ogg_start..];
        if ogg.len() < 4096 {
            continue; // too small to be a real track
        }
        let out = out_dir.join("emote_audio.ogg");
        match std::fs::write(&out, ogg) {
            Ok(()) => {
                eprintln!("[extract] Emote audio: {} ({} bytes)", out.display(), ogg.len());
                return Some(out);
            }
            Err(e) => eprintln!("[extract] Failed to write emote audio: {}", e),
        }
    }
    None
}

#[tauri::command]
pub fn extract_mod_preview(mod_id: String, folder_path: String) -> Result<String, String> {
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
        return Ok(refresh_standalone(cached).to_string_lossy().to_string());
    }
    
    // Also check the old cache location (src-tauri/cache) for backwards compat
    let base_dir = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    let alt_cache = base_dir.join("cache").join("models").join(&mod_id);
    if alt_cache != cache_dir {
        if let Some(cached) = find_gltf(&alt_cache) {
            return Ok(refresh_standalone(cached).to_string_lossy().to_string());
        }
    }
    
    // Emote cache hit: a prior extraction left .psk and/or .md5anim in the
    // cache dir (either one is enough — "over"-style emote mods may bundle
    // only one of the two)
    {
        let mut psk: Option<(std::path::PathBuf, u64)> = None;
        let mut anim: Option<(std::path::PathBuf, u64)> = None;
        find_largest(&cache_dir, "psk", &mut psk);
        find_largest(&alt_cache, "psk", &mut psk);
        find_largest(&cache_dir, "md5anim", &mut anim);
        find_largest(&alt_cache, "md5anim", &mut anim);
        if psk.is_some() || anim.is_some() {
            let psk_s = psk.map(|(p, _)| p.to_string_lossy().to_string()).unwrap_or_default();
            let anim_s = anim.map(|(a, _)| a.to_string_lossy().to_string()).unwrap_or_default();
            // Audio (emote_audio.ogg) is committed alongside the skeleton at
            // extraction time; caches from before audio support have none.
            let mut audio: Option<(std::path::PathBuf, u64)> = None;
            find_largest(&cache_dir, "ogg", &mut audio);
            find_largest(&alt_cache, "ogg", &mut audio);
            // Backfill: the mod's pak is still on disk, so extract the audio
            // now and store it in the cache dir for future hits.
            if audio.is_none() {
                let repak_exe = tools_dir.join("repak.exe");
                let aes_key = "0x332F41B1130F125444A35F420EC6D05EA3E27A972A36DAD90C83FC6958D941C7";
                if repak_exe.exists() {
                    if let Ok(entries) = std::fs::read_dir(folder.join("assets")) {
                        for entry in entries.flatten() {
                            let path = entry.path();
                            let ext = path.extension().and_then(|s| s.to_str());
                            if ext == Some("pak") || ext == Some("pak_") {
                                if let Some(a) = extract_emote_audio(&repak_exe, &path, aes_key, &cache_dir) {
                                    audio = Some((a, 0));
                                }
                                break; // first pak, matching the extraction logic
                            }
                        }
                    }
                }
            }
            let audio_s = audio.map(|(a, _)| a.to_string_lossy().to_string()).unwrap_or_default();
            eprintln!("[extract] Emote cache hit: psk=\"{}\" anim=\"{}\" audio=\"{}\"", psk_s, anim_s, audio_s);
            return Ok(format!("EMOTE::{}|{}|{}", psk_s, anim_s, audio_s));
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
    
    // fmt_flags: umodel output-format flags for this pass, e.g.
    //   ["-png", "-gltf"]   -> glTF model pass (skin/mesh mods)
    //   ["-psk",  "-notex"] -> skeleton .psk pass (emote mods; true bone parenting)
    //   ["-md5",  "-notex"] -> .md5anim frames pass (emote mods)
    // NOTE: a single "-psk -md5" pass does NOT work — umodel picks .md5mesh for
    // the mesh and the two format flags conflict; the emote path runs two passes.
    // with_anim: emote passes must NOT pass -noanim (UE4 AnimSequence loading
    // must stay enabled); glTF passes keep the old -noanim behavior.
    let run_umodel = |temp_pak_dir: &str, fmt_flags: &[&str], with_anim: bool| -> bool {
        let mut cmd = Command::new(&umodel_exe);
        cmd.current_dir(&tools_dir)
            .arg("-game=ue4.27")
            .arg(format!("-path={}", temp_pak_dir))
            .arg(format!("-aes={}", aes_key));
        if !with_anim {
            cmd.arg("-noanim");
        }
            
        for f in fmt_flags {
            cmd.arg(*f);
        }

        let result = cmd.arg("-nooverwrite")
            .arg("-export")
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
                eprintln!("[extract] umodel exit={}, flags={:?}, stdout_len={}, stderr_len={}",
                    output.status, fmt_flags, stdout.len(), stderr.len());
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

    // Find the largest file with a given extension under a dir (recursive).
    // Preferring the largest .psk picks the character skeleton over any small
    // helper assets.
    fn find_largest(dir: &Path, ext: &str, out: &mut Option<(std::path::PathBuf, u64)>) {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    find_largest(&path, ext, out);
                } else if path.extension().and_then(|s| s.to_str()) == Some(ext) {
                    if let Ok(size) = path.metadata().and_then(|m| Ok(m.len())) {
                        match out {
                            None => *out = Some((path, size)),
                            Some((_, cur)) if size > *cur => *out = Some((path, size)),
                            _ => {}
                        }
                    }
                }
            }
        }
    }

    // Global base character skeleton library (uasset/uexp). Most
    // "over"-style emote paks bundle ONLY the AnimSequence — the skeleton
    // comes from the base game. umodel can only export the .md5anim when the
    // skeleton's loose files sit next to the pak, so we inject them from a
    // shared library. Candidate locations cover dev and packaged builds.
    let base_skeleton_dirs: Vec<std::path::PathBuf> = {
        let mut v = Vec::new();
        for base in [
            tools_dir.clone(),
            project_root.clone(),
            std::env::current_dir().unwrap_or_default(),
        ] {
            for cand in [base.join("base_character_skeleton"), base.join("tools").join("base_character_skeleton")] {
                if cand.is_dir() && !v.contains(&cand) {
                    v.push(cand);
                }
            }
        }
        v
    };
    eprintln!("[extract] base_skeleton dirs: {:?}", base_skeleton_dirs);

    // Stage a fresh temp dir for umodel: the pak (as extract.pak) plus the
    // loose base skeleton files. Global library first (so emote paks that
    // don't bundle a skeleton can still resolve their import), then the mod's
    // own assets/ (mod files win on name conflicts).
    let stage_umodel_dir = |dir: &Path| {
        let _ = fs::create_dir_all(dir);
        let staged = dir.join("extract.pak");
        if std::fs::hard_link(&pak_file, &staged).is_err() {
            let _ = std::fs::copy(&pak_file, &staged);
        }
        for src_dir in base_skeleton_dirs.iter().chain(std::iter::once(&assets_dir)) {
            if let Ok(entries) = fs::read_dir(src_dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_file()
                        && matches!(
                            p.extension().and_then(|s| s.to_str()).map(|e| e.to_ascii_lowercase()).as_deref(),
                            Some("uasset") | Some("uexp")
                        )
                    {
                        let dest = dir.join(p.file_name().unwrap_or_default());
                        let _ = std::fs::copy(&p, &dest);
                    }
                }
            }
        }
    };

    // ---- EMOTE PASS FIRST --------------------------------------------------
    // Emote mods (AnimSequence paks) contain no StaticMesh, so the glTF pass
    // would produce nothing. Try the skeleton path first; it succeeds only
    // when the pak actually bundles a character skeleton. Two passes are
    // required: -psk and -md5 in one pass conflict (umodel silently drops the
    // .psk/.md5anim and emits .md5mesh instead), so run them separately.
    let emote_dir = project_root.join(format!("cache/temp_extract_emote_{}", time_num));
    stage_umodel_dir(&emote_dir);
    let _psk_pass = run_umodel(&emote_dir.to_string_lossy(), &["-psk", "-notex"], true);
    let _md5_pass = run_umodel(&emote_dir.to_string_lossy(), &["-md5", "-notex"], true);

    let mut static_psk: Option<std::path::PathBuf> = None;
    {
        let mut psk: Option<(std::path::PathBuf, u64)> = None;
        let mut anim: Option<(std::path::PathBuf, u64)> = None;
        find_largest(&emote_dir, "psk", &mut psk);
        find_largest(&emote_dir, "md5anim", &mut anim);

        if anim.is_some() {
            // Animation found -> commit this dir as the cache and return.
            // Extract bundled emote audio (e.g. dance music) from the pak first,
            // so the .ogg lands inside the committed cache dir.
            let repak_exe = tools_dir.join("repak.exe");
            if repak_exe.exists() {
                if let Some(a) = extract_emote_audio(&repak_exe, &pak_file, aes_key, &emote_dir) {
                    eprintln!("[extract] Emote audio extracted: {}", a.display());
                }
            }
            let _ = std::fs::remove_file(emote_dir.join("extract.pak"));
            let _ = std::fs::remove_dir_all(&cache_dir);
            if let Err(e) = std::fs::rename(&emote_dir, &cache_dir) {
                eprintln!("[extract] Failed to rename emote temp dir: {}", e);
            }
            // Paths changed after the rename — re-scan the committed cache dir.
            let mut psk2: Option<(std::path::PathBuf, u64)> = None;
            let mut anim2: Option<(std::path::PathBuf, u64)> = None;
            let mut audio2: Option<(std::path::PathBuf, u64)> = None;
            find_largest(&cache_dir, "psk", &mut psk2);
            find_largest(&cache_dir, "md5anim", &mut anim2);
            find_largest(&cache_dir, "ogg", &mut audio2);
            let psk_s = psk2.map(|(p, _)| p.to_string_lossy().to_string()).unwrap_or_default();
            let anim_s = anim2.map(|(a, _)| a.to_string_lossy().to_string()).unwrap_or_default();
            let audio_s = audio2.map(|(a, _)| a.to_string_lossy().to_string()).unwrap_or_default();
            eprintln!("[extract] Emote assets: psk=\"{}\" anim=\"{}\" audio=\"{}\"", psk_s, anim_s, audio_s);
            return Ok(format!("EMOTE::{}|{}|{}", psk_s, anim_s, audio_s));
        } else if let Some((p, _)) = psk {
            // No animation but a skeleton exists -> remember it as a static
            // fallback; the glTF pass below still runs first.
            static_psk = Some(p);
        } else {
            let _ = std::fs::remove_dir_all(&emote_dir);
        }
    }

    // ---- glTF PASS (skin/mesh mods) ----------------------------------------
    let temp_dir = project_root.join(format!("cache/temp_extract_{}", time_num));
    stage_umodel_dir(&temp_dir);

    let mut extract_success = run_umodel(&temp_dir.to_string_lossy(), &["-png", "-gltf"], false);
    if !extract_success {
        // Fallback: extract without textures if it crashed on a bad texture
        extract_success = run_umodel(&temp_dir.to_string_lossy(), &["-notex", "-gltf"], false);
    }

    if extract_success {
        // Move temp_dir to cache_dir
        let _ = std::fs::remove_file(temp_dir.join("extract.pak"));
        let _ = std::fs::remove_dir_all(&cache_dir);
        if let Err(e) = std::fs::rename(&temp_dir, &cache_dir) {
            eprintln!("[extract] Failed to rename temp_dir to cache_dir: {}", e);
        }
    } else {
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    // Search the cache dir recursively for any produced gltf/glb
    if let Some(found) = find_gltf(&cache_dir) {
        eprintln!("[extract] Found: {}", found.display());

        // Rebuild the standalone glTF with the current texture-injection pipeline.
        if let Some(standalone) = build_standalone_gltf(&found) {
            return Ok(standalone.to_string_lossy().to_string());
        }

        return Ok(found.to_string_lossy().to_string());
    }

    // ---- STATIC SKELETON FALLBACK -------------------------------------------
    // The emote pass produced a .psk but no .md5anim: preview a static
    // rest-pose skeleton rather than nothing.
    if let Some(_) = static_psk {
        // A static-skeleton emote may still bundle music — extract it before
        // the rename so it ends up in the committed cache dir.
        let repak_exe = tools_dir.join("repak.exe");
        if repak_exe.exists() {
            extract_emote_audio(&repak_exe, &pak_file, aes_key, &emote_dir);
        }
        let _ = std::fs::remove_dir_all(&cache_dir);
        if let Err(e) = std::fs::rename(&emote_dir, &cache_dir) {
            eprintln!("[extract] Failed to rename emote temp dir: {}", e);
        }
        let mut psk2: Option<(std::path::PathBuf, u64)> = None;
        let mut audio2: Option<(std::path::PathBuf, u64)> = None;
        find_largest(&cache_dir, "psk", &mut psk2);
        find_largest(&cache_dir, "ogg", &mut audio2);
        if let Some((p2, _)) = psk2 {
            let audio_s = audio2.map(|(a, _)| a.to_string_lossy().to_string()).unwrap_or_default();
            eprintln!("[extract] Emote asset (static): psk={} audio=\"{}\"", p2.display(), audio_s);
            return Ok(format!("EMOTE::{}||{}", p2.to_string_lossy(), audio_s));
        }
    }

    // Nothing previewable; clean up the temp dirs.
    let _ = std::fs::remove_dir_all(&emote_dir);
    Err("No previewable 3D content in this mod. This is common for audio, font, title-screen, or 'override' emote mods that don't bundle a character skeleton of their own.".to_string())
}

/// Read a text file that umodel may have written in the system ANSI codepage
/// (e.g. Windows-1252 for non-ASCII material names like "Moñito") instead of
/// UTF-8. Tries UTF-8 first, then falls back to Windows-1252.
pub fn read_text_lenient(path: &Path) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    if std::str::from_utf8(&bytes).is_ok() {
        return String::from_utf8(bytes).ok();
    }
    let (s, _, _) = encoding_rs::WINDOWS_1252.decode(&bytes);
    Some(s.into_owned())
}

/// Rebuild the `<stem>_standalone.gltf` that sits next to the original glTF
/// produced by umodel, injecting the true base-color textures from the material
/// .props.txt files. Textures are inlined as base64 data URIs so the standalone
/// file is fully self-contained: the viewer only ever has to fetch one file,
/// regardless of how (or whether) sibling assets can be served.
///
/// This runs on every cache hit (see refresh_standalone), not just on first
/// extraction: standalone files written by older builds may map the wrong
/// texture to a material (e.g. a face material pointed at the eyes texture)
/// or carry stale placeholder baseColorFactors. Rebuilding is cheap — it is
/// pure JSON surgery on an already-extracted folder — and idempotent: the
/// file is only rewritten when the contents would actually change.
///
/// Locate the mod root: the single-mod folder that contains this glTF.
///
/// umodel nests glTFs at varying depths (Game/Character/.../Mesh/) and the
/// material props/textures do not always sit in sibling folders, so anchor on
/// the known layout: the mod root is `cache/models/<mod>` (or any direct child
/// of `cache/`, which also covers the `cache/temp_extract_N` directory used
/// during fresh extraction before it is renamed into `cache/models/`).
pub fn mod_root_for(gltf_path: &Path) -> Option<std::path::PathBuf> {
    let mut dir = gltf_path.parent()?.to_path_buf();
    for _ in 0..16 {
        let parent = dir.parent()?.to_path_buf();
        let parent_name = parent.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if parent_name == "models"
            && parent.parent().and_then(|p| p.file_name()).and_then(|n| n.to_str()).map(|n| n == "cache").unwrap_or(false)
        {
            return Some(dir);
        }
        if parent_name == "cache" {
            return Some(dir);
        }
        dir = parent;
    }
    None
}

/// Material props and decodable raster textures found under a mod root.
pub struct ModAssets {
    props: Vec<std::path::PathBuf>,
    textures: Vec<std::path::PathBuf>,
}

pub const EMPTY_ASSETS: ModAssets = ModAssets { props: Vec::new(), textures: Vec::new() };

/// Iteratively walk a mod root, collecting material `.props.txt` files and
/// raster textures. PNG/JPG/JPEG only — TGA is excluded because three.js
/// cannot decode it (umodel is run with `-png`, so PNG is the norm).
pub fn collect_mod_assets(root: &Path) -> ModAssets {
    let mut props = Vec::new();
    let mut textures = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else {
                let lower = entry.file_name().to_string_lossy().to_lowercase();
                if lower.ends_with(".props.txt") {
                    props.push(path);
                } else if lower.ends_with(".png") || lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
                    textures.push(path);
                }
            }
        }
    }
    ModAssets { props, textures }
}

/// Find the `.props.txt` for a material: the legacy sibling `../Mat/<name>`
/// first, then a case-insensitive name match anywhere under the mod root
/// (fewest path components wins when several copies exist).
pub fn find_props_file(assets: &ModAssets, gltf_dir: &Path, mat_name: &str) -> Option<std::path::PathBuf> {
    let legacy = gltf_dir.join("../Mat").join(format!("{}.props.txt", mat_name));
    if legacy.exists() {
        return Some(legacy);
    }
    let want = format!("{}.props.txt", mat_name.to_lowercase());
    assets
        .props
        .iter()
        .filter(|p| p.file_name().and_then(|n| n.to_str()).map(|n| n.to_lowercase() == want).unwrap_or(false))
        .min_by_key(|p| p.components().count())
        .cloned()
}

/// Find the texture file for a stem: the legacy sibling `../Tex/<stem>` first,
/// then a case-insensitive stem match anywhere under the mod root. Prefers
/// PNG over JPEG, then the shallowest path.
pub fn find_texture_file(assets: &ModAssets, gltf_dir: &Path, stem: &str) -> Option<std::path::PathBuf> {
    for ext in ["png", "jpg", "jpeg"] {
        let legacy = gltf_dir.join("../Tex").join(format!("{}.{}", stem, ext));
        if legacy.exists() {
            return Some(legacy);
        }
    }
    let want = stem.to_lowercase();
    assets
        .textures
        .iter()
        .filter(|p| p.file_stem().and_then(|s| s.to_str()).map(|s| s.to_lowercase() == want).unwrap_or(false))
        .min_by_key(|p| {
            let is_png = p.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("png")).unwrap_or(false);
            (if is_png { 0 } else { 1 }, p.components().count())
        })
        .cloned()
}

/// Inline a texture as a base64 data URI (mime from the extension). When the
/// file cannot be read, fall back to a glTF-relative URI so the final
/// self-containment pass (or the viewer) can still resolve it.
pub fn texture_uri(tex_path: &Path, gltf_dir: &Path) -> String {
    let bytes = match fs::read(tex_path) {
        Ok(b) => b,
        Err(_) => return relative_uri(gltf_dir, tex_path),
    };
    let mime = match tex_path.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).as_deref() {
        Some("jpg") | Some("jpeg") => "image/jpeg",
        _ => "image/png",
    };
    format!("data:{};base64,{}", mime, BASE64.encode(&bytes))
}

/// glTF-relative URI (forward slashes, `../` chain) from `from_dir` to `file`.
pub fn relative_uri(from_dir: &Path, file: &Path) -> String {
    let from_s = from_dir.to_string_lossy().replace('\\', "/");
    let from: Vec<&str> = from_s.split('/').filter(|s| !s.is_empty()).collect();
    let to_s = file.to_string_lossy().replace('\\', "/");
    let to: Vec<&str> = to_s.split('/').filter(|s| !s.is_empty()).collect();
    let mut shared = 0;
    while shared < from.len() && shared < to.len() && from[shared] == to[shared] {
        shared += 1;
    }
    let mut parts: Vec<String> = vec!["..".to_string(); from.len() - shared];
    parts.extend(to[shared..].iter().map(|s| s.to_string()));
    parts.join("/")
}

/// True when a texture file stem looks like a diffuse/base-color map: it must
/// contain a diffuse token and must not contain a mask/normal/emissive token
/// (so `body_D.png` matches while `body_colorMask.png`, `body_AO.png` and
/// `body_n.png` do not).
pub fn is_diffuse_name(stem: &str) -> bool {
    const BAD: &[&str] = &["mask", "normal", "n", "ao", "occlusion", "emissive", "specular", "s", "roughness", "metallic", "orm", "specgloss", "height", "displacement"];
    const GOOD: &[&str] = &["d", "diff", "color", "basecolor", "albedo", "diffuse"];
    let mut has_good = false;
    for tok in stem.to_lowercase().split(|c: char| !c.is_alphanumeric()) {
        if tok.is_empty() {
            continue;
        }
        if BAD.contains(&tok) {
            return false;
        }
        if GOOD.contains(&tok) {
            has_good = true;
        }
    }
    has_good
}

/// Point a material at a base-color texture index, neutralizing the
/// placeholder baseColorFactor umodel writes (a 0.3/0.9 palette that would
/// otherwise tint the texture). Alpha is preserved; the pbr block is created
/// if absent.
pub fn set_material_basecolor(mat: &mut serde_json::Value, tex_idx: usize) {
    let Some(mat_obj) = mat.as_object_mut() else { return };
    let alpha = mat_obj
        .get("pbrMetallicRoughness")
        .and_then(|p| p.get("baseColorFactor"))
        .and_then(|f| f.as_array())
        .and_then(|a| a.get(3))
        .and_then(|v| v.as_f64())
        .unwrap_or(1.0);
    let pbr = mat_obj
        .entry("pbrMetallicRoughness")
        .or_insert_with(|| serde_json::json!({}))
        .as_object_mut()
        .unwrap();
    pbr.insert("baseColorTexture".to_string(), serde_json::json!({ "index": tex_idx }));
    pbr.insert("baseColorFactor".to_string(), serde_json::json!([1.0, 1.0, 1.0, alpha]));
}

/// Returns the standalone path when the glTF had injectable textures, or None
/// when nothing could be injected (caller should serve the plain glTF instead).
///
/// Texture lookup is two-stage: the legacy sibling `../Mat` + `../Tex` folders
/// first, then the whole mod root (props/textures frequently live in a
/// sibling `Model` subtree rather than next to the glTF). Dummy materials —
/// umodel's stand-ins for assets it could not resolve — get the mod's single
/// diffuse-named texture when no named material already claims it.
pub fn build_standalone_gltf(gltf_path: &Path) -> Option<std::path::PathBuf> {
    if gltf_path.extension().and_then(|s| s.to_str()) != Some("gltf") {
        return None;
    }
    let standalone = gltf_path.with_file_name(
        format!("{}_standalone.gltf", gltf_path.file_stem()?.to_string_lossy())
    );
    
    let gltf_text = read_text_lenient(gltf_path)?;
    let mut gltf_json = serde_json::from_str::<serde_json::Value>(&gltf_text).ok()?;
    let gltf_dir = gltf_path.parent()?;
    let mut modified = false;
    
    // Locate the mod root so props/textures can be found even when they live
    // in non-sibling folders (or the glTF is still in the temp_extract dir).
    let mod_root = mod_root_for(gltf_path);
    let assets: Option<ModAssets> = mod_root.as_deref().map(collect_mod_assets);
    let empty_assets = EMPTY_ASSETS;
    let assets_ref = assets.as_ref().unwrap_or(&empty_assets);
    // Stems of textures already claimed by a named material; the dummy
    // fallback must not reuse them (a second mesh claiming the same map is
    // more likely a different part than a lucky duplicate).
    let mut used_tex_stems: HashSet<String> = HashSet::new();
    
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
                // .props.txt: legacy sibling ../Mat first, then anywhere under the mod root.
                let props_path = find_props_file(assets_ref, gltf_dir, &mat_name);
                if let Some(props_path) = props_path {
                if let Some(props) = read_text_lenient(&props_path) {
                    // Parse all texture parameter entries: (parameter name, texture file name)
                    let mut tex_params: Vec<(String, String)> = Vec::new();
                    let mut scan = 0;
                    while let Some(rel) = props[scan..].find("Name=") {
                        let start = scan + rel + 5;
                        let rest = &props[start..];
                        let name_end = rest.find('}').unwrap_or(rest.len());
                        let param_name = rest[..name_end].trim().to_string();
                        if name_end < rest.len() {
                            if let Some(t2d_rel) = rest[name_end..].find("Texture2D'") {
                                let pstart = name_end + t2d_rel + 10;
                                if let Some(end_rel) = rest[pstart..].find('\'') {
                                    let path = &rest[pstart..pstart + end_rel];
                                    if let Some(last_slash) = path.rfind('/') {
                                        let file_dot = &path[last_slash + 1..];
                                        if let Some(dot) = file_dot.find('.') {
                                            tex_params.push((param_name, file_dot[..dot].to_string()));
                                        }
                                    }
                                }
                            }
                        }
                        scan = start;
                    }
                    
                    // Rank candidates: real base-color params first, never use
                    // mask/normal/emissive/specular maps as the diffuse texture.
                    let score = |n: &str| -> i32 {
                        let l = n.to_lowercase();
                        if l.contains("mask") || l.contains("normal") || l.contains("emissive")
                            || l.contains("specular") || l.contains("roughness") || l.contains("metallic") {
                            return -1;
                        }
                        if l.contains("colortexture") { return 100; }
                        if l.contains("basecolor") { return 90; }
                        if l.contains("diffuse") || l.contains("albedo") { return 80; }
                        if l.contains("color") || l.contains("base") { return 70; }
                        0
                    };
                    
                    let mut found_tex_name: Option<String> = None;
                    let mut best_score = i32::MIN;
                    for (pname, tname) in &tex_params {
                        let s = score(pname);
                        if s > best_score {
                            best_score = s;
                            found_tex_name = Some(tname.clone());
                        }
                    }
                    // If every parameter was a mask/normal/emissive map, prefer no
                    // texture at all (gray clay is closer to correct than a purple normal map).
                    if best_score < 0 {
                        found_tex_name = None;
                    }
                    
                    if let Some(tex_name) = found_tex_name {
                        // Texture: legacy sibling ../Tex first, then anywhere under the mod root.
                        if let Some(tex_path) = find_texture_file(assets_ref, gltf_dir, &tex_name) {
                            // Inline the texture as a data URI (texture_uri falls
                            // back to a relative URI, and the final pass below
                            // inlines any that remain); keeps the file
                            // self-contained even if the viewer can't fetch
                            // sibling files.
                            let uri = texture_uri(&tex_path, gltf_dir);
                            
                            new_images.push(serde_json::json!({
                                "uri": uri
                            }));
                            
                            new_textures.push(serde_json::json!({
                                "source": next_image_idx
                            }));
                            
                            set_material_basecolor(mat, next_tex_idx);
                            
                            next_image_idx += 1;
                            next_tex_idx += 1;
                            modified = true;
                            used_tex_stems.insert(tex_name.to_lowercase());
                            eprintln!("[extract] Injected texture {} into material {}", tex_name, mat_name);
                        }
                    }
                }
                }
            }
        }
        
        // Fallback for dummy materials (umodel's stand-ins for materials whose
        // props it could not resolve): if the mod contains exactly one
        // diffuse-named texture that no named material already uses, assign it
        // to every untextured dummy material. One texture + one dummy mesh is
        // overwhelmingly likely to be the same part; with zero or multiple
        // candidates the choice would be a guess, so leave them alone.
        if let Some(assets_ref) = assets.as_ref() {
            let mut candidates: HashSet<String> = HashSet::new();
            for tex in &assets_ref.textures {
                if let Some(stem) = tex.file_stem().and_then(|s| s.to_str()) {
                    let stem_l = stem.to_lowercase();
                    if is_diffuse_name(&stem_l) && !used_tex_stems.contains(&stem_l) {
                        candidates.insert(stem_l);
                    }
                }
            }
            if candidates.len() == 1 {
                let stem_l = candidates.iter().next().unwrap().clone();
                if let Some(tex_path) = find_texture_file(assets_ref, gltf_dir, &stem_l) {
                    let uri = texture_uri(&tex_path, gltf_dir);
                    new_images.push(serde_json::json!({ "uri": uri }));
                    new_textures.push(serde_json::json!({ "source": next_image_idx }));
                    for mat in materials.iter_mut() {
                        let is_dummy = mat.get("name").and_then(|n| n.as_str())
                            .map(|n| n.to_lowercase().starts_with("dummy_material_")).unwrap_or(false);
                        let has_base_tex = mat.get("pbrMetallicRoughness")
                            .and_then(|p| p.get("baseColorTexture")).is_some();
                        if is_dummy && !has_base_tex {
                            set_material_basecolor(mat, next_tex_idx);
                            eprintln!("[extract] Assigned diffuse fallback {} to dummy material", stem_l);
                        }
                    }
                    next_image_idx += 1;
                    next_tex_idx += 1;
                    modified = true;
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
    
    if !modified {
        return None;
    }
    
    // Final pass: make the file fully self-contained by inlining any image
    // that still uses a relative URI (covers textures that were already in
    // the source glTF, not just the ones injected above).
    if let Some(images_arr) = gltf_json.get_mut("images").and_then(|i| i.as_array_mut()) {
        for img in images_arr.iter_mut() {
            if let Some(uri) = img.get("uri").and_then(|u| u.as_str()) {
                if !uri.starts_with("data:") {
                    let img_path = gltf_dir.join(uri);
                    if let Ok(bytes) = fs::read(&img_path) {
                        let is_jpeg = matches!(
                            img_path.extension().and_then(|e| e.to_str()),
                            Some("jpg") | Some("jpeg")
                        );
                        let mime = if is_jpeg { "image/jpeg" } else { "image/png" };
                        img["uri"] = serde_json::json!(format!(
                            "data:{};base64,{}",
                            mime,
                            BASE64.encode(&bytes)
                        ));
                    }
                }
            }
        }
    }
    
    let new_json = serde_json::to_string(&gltf_json).ok()?;
    // Skip the write when the standalone is already up to date.
    if let Ok(existing) = fs::read_to_string(&standalone) {
        if existing == new_json {
            return Some(standalone);
        }
    }
    fs::write(&standalone, &new_json).ok()?;
    eprintln!("[extract] Created standalone: {}", standalone.display());
    Some(standalone)
}

/// Serve a cached model file, refreshing it first with the current pipeline
/// (see build_standalone_gltf):
///
/// - a `_standalone.gltf` is rebuilt from its original glTF, and
/// - a plain original `.gltf` is rebuilt into a standalone (this is how stale
///   caches from before the mod-root / dummy-material fallbacks get healed at
///   preview time — they have no standalone to refresh yet).
///
/// Non-text files and failed rebuilds fall back to the cached file as-is.
pub fn refresh_standalone(cached: std::path::PathBuf) -> std::path::PathBuf {
    if let Some(name) = cached.file_name().and_then(|n| n.to_str()) {
        if let Some(orig_stem) = name.strip_suffix("_standalone.gltf") {
            let original = cached.with_file_name(format!("{}.gltf", orig_stem));
            if original.exists() {
                if let Some(fresh) = build_standalone_gltf(&original) {
                    return fresh;
                }
            }
        } else if name.ends_with(".gltf") {
            if let Some(fresh) = build_standalone_gltf(&cached) {
                return fresh;
            }
        }
    }
    cached
}

// ──────────────────────────────────────────────────────────────────────────────
// Discord Store commands
// ──────────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn rename_mod(id: String, new_name: String) -> Result<(), String> {
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
pub fn delete_mod(id: String) -> Result<(), String> {
    let mod_dir = get_data_dir().join("mods").join(&id);
    if mod_dir.exists() { fs::remove_dir_all(mod_dir).map_err(|e| e.to_string())?; }
    Ok(())
}

#[tauri::command]
pub fn read_image_base64(path: String) -> Result<String, String> {
    use std::io::Read;
    let mut file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
    
    use base64::{engine::general_purpose, Engine as _};
    let b64 = general_purpose::STANDARD.encode(&buffer);
    
    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("png");
    
    Ok(format!("data:image/{};base64,{}", ext, b64))
}

#[tauri::command]
pub fn restore_to_default(game_path: Option<String>) -> Result<(), String> {
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

#[tauri::command]
pub fn open_mod_folder(id: String) -> Result<(), String> {
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

#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() { return Err("Path does not exist".to_string()); }
    
    #[cfg(target_os = "windows")]
    {
        let clean_path = path.replace(r#"\\?\"#, "");
        std::process::Command::new("explorer")
            .arg(&clean_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}


#[tauri::command]
pub fn split_mod(mod_id: String) -> Result<String, String> {
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
            "character": "Other",
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
pub fn merge_mods(mod_ids: Vec<String>, new_name: String) -> Result<String, String> {
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
        "character": "Other",
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
pub async fn get_characters() -> Result<Vec<String>, String> {
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

#[tauri::command]
pub fn clear_mod_cache() -> Result<(), String> {
    let cache_file = get_data_dir().join("cache").join("character_scan_cache.json");
    if cache_file.exists() {
        if let Err(e) = std::fs::remove_file(cache_file) {
            return Err(e.to_string());
        }
    }
    Ok(())
}

#[tauri::command]
pub fn save_folders_json(folders_json: String) -> Result<(), String> {
    let file_path = get_data_dir().join("folders.json");
    fs::write(file_path, folders_json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_folders_json() -> Result<String, String> {
    let file_path = get_data_dir().join("folders.json");
    if file_path.exists() {
        fs::read_to_string(file_path).map_err(|e| e.to_string())
    } else {
        Ok("[]".to_string())
    }
}

#[tauri::command]
pub fn save_collections_json(collections_json: String) -> Result<(), String> {
    let file_path = get_data_dir().join("collections.json");
    fs::write(file_path, collections_json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_collections_json() -> Result<String, String> {
    let file_path = get_data_dir().join("collections.json");
    if file_path.exists() {
        fs::read_to_string(file_path).map_err(|e| e.to_string())
    } else {
        Ok("[]".to_string())
    }
}

#[cfg(test)]
mod standalone_gltf_tests {
    use super::*;

    #[test]
    fn diffuse_name_classification() {
        assert!(is_diffuse_name("body_D"));
        assert!(is_diffuse_name("Ch018_A1_00_body_D"));
        assert!(is_diffuse_name("diffuse"));
        assert!(is_diffuse_name("basecolor"));
        assert!(is_diffuse_name("albedo"));
        assert!(is_diffuse_name("D"));
        assert!(!is_diffuse_name("body_colorMask"));
        assert!(!is_diffuse_name("body_AO"));
        assert!(!is_diffuse_name("body_n"));
        assert!(!is_diffuse_name("emissive"));
        assert!(!is_diffuse_name("1_1"));
        assert!(!is_diffuse_name("specgloss"));
    }

    #[test]
    fn relative_uri_chain() {
        assert_eq!(
            relative_uri(Path::new("/c/models/mod/Game/Mesh"), Path::new("/c/models/mod/Game/Tex/body_D.png")),
            "../Tex/body_D.png"
        );
        assert_eq!(
            relative_uri(Path::new("/c/models/mod/Game/Character/Ch025/Mesh"), Path::new("/c/models/mod/Game/Character/Ch025/Default/Mat/face.props.txt")),
            "../Default/Mat/face.props.txt"
        );
        assert_eq!(
            relative_uri(Path::new("/a/b/c/d"), Path::new("/a/b/x.png")),
            "../../x.png"
        );
    }

    #[test]
    fn mod_root_anchors() {
        let p = Path::new("/c/cache/models/Nejire Mod/Game/Character/Ch025/Model/Sp/D1_00/Mesh/x.gltf");
        assert_eq!(mod_root_for(p).as_deref(), Some(Path::new("/c/cache/models/Nejire Mod")));
        let p = Path::new("/c/cache/temp_extract_123/Game/Mesh/x.gltf");
        assert_eq!(mod_root_for(p).as_deref(), Some(Path::new("/c/cache/temp_extract_123")));
        assert_eq!(mod_root_for(Path::new("/elsewhere/foo/bar/x.gltf")), None);
    }
}
