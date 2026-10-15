//! Windows holding input not yet saved; replacing the database under them would lose it.
use crate::model::*;
use std::collections::HashSet;

#[derive(Default)]
pub struct UnsavedWindows(HashSet<String>);
impl UnsavedWindows {
    pub fn set(&mut self, label: &str, dirty: bool) {
        if dirty { self.0.insert(label.into()); } else { self.0.remove(label); }
    }
    /// The caller's restore queue marks it busy; persisted drafts remain guarded by Store::restore.
    pub fn ensure_only(&self, label: &str) -> Result<()> {
        if self.0.iter().any(|other|other!=label) { return Err(error("pending","다른 창의 미저장 입력을 먼저 저장하세요.")); }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_another_windows_input_blocks() {
        let mut unsaved=UnsavedWindows::default();
        assert!(unsaved.ensure_only("main").is_ok());
        unsaved.set("main",true);
        assert!(unsaved.ensure_only("main").is_ok());
        assert_eq!(unsaved.ensure_only("capture").unwrap_err().code,"pending");
        unsaved.set("main",false);unsaved.set("main",false);
        assert!(unsaved.ensure_only("capture").is_ok());
    }
}
