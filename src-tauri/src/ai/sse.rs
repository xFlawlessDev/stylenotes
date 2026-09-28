//! Incremental Server-Sent Events parsing shared by the providers.
//!
//! The buffer accepts arbitrary byte chunks and yields complete lines; the
//! providers then interpret `data:` payloads. Ported from the alnair-router
//! gateway so the parsing rules stay identical.

#[derive(Debug, Default)]
pub struct SseLineBuffer {
    buffer: String,
}

impl SseLineBuffer {
    /// Appends a chunk and returns every complete line it completed.
    pub fn push(&mut self, chunk: &[u8]) -> Vec<String> {
        self.buffer.push_str(&String::from_utf8_lossy(chunk));

        let mut lines = Vec::new();
        while let Some(newline_index) = self.buffer.find('\n') {
            let mut line: String = self.buffer.drain(..=newline_index).collect();
            if line.ends_with('\n') {
                line.pop();
            }
            if line.ends_with('\r') {
                line.pop();
            }
            lines.push(line);
        }
        lines
    }

    /// Returns any trailing line that never received a newline.
    pub fn finish(&mut self) -> Option<String> {
        if self.buffer.is_empty() {
            return None;
        }
        let mut line = std::mem::take(&mut self.buffer);
        if line.ends_with('\r') {
            line.pop();
        }
        Some(line)
    }
}

/// Extracts the payload of a `data:` line, or `None` for comments/blank lines.
pub fn parse_data_line(line: &str) -> Option<&str> {
    let line = line.trim();
    if line.is_empty() || line.starts_with(':') {
        return None;
    }
    let data = line.strip_prefix("data:")?;
    Some(data.trim_start())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_data_line_accepts_space_after_colon() {
        assert_eq!(parse_data_line(r#"data: {"x":1}"#), Some(r#"{"x":1}"#));
    }

    #[test]
    fn parse_data_line_accepts_no_space() {
        assert_eq!(parse_data_line(r#"data:{"x":1}"#), Some(r#"{"x":1}"#));
    }

    #[test]
    fn parse_data_line_skips_comments_and_blank() {
        assert_eq!(parse_data_line(": keep-alive"), None);
        assert_eq!(parse_data_line("   "), None);
        assert_eq!(parse_data_line("event: message"), None);
    }

    #[test]
    fn push_splits_on_newlines_across_chunks() {
        let mut buffer = SseLineBuffer::default();
        assert!(buffer.push(b"data: {\"a\"").is_empty());
        let lines = buffer.push(b":1}\n\n");
        assert_eq!(lines.len(), 2);
        assert_eq!(parse_data_line(&lines[0]), Some(r#"{"a":1}"#));
    }

    #[test]
    fn finish_returns_leftover_final_line() {
        let mut buffer = SseLineBuffer::default();
        assert!(buffer.push(b"data: [DONE]").is_empty());
        assert_eq!(buffer.finish(), Some("data: [DONE]".to_string()));
        assert_eq!(buffer.finish(), None);
    }
}
