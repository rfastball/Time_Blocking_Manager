//! Shell preferences kept as small files beside the database.
use crate::model::*;
use std::{fs, path::{Path, PathBuf}};

pub fn db_path(root: &Path) -> PathBuf { root.join("blokky.sqlite") }

pub fn capture_shortcut(root: &Path) -> String {
    fs::read_to_string(root.join("capture-shortcut.txt")).unwrap_or_else(|_|"Ctrl+Shift+Space".into())
}
pub fn save_capture_shortcut(root: &Path, value: &str) -> std::io::Result<()> { fs::write(root.join("capture-shortcut.txt"),value) }
pub fn validate_shortcut(value: &str) -> Result<()> {
    if value.len()>100||!value.split('+').any(|v|matches!(v,"Ctrl"|"Alt"|"Control")) {
        return Err(error("validation","Ctrl 또는 Alt를 포함한 단축키를 지정하세요."));
    }
    Ok(())
}

pub fn exit_on_close_setting(root:&Path,enabled:Option<bool>)->Result<bool>{
    let path=root.join("exit-on-close.txt");
    if let Some(enabled)=enabled {
        fs::write(path,if enabled {"true"} else {"false"})?;
        return Ok(enabled);
    }
    match fs::read_to_string(path) {
        Ok(value)=>value.trim().parse().map_err(|_|error("storage","창 닫기 설정을 읽지 못했습니다. 설정을 다시 선택하세요.")),
        Err(e) if e.kind()==std::io::ErrorKind::NotFound=>Ok(false),
        Err(e)=>Err(e.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn close_preference_persists_and_reports_invalid_or_failed_storage(){
        let dir=tempfile::tempdir().unwrap();let root=dir.path();
        assert!(!exit_on_close_setting(root,None).unwrap());
        for value in [true,false] {
            assert_eq!(exit_on_close_setting(root,Some(value)).unwrap(),value);
            assert_eq!(exit_on_close_setting(root,None).unwrap(),value);
        }
        fs::write(root.join("exit-on-close.txt"),"invalid").unwrap();
        assert!(exit_on_close_setting(root,None).is_err());
        assert!(exit_on_close_setting(root,Some(true)).unwrap());
        let missing=root.join("missing");
        assert!(exit_on_close_setting(&missing,Some(true)).is_err());
        fs::remove_file(root.join("exit-on-close.txt")).unwrap();
        fs::create_dir(root.join("exit-on-close.txt")).unwrap();
        assert!(exit_on_close_setting(root,None).is_err());
        assert!(exit_on_close_setting(root,Some(false)).is_err());
    }

    #[test]
    fn capture_shortcut_needs_a_modifier_and_survives_restart(){
        for ok in ["Ctrl+Shift+Space","Alt+K","Control+1"] { assert!(validate_shortcut(ok).is_ok(),"{ok}"); }
        for bad in ["Shift+Space","K","CtrlK",&format!("Ctrl+{}","K".repeat(100))] { assert_eq!(validate_shortcut(bad).unwrap_err().code,"validation"); }
        let dir=tempfile::tempdir().unwrap();let root=dir.path();
        assert_eq!(capture_shortcut(root),"Ctrl+Shift+Space");
        save_capture_shortcut(root,"Alt+K").unwrap();
        assert_eq!(capture_shortcut(root),"Alt+K");
    }
}
