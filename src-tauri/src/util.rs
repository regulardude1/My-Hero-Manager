use std::fs;
use std::path::Path;
use std::collections::HashMap;

pub fn load_cache() -> HashMap<String, serde_json::Value> {
    let cache_path = get_data_dir().join("cache/character_scan_cache.json");
    if let Ok(content) = fs::read_to_string(&cache_path) {
        if let Ok(json) = serde_json::from_str(&content) {
            return json;
        }
    }
    HashMap::new()
}

pub fn save_cache(cache: &HashMap<String, serde_json::Value>) {
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
    default_map.insert("100".to_string(), "Mt. Lady".to_string());
    default_map.insert("101".to_string(), "Cementoss".to_string());
    default_map.insert("102".to_string(), "Ibara Shiozaki".to_string());
    default_map.insert("103".to_string(), "Kurogiri".to_string());
    default_map.insert("104".to_string(), "Neito Monoma".to_string());
    default_map.insert("105".to_string(), "Hitoshi Shinso".to_string());
    default_map.insert("109".to_string(), "Present Mic".to_string());
    default_map.insert("110".to_string(), "Hanta Sero".to_string());
    default_map.insert("111".to_string(), "Mirko".to_string());
    default_map.insert("112".to_string(), "High-End Nomu (Hood)".to_string());
    default_map.insert("113".to_string(), "Midnight".to_string());
    default_map.insert("114".to_string(), "Star and Stripe".to_string());
    default_map.insert("115".to_string(), "Lady Nagant".to_string());
    default_map.insert("200".to_string(), "Armored All Might".to_string());
    default_map.insert("201".to_string(), "Prime AFO".to_string());
    default_map.insert("202".to_string(), "Deku".to_string());
    default_map.insert("501".to_string(), "NPC Male".to_string());
    default_map.insert("502".to_string(), "Kota".to_string());
    default_map.insert("503".to_string(), "NPC Female".to_string());
    default_map.insert("512".to_string(), "Custom Character Male".to_string());
    default_map.insert("513".to_string(), "Custom Character Female".to_string());
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
    default_map.insert("015".to_string(), "Tomura Shigaraki".to_string());
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
    default_map.insert("027".to_string(), "Mina Ashido".to_string());
    default_map.insert("028".to_string(), "Minoru Mineta".to_string());
    default_map.insert("029".to_string(), "Camie Utsushimi".to_string());
    default_map.insert("030".to_string(), "Seiji Shishikura".to_string());
    default_map.insert("031".to_string(), "Sir Nighteye".to_string());
    default_map.insert("032".to_string(), "Gang Orca".to_string());
    default_map.insert("033".to_string(), "FatGum".to_string());
    default_map.insert("034".to_string(), "Overhaul".to_string());
    default_map.insert("036".to_string(), "Kendo Rappa".to_string());
    default_map.insert("037".to_string(), "Twice".to_string());
    default_map.insert("038".to_string(), "Mr. Compress".to_string());
    default_map.insert("043".to_string(), "Hawks".to_string());
    default_map.insert("044".to_string(), "Gentle Criminal".to_string());
    default_map.insert("045".to_string(), "Mei Hatsume".to_string());
    default_map.insert("046".to_string(), "Itsuka Kendo".to_string());
    default_map.insert("047".to_string(), "Tetsutetsu Tetsutetsu".to_string());
    default_map.insert("048".to_string(), "Nomu".to_string());
    default_map.insert("093".to_string(), "La Brava".to_string());
    default_map
}

use std::sync::OnceLock;

pub static DATA_DIR: OnceLock<std::path::PathBuf> = OnceLock::new();

pub static TOOLS_DIR: OnceLock<std::path::PathBuf> = OnceLock::new();

pub fn get_data_dir() -> std::path::PathBuf {
    DATA_DIR.get().cloned().unwrap_or_else(|| {
        let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
        let parent = cwd.parent().unwrap_or(&cwd).to_path_buf();
        if parent.join("src-tauri").exists() { parent } else { cwd }
    })
}

pub fn get_tools_dir() -> std::path::PathBuf {
    TOOLS_DIR.get().cloned().unwrap_or_else(|| {
        get_data_dir().join("tools")
    })
}

pub fn sanitize_folder_name(title: &str) -> String {
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

#[tauri::command]
pub fn check_path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
pub fn create_dir_if_not_exists(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| e.to_string())
}
