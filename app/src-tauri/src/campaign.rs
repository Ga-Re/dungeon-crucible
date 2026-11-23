//! Campaign folders: every resource is a plain file inside the folder the DM
//! opened. All file commands take paths relative to that folder and refuse
//! anything that would leave it.

use serde::Serialize;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

#[derive(Default)]
pub struct CampaignState(pub Mutex<Option<PathBuf>>);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CampaignInfo {
    pub root: String,
    pub name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedFile {
    /// Path relative to the campaign folder, with forward slashes.
    pub rel_path: String,
    /// Absolute path, for the asset protocol (convertFileSrc).
    pub abs_path: String,
}

/// Joins `rel` onto `root`, rejecting absolute paths and `..`.
pub fn safe_join(root: &Path, rel: &str) -> Result<PathBuf, String> {
    if rel.is_empty() {
        return Err("Empty path".into());
    }
    let rel_path = Path::new(rel);
    let mut out = root.to_path_buf();
    for c in rel_path.components() {
        match c {
            Component::Normal(part) => out.push(part),
            Component::CurDir => {}
            _ => return Err(format!("Path not allowed: {rel}")),
        }
    }
    Ok(out)
}

fn root(state: &State<CampaignState>) -> Result<PathBuf, String> {
    state.0.lock().map_err(|_| "State poisoned")?.clone().ok_or_else(|| "No campaign folder open".to_string())
}

fn to_rel(root: &Path, p: &Path) -> String {
    p.strip_prefix(root)
        .unwrap_or(p)
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/")
}

fn activate(app: &AppHandle, state: &State<CampaignState>, folder: PathBuf) -> Result<CampaignInfo, String> {
    let folder = folder.canonicalize().map_err(|e| e.to_string())?;
    if !folder.is_dir() {
        return Err("Not a folder".into());
    }
    // Lets the DM and table windows load maps from this folder via asset://.
    app.asset_protocol_scope().allow_directory(&folder, true).map_err(|e| e.to_string())?;
    let name = folder.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    *state.0.lock().map_err(|_| "State poisoned")? = Some(folder.clone());
    Ok(CampaignInfo { root: folder.to_string_lossy().into_owned(), name })
}

/// Shows a folder picker and opens (or starts) a campaign there.
#[tauri::command]
pub async fn pick_campaign_folder(app: AppHandle, state: State<'_, CampaignState>) -> Result<Option<CampaignInfo>, String> {
    let Some(picked) = app.dialog().file().set_title("Campaign folder").blocking_pick_folder() else {
        return Ok(None);
    };
    let folder = picked.into_path().map_err(|e| e.to_string())?;
    activate(&app, &state, folder).map(Some)
}

/// Reopens a known campaign folder (e.g. the last one used).
#[tauri::command]
pub fn open_campaign_folder(app: AppHandle, state: State<'_, CampaignState>, path: String) -> Result<CampaignInfo, String> {
    activate(&app, &state, PathBuf::from(path))
}

#[tauri::command]
pub fn read_text(state: State<'_, CampaignState>, rel: String) -> Result<String, String> {
    let p = safe_join(&root(&state)?, &rel)?;
    fs::read_to_string(&p).map_err(|e| format!("{rel}: {e}"))
}

/// Writes atomically: temp file next to the target, then rename.
#[tauri::command]
pub fn write_text(state: State<'_, CampaignState>, rel: String, content: String) -> Result<(), String> {
    let p = safe_join(&root(&state)?, &rel)?;
    if let Some(dir) = p.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = p.with_extension("tmp-write");
    fs::write(&tmp, content).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &p).map_err(|e| e.to_string())
}

/// Lists files in a campaign sub-folder (non-recursive), relative paths.
#[tauri::command]
pub fn list_files(state: State<'_, CampaignState>, dir: String) -> Result<Vec<String>, String> {
    let r = root(&state)?;
    let d = if dir.is_empty() || dir == "." { r.clone() } else { safe_join(&r, &dir)? };
    if !d.exists() {
        return Ok(vec![]);
    }
    let mut out = vec![];
    for entry in fs::read_dir(&d).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
            out.push(to_rel(&r, &entry.path()));
        }
    }
    out.sort();
    Ok(out)
}

#[tauri::command]
pub fn absolute_path(state: State<'_, CampaignState>, rel: String) -> Result<String, String> {
    Ok(safe_join(&root(&state)?, &rel)?.to_string_lossy().into_owned())
}

/// Picks an image or video map and copies it into `maps/` of the campaign.
#[tauri::command]
pub async fn import_map_file(app: AppHandle, state: State<'_, CampaignState>) -> Result<Option<ImportedFile>, String> {
    let r = root(&state)?;
    let Some(picked) = app
        .dialog()
        .file()
        .add_filter("Maps", &["png", "jpg", "jpeg", "webp", "mp4", "webm"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let src = picked.into_path().map_err(|e| e.to_string())?;
    let file_name = src.file_name().ok_or("Invalid file")?.to_string_lossy().into_owned();
    let maps = r.join("maps");
    fs::create_dir_all(&maps).map_err(|e| e.to_string())?;
    let dest = unique_path(&maps, &file_name);
    if src.canonicalize().ok() != dest.canonicalize().ok() {
        fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    }
    Ok(Some(ImportedFile { rel_path: to_rel(&r, &dest), abs_path: dest.to_string_lossy().into_owned() }))
}

fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let p = Path::new(name);
    let stem = p.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let ext = p.extension().map(|s| format!(".{}", s.to_string_lossy())).unwrap_or_default();
    (2..)
        .map(|i| dir.join(format!("{stem}-{i}{ext}")))
        .find(|c| !c.exists())
        .expect("unbounded range")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_join_accepts_nested_relative_paths() {
        let r = Path::new("/campaign");
        assert_eq!(safe_join(r, "maps/crypt.webp").unwrap(), PathBuf::from("/campaign/maps/crypt.webp"));
        assert_eq!(safe_join(r, "./notes/a.md").unwrap(), PathBuf::from("/campaign/notes/a.md"));
    }

    #[test]
    fn safe_join_rejects_escapes() {
        let r = Path::new("/campaign");
        assert!(safe_join(r, "../etc/passwd").is_err());
        assert!(safe_join(r, "maps/../../x").is_err());
        assert!(safe_join(r, "/etc/passwd").is_err());
        assert!(safe_join(r, "").is_err());
    }

    #[test]
    fn unique_path_appends_counter() {
        let dir = std::env::temp_dir().join(format!("dc-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("map.png"), b"x").unwrap();
        assert_eq!(unique_path(&dir, "map.png"), dir.join("map-2.png"));
        assert_eq!(unique_path(&dir, "other.png"), dir.join("other.png"));
        fs::remove_dir_all(&dir).unwrap();
    }
}
