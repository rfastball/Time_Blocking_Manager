//! The append-only operations log beside the database.
use crate::model::*;
use std::{fs::{File, OpenOptions}, io::Write, path::Path};

pub fn open(root: &Path) -> std::io::Result<File> {
    OpenOptions::new().create(true).append(true).open(root.join("blokky.log"))
}
/// Logging never fails the operation it describes.
pub fn record(root: &Path, event: &str, code: &str) {
    if let Ok(mut f) = open(root) {
        let _ = writeln!(f, "{} app={} schema=7 event={} code={}", chrono::Local::now().to_rfc3339(), env!("CARGO_PKG_VERSION"), event, code);
    }
}
pub fn outcome<T>(result: &Result<T>) -> &str { result.as_ref().err().map_or("ok", |e| e.code.as_str()) }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn records_append_one_line_per_outcome() {
        let dir=tempfile::tempdir().unwrap();let root=dir.path();
        let failed:Result<()>=Err(error("pending","x"));
        record(root,"restore",outcome(&Ok::<_,AppError>(())));
        record(root,"restore",outcome(&failed));
        let log=std::fs::read_to_string(root.join("blokky.log")).unwrap();
        let lines:Vec<_>=log.lines().collect();
        assert_eq!(lines.len(),2);
        assert!(lines[0].ends_with("event=restore code=ok")&&lines[0].contains(concat!("app=",env!("CARGO_PKG_VERSION"))));
        assert!(lines[1].ends_with("event=restore code=pending"));
        record(&root.join("missing"),"restore","ok");
    }
}
