// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::fs;
use std::path::Path;
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::collections::HashMap;
use std::os::windows::process::CommandExt;

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
}

fn load_cache() -> HashMap<String, serde_json::Value> {
    let cache_path = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from(".")).join("cache/character_scan_cache.json");
    if let Ok(content) = fs::read_to_string(&cache_path) {
        if let Ok(json) = serde_json::from_str(&content) {
            return json;
        }
    }
    HashMap::new()
}

fn save_cache(cache: &HashMap<String, serde_json::Value>) {
    let cache_dir = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from(".")).join("cache");
    let _ = fs::create_dir_all(&cache_dir);
    if let Ok(json) = serde_json::to_string_pretty(cache) {
        let _ = fs::write(cache_dir.join("character_scan_cache.json"), json);
    }
}

fn get_project_root() -> std::path::PathBuf {
    // During `tauri dev`, CWD is src-tauri/. We need the project root.
    let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    if cwd.join("tools").exists() && cwd.join("mods").exists() {
        return cwd;
    }
    let parent = cwd.parent().map(|p| p.to_path_buf()).unwrap_or(cwd.clone());
    if parent.join("tools").exists() && parent.join("mods").exists() {
        return parent;
    }
    cwd
}

fn scan_pak_for_character_and_emote(pak_path: &Path) -> (String, String) {
    let project_root = get_project_root();
    let tools_dir = project_root.join("tools");
    
    let umodel_exe = if tools_dir.join("umodel_64.exe").exists() {
        tools_dir.join("umodel_64.exe")
    } else {
        tools_dir.join("umodel.exe")
    };

    if !umodel_exe.exists() {
        eprintln!("[scan_pak] umodel not found at {:?}", umodel_exe);
        return (String::new(), String::from("Other"));
    }

    // Resolve pak_path to absolute so umodel can always find it
    let abs_pak_path = if pak_path.is_absolute() {
        pak_path.to_path_buf()
    } else {
        project_root.join(pak_path)
    };
    let abs_pak_dir = abs_pak_path.parent().unwrap_or(&project_root);

    eprintln!("[scan_pak] Scanning {:?} with umodel at {:?}", abs_pak_dir, umodel_exe);

    let aes_key = "0x332F41B1130F125444A35F420EC6D05EA3E27A972A36DAD90C83FC6958D941C7";
    let output = Command::new(&umodel_exe)
        .arg("-list")
        .arg("-game=ue4.27")
        .arg(format!("-path={}", abs_pak_dir.to_string_lossy()))
        .arg(format!("-aes={}", aes_key))
        .arg("*")
        .creation_flags(0x08000000)
        .output();
        
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
            return (String::new(), String::from("Other"));
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
                ch_id = candidate.to_string();
                break;
            }
        }
    }
    
    eprintln!("[scan_pak] has_mesh={}, has_anim={}, has_audio={}, ch_id={}", has_mesh, has_anim, has_audio, ch_id);
    
    let is_emote = has_anim && (!has_mesh || ch_id.is_empty());
    
    let mut base_char = String::new();
    if !ch_id.is_empty() {
        base_char = match ch_id.as_str() {
            "000" => "Katsuki Bakugo",
            "001" => if out_str.to_lowercase().contains("ofa") { "Deku OFA" } else { "Izuku Midoriya" },
            "002" => "Katsuki Bakugo",   // Some sources list Ch002 as alt Bakugo slot
            "003" => "Ochako Uraraka",
            "004" => "Shoto Todoroki",
            "005" => "Tenya Iida",
            "006" => "Tsuyu Asui",
            "007" => "Denki Kaminari",
            "008" => "Eijiro Kirishima",
            "009" => "Kyoka Jiro",
            "010" => "Momo Yaoyorozu",
            "011" => "Fumikage Tokoyami",
            "012" => "All Might",
            "013" => "Shota Aizawa",
            "014" => "Gran Torino",
            "015" => "Minoru Mineta",
            "016" => "All For One",
            "017" => "Dabi",
            "018" => "Himiko Toga",
            "019" => "Stain",
            "020" => "Muscular",
            "022" => "Inasa Yoarashi",
            "024" => "Mirio Togata",
            "025" => "Nejire Hado",
            "026" => "Tamaki Amajiki",
            "031" => "Sir Nighteye",
            "032" => "Gang Orca",
            "034" => "Overhaul",
            "037" => "Twice",
            "043" => "Hawks",
            "046" => "Itsuka Kendo",
            "047" => "Tetsutetsu",
            "100" => "Mt. Lady",
            "101" => "Cementoss",
            "102" => "Ibara Shiozaki",
            "104" => "Neito Monoma",
            "109" => "Present Mic",
            "113" => "Midnight",
            "114" => "Star and Stripe",
            "115" => "Lady Nagant",
            "116" => "Shinso",
            "200" => "Armored All Might",
            "201" => "All For One",
            "202" => "Deku OFA",
            "203" => "Shigaraki AFO",
            _ => "",
        }.to_string();
        
        if base_char.is_empty() {
            base_char = format!("Ch{}", ch_id);
        }
    }
    
    let category = if is_emote {
        "Emote"
    } else if has_audio && !has_mesh {
        "Voice"
    } else if has_mesh && !base_char.is_empty() {
        "Skin"
    } else {
        "Other"
    };

    eprintln!("[scan_pak] Result: character={}, category={}", base_char, category);
    (base_char, category.to_string())
}

