use std::fs;
use std::path::Path;
use std::path::PathBuf;
use serde::Serialize;
use crate::util::{get_data_dir, sanitize_folder_name};

pub fn extract_with_winrar(archive_path: &Path, dest_dir: &Path, preserve_paths: bool) -> Result<Vec<String>, String> {
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

pub fn get_unique_dir(base_dir: &Path, name: &str) -> PathBuf {
    let mut target = base_dir.join(name);
    let mut counter = 2;
    while target.exists() {
        target = base_dir.join(format!("{}_{}", name, counter));
        counter += 1;
    }
    target
}

/// Core function to extract and install a mod file (.pak, .zip, .rar, .7z)
/// 
/// - `path`: Path to the downloaded/imported file. This file will be DELETED after successful extraction!
/// - `mod_title`: Title of the mod (used for folder naming and modinfo).
/// - `mod_author`: Author of the mod.
/// - `source_id`: Source identifier (e.g. "GameBanana", "Discord", "Local", "Nexus") used for categorization and IDs.
/// - `source_url`: Optional URL where the mod was downloaded from.
pub fn extract_and_install_mod(
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
                let sub_folder = get_unique_dir(&mods_dir, &sub_folder_name);
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
                            "character": "Other",
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
                    let sub_folder = get_unique_dir(&mods_dir, &sub_folder_name);
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
                            "character": "Other",
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
        let mod_folder = get_unique_dir(&mods_dir, &safe_title);
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
            "character": "Other",
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
pub async fn download_url_mod(
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
pub fn install_local_mods(file_paths: Vec<String>) -> Result<String, String> {
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

        match extract_and_install_mod(&temp_path, &safe_title, "Local Import", "Other", None) {
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

#[derive(Serialize)]
pub struct PrepareImportResult {
    file_path: String,
    pak_hashes: Vec<String>,
}

#[tauri::command]
pub fn prepare_import(file_paths: Vec<String>) -> Result<Vec<PrepareImportResult>, String> {
    use sha2::{Sha256, Digest};
    use std::io::Read;
    
    let mut results = Vec::new();
    for path_str in file_paths {
        let path = Path::new(&path_str);
        if !path.exists() { continue; }
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        let mut hashes = Vec::new();
        
        if ext == "pak" || ext == "pak_" {
            if let Ok(mut file) = fs::File::open(path) {
                let mut hasher = Sha256::new();
                let mut buffer = [0; 8192];
                while let Ok(count) = file.read(&mut buffer) {
                    if count == 0 { break; }
                    hasher.update(&buffer[..count]);
                }
                hashes.push(hasher.finalize().iter().map(|b| format!("{:02x}", b)).collect());
            }
        } else if ext == "zip" {
            if let Ok(file) = fs::File::open(path) {
                if let Ok(mut archive) = zip::ZipArchive::new(file) {
                    for i in 0..archive.len() {
                        if let Ok(mut entry) = archive.by_index(i) {
                            let entry_name = entry.name().to_lowercase();
                            if entry_name.ends_with(".pak") || entry_name.ends_with(".pak_") {
                                let mut hasher = Sha256::new();
                                let mut buffer = [0; 8192];
                                while let Ok(count) = entry.read(&mut buffer) {
                                    if count == 0 { break; }
                                    hasher.update(&buffer[..count]);
                                }
                                hashes.push(hasher.finalize().iter().map(|b| format!("{:02x}", b)).collect());
                            }
                        }
                    }
                }
            }
        } else if ext == "rar" || ext == "7z" {
            let project_root = get_data_dir();
            let time_num = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
            let temp_extract_dir = project_root.join("cache").join(format!("temp_prep_{}", time_num));
            let _ = fs::create_dir_all(&temp_extract_dir);
            if let Ok(paks) = extract_with_winrar(path, &temp_extract_dir, true) {
                for pak_rel in paks {
                    let pak_path = temp_extract_dir.join(pak_rel);
                    if let Ok(mut file) = fs::File::open(&pak_path) {
                        let mut hasher = Sha256::new();
                        let mut buffer = [0; 8192];
                        while let Ok(count) = file.read(&mut buffer) {
                            if count == 0 { break; }
                            hasher.update(&buffer[..count]);
                        }
                        hashes.push(hasher.finalize().iter().map(|b| format!("{:02x}", b)).collect());
                    }
                }
            }
            let _ = fs::remove_dir_all(&temp_extract_dir);
        }
        
        results.push(PrepareImportResult {
            file_path: path_str,
            pak_hashes: hashes,
        });
    }
    
    Ok(results)
}
