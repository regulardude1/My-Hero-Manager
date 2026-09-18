import os
import sys
import json
import re
import subprocess
import shutil
import tempfile

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

def slot_token(slot):
    # "Sp_D1_00" -> "SpD1_00" (the token used inside material/texture names)
    if slot.startswith(("Eq_", "Fm_", "Or_", "Sp_", "Js_")):
        return slot[:2] + slot[3:]
    return slot

def token_to_folder(token):
    # "EqF1_00" -> "Eq/F1_00" (pak subfolder, forward slashes)
    if len(token) >= 2 and token[0].isalpha() and token[1].isalpha():
        return token[:2] + "/" + token[2:]
    return token

def tex_folder_from_name(name, char_id):
    # "T_Ch006_EqF1_00_bodyA_D" -> "Eq/F1_00" (which slot folder the texture belongs in)
    # Slot tokens contain an underscore (e.g. "EqF1_00"), so match the full token.
    m = re.match(r"^T_(Ch\d{3})_([A-Za-z0-9]+_\d{2})_", name)
    if m and m.group(1) == char_id:
        return token_to_folder(m.group(2))
    return ""

def classify_tex(name):
    n = name.lower().replace("_", "")
    if "colormask" in n:
        return "colormask"
    if "bodyao" in n or n.endswith("ao"):
        return "ao"
    if "acc" in n:
        return "acc"
    if n.endswith("d"):
        return "diffuse"
    return "other"

def list_pak_files(pak, repak_exe, aes_key):
    cmd = [repak_exe]
    if aes_key:
        cmd += ["-a", aes_key]
    cmd += ["list", pak]
    out = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout
    return [l.strip() for l in out.splitlines() if l.strip()]

def get_target_slot_assets(char_id, target_folder, pak, repak_exe, aes_key):
    """Return (material_names, texture_names) for the target slot in the game pak."""
    files = list_pak_files(pak, repak_exe, aes_key)
    prefix = f"HerovsGame/Content/Character/{char_id}/Model/{target_folder.replace(os.sep, '/')}/"
    mats, texs = [], []
    for f in files:
        if f.startswith(prefix) and f.endswith(".uasset"):
            base = f.split("/")[-1][:-7]  # strip ".uasset" (7 chars)
            if "/Mat/" in f:
                mats.append(base)
            elif "/Tex/" in f:
                texs.append(base)
    return mats, texs

def get_material_texture_refs(char_id, target_folder, mat_name, pak, repak_exe, aes_key, uejson_exe, temp_dir):
    """Export the target slot's material and return the T_ChXXX_* textures it references."""
    asset_path = f"HerovsGame/Content/Character/{char_id}/Model/{target_folder.replace(os.sep, '/')}/Mat/{mat_name}.uasset"
    out = subprocess.run([repak_exe, "-a", aes_key, "get", pak, asset_path], capture_output=True, check=True)
    if not out.stdout:
        return set()
    uasset = os.path.join(temp_dir, mat_name + ".uasset")
    with open(uasset, "wb") as f:
        f.write(out.stdout)
    # UEJSON also needs the companion .uexp (if any) written alongside
    try:
        out_exp = subprocess.run([repak_exe, "-a", aes_key, "get", pak, asset_path[:-7] + ".uexp"], capture_output=True)
        if out_exp.stdout:
            with open(uasset[:-7] + ".uexp", "wb") as f:
                f.write(out_exp.stdout)
    except Exception:
        pass
    try:
        run_silent([uejson_exe, "-e", uasset])
    except Exception:
        return set()
    jpath = uasset[:-7] + ".json"  # ".uasset" (7) -> ".json"
    if not os.path.exists(jpath):
        return set()
    with open(jpath, encoding="utf-8") as f:
        data = json.load(f)
    refs = set()
    for n in data.get("NameMap", []):
        if isinstance(n, str) and n.startswith("T_") and char_id in n:
            refs.add(n)
    for imp in data.get("Imports", []):
        on = imp.get("ObjectName", "")
        if isinstance(on, str) and on.startswith("T_") and char_id in on:
            refs.add(on)
    return refs

def build_tex_rename_map(source_tex_names, target_tex_names):
    targets_by_class = {}
    for t in target_tex_names:
        targets_by_class.setdefault(classify_tex(t), []).append(t)
    rename = {}
    for s in source_tex_names:
        cls = classify_tex(s)
        cands = targets_by_class.get(cls, [])
        if cands:
            rename[s] = cands[0]
    return rename

def build_material_remap(source_mats_in_mesh, source_token, target_token, target_mats):
    remap = {}
    for sm in source_mats_in_mesh:
        if source_token and source_token in sm:
            part = sm.split(source_token, 1)[1]
            for tm in target_mats:
                if target_token in tm and tm.split(target_token, 1)[1] == part:
                    remap[sm] = tm
                    break
    return remap

def export_mod(mod_path, uejson_path, mode, source_slot, target_slot, game_pak=None, repak_exe=None, aes_key=None):
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
    
    # NOTE: We only move the actual costume mesh (e.g. sk_ch102_default_00.uasset).
    # Companion files like *_PhysicsAsset or *_Skeleton_AnimBlueprint are left in
    # their original slot untouched — the game resolves them by their fixed paths,
    # and the mod's materials/textures keep overriding the game by their own paths.
    for filename in os.listdir(source_mesh_dir):
        if filename.lower().startswith('sk_ch') and filename.lower().endswith('_00.uasset'):
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
    game_pak = sys.argv[6] if len(sys.argv) > 6 and sys.argv[6] else None
    repak_exe = sys.argv[7] if len(sys.argv) > 7 and sys.argv[7] else None
    aes_key = sys.argv[8] if len(sys.argv) > 8 and sys.argv[8] else None
    
    export_mod(mod_path, uejson_path, mode, source_slot, target_slot, game_pak, repak_exe, aes_key)