#[tauri::command]
fn get_local_mods(game_path: Option<String>) -> Result<Vec<ModInfo>, String> {
    let project_root = get_project_root();
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
                        let mut category = parsed["category"].as_str().unwrap_or("Other").to_string();
                        let mut character = parsed["character"].as_str().unwrap_or("All").to_string();
                        let folder_path = path.canonicalize().unwrap_or(path.clone()).to_string_lossy().to_string();
                        
                        // Fix windows long path prefix if present
                        let folder_path = folder_path.strip_prefix(r#"\\?\"#).unwrap_or(&folder_path).to_string();

                        // Check if this mod's pak is in the ~mods folder
                        let mut is_active = false;
                        let mut target_pak_path = None;
                        
                        let assets_dir = path.join("assets");
                        if assets_dir.exists() && assets_dir.is_dir() {
                            if let Ok(asset_entries) = fs::read_dir(&assets_dir) {
                                for asset in asset_entries.flatten() {
                                    let asset_path = asset.path();
                                    if asset_path.is_file() && asset_path.extension().and_then(|s| s.to_str()) == Some("pak") {
                                        if target_pak_path.is_none() {
                                            target_pak_path = Some(asset_path.clone());
                                        }
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
                        
                        if let Some(pak_path) = target_pak_path {
                            let cache_key = if let Ok(meta) = fs::metadata(&pak_path) {
                                format!("{}|{}|{}", pak_path.to_string_lossy(), meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH).duration_since(std::time::UNIX_EPOCH).unwrap().as_secs(), meta.len())
                            } else {
                                pak_path.to_string_lossy().to_string()
                            };
                            
                            let (ch, cat) = if let Some(cached) = cache.get(&cache_key) {
                                (
                                    cached.get("character").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                                    cached.get("category").and_then(|v| v.as_str()).unwrap_or("").to_string()
                                )
                            } else {
                                let (ch, cat) = scan_pak_for_character_and_emote(&pak_path);
                                cache.insert(cache_key, serde_json::json!({
                                    "character": ch,
                                    "category": cat
                                }));
                                cache_modified = true;
                                (ch, cat)
                            };
                            
                            if !ch.is_empty() { character = ch; }
                            if !cat.is_empty() && cat != "Other" { category = cat; }
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
                if file_path.is_file() && file_path.extension().and_then(|s| s.to_str()) == Some("pak") {
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
    
    let base_dir = std::env::current_dir().map_err(|e| format!("cwd error: {}", e))?;
    
    // Resolve project root — during `tauri dev`, cwd is src-tauri/
    let project_root = if base_dir.join("tools").exists() {
        base_dir.clone()
    } else if base_dir.parent().map(|p| p.join("tools").exists()).unwrap_or(false) {
        base_dir.parent().unwrap().to_path_buf()
    } else {
        // Fallback: use folder_path parent as hint (mods are at project_root/mods/...)
        let mut guess = folder.to_path_buf();
        while let Some(parent) = guess.parent() {
            if parent.join("tools").exists() {
                break;
            }
            guess = parent.to_path_buf();
        }
        if guess.join("tools").exists() { guess } else { base_dir.clone() }
    };
    
    let tools_dir = project_root.join("tools");
    let cache_dir = project_root.join("cache").join("models").join(&mod_id);
    fs::create_dir_all(&cache_dir).unwrap_or_default();
    
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
            if entry.path().extension().and_then(|s| s.to_str()) == Some("pak") {
                pak_file = Some(entry.path());
                break;
            }
        }
    }
    
    let pak_file = pak_file.ok_or("No .pak file found in assets/")?;
    let pak_parent = pak_file.parent().unwrap().to_string_lossy().to_string();
    let aes_key = "0x332F41B1130F125444A35F420EC6D05EA3E27A972A36DAD90C83FC6958D941C7";
    let cache_str = cache_dir.to_string_lossy().to_string();
    
    eprintln!("[extract] pak_parent={}, cache_str={}", pak_parent, cache_str);
    
    let run_umodel = |use_notex: bool| {
        let mut cmd = Command::new(&umodel_exe);
        cmd.current_dir(&tools_dir)
            .arg("-game=ue4.27")
            .arg(format!("-path={}", pak_parent))
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
            .arg(format!("-out={}", cache_str))
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
            }
            Err(e) => {
                eprintln!("[extract] umodel execution failed: {}", e);
            }
        }
    };
    
    // First attempt: try to extract with textures
    run_umodel(false);
    
    // If it crashed or failed (no GLTF produced), retry without textures
    if find_gltf(&cache_dir).is_none() {
        eprintln!("[extract] No GLTF found after first pass. Retrying with -notex fallback...");
        run_umodel(true);
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![greet, launch_game, deploy_mods, get_local_mods, extract_mod_preview, get_mhur_paks_path])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
