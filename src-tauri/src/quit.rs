//! Quit coordination: the app exits only after every open window confirms it saved.
use std::collections::HashSet;

#[derive(Default)]
pub struct QuitCoordinator {
    request_id: Option<String>,
    pending: HashSet<String>,
}
#[derive(Debug, PartialEq)]
pub enum QuitProgress { Ignore, Waiting, Exit, Cancel }
impl QuitCoordinator {
    pub fn begin(&mut self, request_id: String, windows: impl Iterator<Item=String>) -> bool {
        if self.request_id.is_some() { return false; }
        self.request_id=Some(request_id);
        self.pending=windows.collect();
        true
    }
    /// Whether the current request still waits on a window's reply.
    pub fn is_waiting(&self) -> bool { !self.pending.is_empty() }
    /// Drops the current request so the next close can start over.
    pub fn abandon(&mut self) { self.request_id=None; self.pending.clear(); }
    pub fn finish(&mut self, request_id: &str, window: &str, success: bool) -> QuitProgress {
        if self.request_id.as_deref()!=Some(request_id) || !self.pending.remove(window) {
            return QuitProgress::Ignore;
        }
        if !success {
            self.abandon();
            QuitProgress::Cancel
        } else if self.pending.is_empty() {
            // Keep the token until exit so another close cannot start a second request.
            QuitProgress::Exit
        } else { QuitProgress::Waiting }
    }
    /// At the deadline a still-current request fails for one silent window, returned so it can be shown.
    pub fn expire(&mut self, request_id: &str) -> Option<String> {
        if self.request_id.as_deref()!=Some(request_id) { return None; }
        let label=self.pending.iter().next().cloned()?;
        self.finish(request_id,&label,false);
        Some(label)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn windows() -> impl Iterator<Item=String> { ["main".to_string(),"capture".to_string()].into_iter() }

    #[test]
    fn quit_requires_every_window_and_ignores_duplicate_or_obsolete_replies() {
        let mut quit=QuitCoordinator::default();
        assert!(quit.begin("first".into(),windows()));
        assert!(!quit.begin("concurrent".into(),windows()));
        assert_eq!(quit.finish("first","unknown",true),QuitProgress::Ignore);
        assert_eq!(quit.finish("first","main",true),QuitProgress::Waiting);
        assert_eq!(quit.finish("first","main",false),QuitProgress::Ignore);
        assert_eq!(quit.finish("first","capture",false),QuitProgress::Cancel);
        assert!(quit.begin("retry".into(),windows()));
        assert_eq!(quit.finish("first","capture",true),QuitProgress::Ignore);
        assert_eq!(quit.finish("retry","capture",true),QuitProgress::Waiting);
        assert_eq!(quit.finish("retry","main",true),QuitProgress::Exit);
        assert_eq!(quit.finish("retry","main",false),QuitProgress::Ignore);
        assert!(!quit.begin("after-success".into(),windows()));
    }

    #[test]
    fn deadline_cancels_only_the_current_request_once() {
        let mut quit=QuitCoordinator::default();
        assert!(quit.begin("first".into(),windows()));
        assert_eq!(quit.finish("first","main",true),QuitProgress::Waiting);
        assert_eq!(quit.expire("stale"),None);
        assert_eq!(quit.expire("first").as_deref(),Some("capture"));
        assert_eq!(quit.expire("first"),None);
        assert_eq!(quit.finish("first","capture",true),QuitProgress::Ignore);
        assert!(quit.begin("retry".into(),windows()));
    }

    #[test]
    fn windowless_or_abandoned_requests_do_not_wait() {
        let mut quit=QuitCoordinator::default();
        assert!(quit.begin("empty".into(),std::iter::empty()));
        assert!(!quit.is_waiting());
        quit.abandon();
        assert!(quit.begin("emit-failed".into(),windows()));
        assert!(quit.is_waiting());
        quit.abandon();
        assert!(!quit.is_waiting());
        assert_eq!(quit.finish("emit-failed","main",true),QuitProgress::Ignore);
        assert!(quit.begin("retry".into(),windows()));
    }
}
