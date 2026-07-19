import os
import sys
import json
import re
import subprocess

def run_silent(command):
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def export_mod(mod_path, target_slot, uejson_path):
    print(f"Exporting {mod_path} to slot {target_slot}...")
    
    # Base folder of the mod
    path = os.path.join(mod_path, "HerovsGame", "Content", "Character")
    if not os.path.exists(path):
        print(f"Error: Mod structure invalid: {path}")
        return False
        
    meshPaths = []
    for root, dirs, files in os.walk(path):
        if os.path.basename(root) == "Mesh":
            meshPaths.append(root)
    
    for mesh_dir in meshPaths:
        for filename in os.listdir(mesh_dir):
            if filename.lower().startswith('sk_ch') and filename.lower().endswith('_00.uasset'):
                filepath = os.path.join(mesh_dir, filename)
                
                # Construct target path string
                # Extract char_id from filename (e.g., SK_Ch102_... -> Ch102)
                char_id = filename.split('_')[1]
                if target_slot == "Default":
                    target_slot_folder = "Default"
                    target_sk = f"sk_{char_id.lower()}_00_00"
                elif target_slot.startswith("Costume_"):
                    target_slot_folder = target_slot
                    target_sk = f"sk_{char_id.lower()}_00_{target_slot.split('_')[1]}"
                elif target_slot.startswith(("Eq_", "Fm_", "Or_", "Sp_")):
                    prefix = target_slot[:2]
                    suffix = target_slot[3:]
                    target_slot_folder = f"{prefix}/{suffix}"
                    target_sk = f"sk_{char_id.lower()}_{prefix.lower()}{suffix.lower()}"
                else:
                    target_slot_folder = target_slot
                    target_sk = f"sk_{char_id.lower()}_{target_slot.lower()}"
                    
                skin_str = f"{char_id}/Model/{target_slot_folder}/Mesh/{target_sk}"
                
                print(f"Processing mesh: {filename} -> {target_sk}")
                
                run_silent([uejson_path, "-e", filepath])
                json_path = filepath.replace(".uasset", ".json")
                
                if not os.path.exists(json_path):
                    continue
                    
                # Edit JSON
                with open(json_path, 'r+', encoding='utf-8') as f:
                    data = json.load(f)
                    namemap = data["NameMap"]
                    
                    for name in namemap:
                        iName = namemap.index(name)
                        if filename.lower().split(".")[0] in str(name).lower() and "PhysicsAsset" not in name:
                            if "Model/" in name:
                                namemap[iName] = namemap[iName].partition("Character/")[0] + "Character/" + skin_str
                            else:
                                namemap[iName] = re.sub(filename.split(".")[0], skin_str.partition("Mesh/")[2], namemap[iName], flags=re.IGNORECASE)
                    
                    for export in data["Exports"]:
                        if filename.lower().split(".")[0] in export["ObjectName"].lower():
                            export["ObjectName"] = re.sub(filename.split(".")[0], skin_str.partition("Mesh/")[2], export["ObjectName"], flags=re.IGNORECASE)
                    
                    f.seek(0)
                    json.dump(data, f, indent=4)
                    f.truncate()
                
                # Rebuild
                run_silent([uejson_path, "-i", json_path])
                
                # Rename the files to match the new slot
                final_path = os.path.join(mod_path, "HerovsGame", "Content", "Character", char_id, "Model", target_slot_folder, "Mesh") + os.sep
                os.makedirs(final_path, exist_ok=True)
                
                for f2_name in os.listdir(mesh_dir):
                    if (f2_name.lower().split(".")[0] == filename.lower().split(".")[0]) and (f2_name.endswith('.uasset') or f2_name.endswith('.uexp')):
                        os.rename(os.path.join(mesh_dir, f2_name), os.path.join(final_path, target_sk + "." + f2_name.split(".")[1]))
                
                if os.path.exists(json_path):
                    os.remove(json_path)
                    
    print("Success")
    return True

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: SkinSwapperEngine.py <mod_path> <target_slot> <uejson_exe_path>")
        sys.exit(1)
    
    mod_path = sys.argv[1]
    target_slot = sys.argv[2]
    uejson_path = sys.argv[3]
    
    export_mod(mod_path, target_slot, uejson_path)
