import os
import sys
import json
import re
import subprocess
import shutil

def run_silent(command):
    try:
        subprocess.run(command, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"Command failed with {e.returncode}\nSTDOUT: {e.stdout}\nSTDERR: {e.stderr}")

def get_slot_folder_and_sk(char_id, slot):
    if slot == "Default":
        return "Default", f"sk_{char_id.lower()}_00_00"
    elif slot.startswith("Costume_"):
        return slot, f"sk_{char_id.lower()}_00_{slot.split('_')[1]}"
    elif slot.startswith(("Eq_", "Fm_", "Or_", "Sp_")):
        prefix = slot[:2]
        suffix = slot[3:]
        return os.path.join(prefix, suffix), f"sk_{char_id.lower()}_{prefix.lower()}{suffix.lower()}"
    else:
        return slot, f"sk_{char_id.lower()}_{slot.lower()}"

def export_mod(mod_path, uejson_path, mode, source_slot, target_slot):
    print(f"Running mode={mode}, source={source_slot}, target={target_slot}")
    
    path = os.path.join(mod_path, "HerovsGame", "Content", "Character")
    if not os.path.exists(path):
        print(f"Error: Mod structure invalid: {path}")
        return False

    char_id = None
    for item in os.listdir(path):
        if os.path.isdir(os.path.join(path, item)) and item.startswith("Ch"):
            char_id = item
            break
            
    if not char_id:
        print("Error: Could not find character ID folder (ChXXX).")
        return False
        
    source_folder_name, source_sk = get_slot_folder_and_sk(char_id, source_slot)
    
    source_model_slot_dir = os.path.join(path, char_id, "Model", source_folder_name)
    source_mesh_dir = os.path.join(source_model_slot_dir, "Mesh")
    
    if mode == "remove":
        if os.path.exists(source_model_slot_dir):
            shutil.rmtree(source_model_slot_dir)
            print(f"Removed slot: {source_slot}")
        else:
            print(f"Error: Could not find source directory to remove: {source_model_slot_dir}")
        return True
        
    if not os.path.exists(source_mesh_dir):
        print(f"Error: Could not find source mesh directory: {source_mesh_dir}")
        return False
        
    target_folder_name, target_sk = get_slot_folder_and_sk(char_id, target_slot)
    target_mesh_dir = os.path.join(path, char_id, "Model", target_folder_name, "Mesh")
    
    os.makedirs(target_mesh_dir, exist_ok=True)
    
    for filename in os.listdir(source_mesh_dir):
        if filename.lower().startswith('sk_ch') and filename.lower().endswith('.uasset'):
            filepath = os.path.join(source_mesh_dir, filename)
            
            skin_str = f"{char_id}/Model/{target_folder_name.replace(os.sep, '/')}/Mesh/{target_sk}"
            print(f"Processing mesh: {filename} -> {target_sk}")
            
            # 1. Backup the original files so we can mutate in-place (UEJSON is very strict about paths and names)
            backup_uasset = filepath + ".backup"
            shutil.copy2(filepath, backup_uasset)
            
            uexp_file = filepath.replace(".uasset", ".uexp")
            backup_uexp = uexp_file + ".backup"
            if os.path.exists(uexp_file):
                shutil.copy2(uexp_file, backup_uexp)
            
            # 2. Extract JSON from the ORIGINAL file in its ORIGINAL directory
            run_silent([uejson_path, "-e", filepath])
            json_path = filepath.replace(".uasset", ".json")
            
            if not os.path.exists(json_path):
                continue
                
            # 3. Mutate the JSON
            with open(json_path, 'r+', encoding='utf-8') as f:
                data = json.load(f)
                namemap = data["NameMap"]
                
                orig_name_base = filename.split(".")[0]
                
                for name in namemap:
                    iName = namemap.index(name)
                    if orig_name_base.lower() in str(name).lower() and "PhysicsAsset" not in name:
                        if "Model/" in name:
                            namemap[iName] = namemap[iName].partition("Character/")[0] + "Character/" + skin_str
                        else:
                            namemap[iName] = re.sub(orig_name_base, skin_str.partition("Mesh/")[2], namemap[iName], flags=re.IGNORECASE)
                
                for export in data["Exports"]:
                    if orig_name_base.lower() in export["ObjectName"].lower():
                        export["ObjectName"] = re.sub(orig_name_base, skin_str.partition("Mesh/")[2], export["ObjectName"], flags=re.IGNORECASE)
                
                f.seek(0)
                json.dump(data, f, indent=4)
                f.truncate()
            
            # 4. Inject JSON back into the ORIGINAL file
            run_silent([uejson_path, "-i", json_path])
            
            if os.path.exists(json_path):
                os.remove(json_path)
                
            # 5. Move the mutated file to the target slot
            final_uasset = os.path.join(target_mesh_dir, target_sk + ".uasset")
            if os.path.exists(final_uasset):
                os.remove(final_uasset)
            shutil.move(filepath, final_uasset)
            
            if os.path.exists(uexp_file):
                final_uexp = os.path.join(target_mesh_dir, target_sk + ".uexp")
                if os.path.exists(final_uexp):
                    os.remove(final_uexp)
                shutil.move(uexp_file, final_uexp)
                
            # 6. Restore the backup to keep the source slot intact (for Add mode)
            if mode == "add":
                shutil.move(backup_uasset, filepath)
                if os.path.exists(backup_uexp):
                    shutil.move(backup_uexp, uexp_file)
            else:
                os.remove(backup_uasset)
                if os.path.exists(backup_uexp):
                    os.remove(backup_uexp)

    if mode == "swap":
        # Only remove the Mesh directory if it's empty, DO NOT remove the entire slot directory 
        # (which contains Material and Texture folders that the mesh still relies on)
        if os.path.exists(source_mesh_dir) and not os.listdir(source_mesh_dir):
            shutil.rmtree(source_mesh_dir)

    print("Success")
    return True

if __name__ == "__main__":
    if len(sys.argv) < 6:
        print("Usage: SkinSwapperEngine.py <mod_path> <uejson_exe_path> <mode> <source_slot> <target_slot>")
        sys.exit(1)
    
    mod_path = sys.argv[1]
    uejson_path = sys.argv[2]
    mode = sys.argv[3]
    source_slot = sys.argv[4]
    target_slot = sys.argv[5]
    
    export_mod(mod_path, uejson_path, mode, source_slot, target_slot)
