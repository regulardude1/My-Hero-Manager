use std::fs;
use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::Command;
use crate::util::{get_data_dir, get_tools_dir, get_characters_map};

#[tauri::command]
pub async fn get_costumes(game_path: String, mut character_id: String) -> Result<Vec<serde_json::Value>, String> {
    let app_dir = get_data_dir().join("cache");
    
    if character_id.is_empty() {
        return Err("Character ID is empty.".into());
    }
    
    // Accept a character display name (e.g. "Mirko") when the caller doesn't
    // have scanned file data to extract ChXXX from.
    let map = get_characters_map();
    if !map.contains_key(&character_id) {
        if let Some((id, _)) = map.iter().find(|(_, name)| *name == &character_id) {
            character_id = format!("Ch{}", id);
        }
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

/// List the file entries inside a mod's .pak (fast, no umodel scan).
/// Used to figure out which costume slot(s) the mod actually modifies.
#[tauri::command]
pub async fn get_mod_file_list(mod_path: String) -> Result<Vec<String>, String> {
    let tools_dir = get_tools_dir();
    let repak_exe = tools_dir.join("repak.exe");
    if !repak_exe.exists() {
        return Err("repak.exe not found in tools directory".into());
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
    let pak_str = pak_file.to_string_lossy().to_string();

    // Try without an AES key first (most community mods aren't encrypted),
    // then retry with the game key for encrypted paks.
    let attempts: Vec<Vec<String>> = vec![
        vec!["list".to_string(), pak_str.clone()],
        vec!["-a".to_string(), "0x332F41B1130F125444A35F420EC6D05EA3E27A972A36DAD90C83FC6958D941C7".to_string(), "list".to_string(), pak_str],
    ];

    let mut last_err = String::from("repak list failed");
    for args in &attempts {
        let output = std::process::Command::new(&repak_exe)
            .args(args)
            .creation_flags(0x08000000)
            .output()
            .map_err(|e| e.to_string())?;
        if output.status.success() {
            let listing = String::from_utf8_lossy(&output.stdout).to_string();
            let files: Vec<String> = listing
                .lines()
                .map(|l| l.trim().to_string())
                .filter(|l| !l.is_empty() && l.to_ascii_lowercase().contains("model/"))
                .collect();
            return Ok(files);
        }
        last_err = String::from_utf8_lossy(&output.stderr).to_string();
    }

    Err(format!("Failed to list pak contents: {}", last_err))
}

#[tauri::command]
pub async fn swap_skin_slot(mod_id: String, mod_path: String, mode: String, source_slot: String, target_slot: String, game_path: Option<String>) -> Result<String, String> {
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
    
    // Resolve the game pak (the engine reads the target slot's material + texture names from it)
    let aes_key = "0x332F41B1130F125444A35F420EC6D05EA3E27A972A36DAD90C83FC6958D941C7";
    let game_pak = match game_path {
        Some(gp) => {
            let mut pak = std::path::PathBuf::from(gp);
            if !pak.to_string_lossy().ends_with(".pak") {
                if pak.ends_with("Paks") {
                    pak = pak.join("HerovsGame-WindowsNoEditor.pak");
                } else {
                    pak = pak.join("HerovsGame").join("Content").join("Paks").join("HerovsGame-WindowsNoEditor.pak");
                }
            }
            if !pak.exists() {
                return Err(format!("Could not find the game .pak file at {}", pak.display()));
            }
            Some(pak)
        }
        None => None,
    };
    
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
    let mut engine_cmd = Command::new(&python_exe);
    engine_cmd
        .arg(&engine_script)
        .arg(&temp_dir)
        .arg(&uejson_path)
        .arg(&mode)
        .arg(&source_slot)
        .arg(&target_slot);
    if let Some(gp) = &game_pak {
        engine_cmd
            .arg(gp)
            .arg(&repak_exe)
            .arg(aes_key);
    }
    let output = engine_cmd
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
