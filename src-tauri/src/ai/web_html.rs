//! URL and HTML handling for the AI assistant's web tools.
//!
//! Pure functions, unit-tested, no I/O: the network lives in `ai/web.rs`. This
//! module owns the one security decision that matters for `web_fetch` — which
//! hosts the assistant is allowed to reach — plus the HTML-to-text reduction
//! that keeps a page's boilerplate out of the prompt.

use std::net::IpAddr;

/// Longest snippet kept from a search result.
pub const SEARCH_SNIPPET_MAX: usize = 900;

/// Longest search-result title kept.
pub const SEARCH_TITLE_MAX: usize = 240;

/// Default page budget for `web_fetch`.
pub const FETCH_DEFAULT_MAX_CHARS: usize = 12_000;

/// Hard ceiling for `web_fetch`, whatever the caller asks for.
pub const FETCH_MAX_CHARS: usize = 80_000;

/// Hosts that must never be reachable: the app process runs with the user's
/// full privileges, so a URL from the model is untrusted input.
///
/// Blocking is deliberately narrow and literal rather than a full DNS resolve:
/// resolving here would still race the later connect (DNS rebinding), so the
/// value is in stopping the obvious cases the model would otherwise walk into.
pub fn is_blocked_host(host: &str) -> bool {
    let host = host.trim().trim_matches(['[', ']']).to_ascii_lowercase();
    if host.is_empty() {
        return true;
    }
    if host == "localhost" || host.ends_with(".localhost") {
        return true;
    }
    if let Ok(ip) = host.parse::<IpAddr>() {
        return is_private_ip(&ip);
    }
    // A bare name with no dot cannot be a public host.
    !host.contains('.')
}

fn is_private_ip(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let octets = v4.octets();
            octets[0] == 127                       // loopback
            || (octets[0] == 169 && octets[1] == 254) // link-local + cloud metadata
            || octets[0] == 10                     // RFC1918
            || (octets[0] == 172 && (16..=31).contains(&octets[1]))
            || (octets[0] == 192 && octets[1] == 168)
            || octets[0] == 0                      // "this network"
            || octets[0] >= 224 // multicast + reserved
        }
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6.is_unicast_link_local()
                || v6.is_unique_local()
                || v6.is_unspecified()
        }
    }
}

/// Validates a URL for `web_fetch`. Returns a reason when it must be refused.
pub fn vet_url(url: &str) -> Result<(), String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err("`url` must not be empty.".to_string());
    }
    let lower = trimmed.to_ascii_lowercase();
    if !lower.starts_with("https://") && !lower.starts_with("http://") {
        return Err("Only http and https URLs are supported.".to_string());
    }
    let rest = trimmed
        .split_once("://")
        .map(|(_, rest)| rest)
        .unwrap_or_default();
    // The authority ends at the first `/`, `?` or `#`.
    let authority = rest
        .split(['/', '?', '#'])
        .next()
        .unwrap_or_default()
        .rsplit('@') // drop any userinfo, which is never trusted
        .next()
        .unwrap_or_default();
    let host = authority.split(':').next().unwrap_or_default();
    if is_blocked_host(host) {
        return Err(format!(
            "`{host}` is a local or private address, which web_fetch refuses to reach."
        ));
    }
    Ok(())
}

/// Truncates to at most `max_chars` characters, never on a byte boundary.
pub fn truncate_chars(input: &str, max_chars: usize) -> String {
    input.chars().take(max_chars).collect()
}

/// Collapses runs of whitespace so page text reads as one paragraph per block.
pub fn collapse_whitespace(input: &str) -> String {
    input.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Removes a `<tag ...>...</tag>` block, including nested same-name tags.
///
/// An unterminated block drops the remainder: with a truncated `<script>` the
/// alternative is leaking minified JavaScript into the model's context.
fn strip_block(input: &str, tag: &str) -> String {
    let open = format!("<{tag}");
    let close = format!("</{tag}>");
    let lower_all = input.to_ascii_lowercase();
    let mut out = String::with_capacity(input.len());
    let mut cursor = 0usize;

    while let Some(relative) = lower_all[cursor..].find(&open) {
        let start = cursor + relative;
        // Keep everything before the block.
        out.push_str(&input[cursor..start]);

        let mut scan = start;
        let mut depth = 0usize;
        let end = loop {
            let next_open = lower_all[scan..].find(&open).map(|i| scan + i);
            let next_close = lower_all[scan..].find(&close).map(|i| scan + i);
            match (next_open, next_close) {
                (Some(o), Some(c)) if o < c => {
                    depth += 1;
                    scan = o + open.len();
                }
                (_, Some(c)) => {
                    depth = depth.saturating_sub(1);
                    scan = c + close.len();
                    if depth == 0 {
                        break scan;
                    }
                }
                // No closer left: the block runs to the end of the document.
                _ => return out,
            }
        };
        cursor = end;
    }

    out.push_str(&input[cursor..]);
    out
}

/// Removes `<script>`, `<style>` and comment noise before text extraction.
fn strip_noise(html: &str) -> String {
    let without_comments = strip_comments(html);
    let no_script = strip_block(&without_comments, "script");
    let no_style = strip_block(&no_script, "style");
    strip_block(&no_style, "noscript")
}

fn strip_comments(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut rest = input;
    while let Some(start) = rest.find("<!--") {
        out.push_str(&rest[..start]);
        match rest[start..].find("-->") {
            Some(end) => rest = &rest[start + end + 3..],
            None => return out,
        }
    }
    out.push_str(rest);
    out
}

/// Decodes the handful of entities that actually appear in page text.
///
/// Order matters: named entities are decoded before `&amp;`, so `&amp;lt;`
/// correctly becomes `&lt;` rather than `<`.
fn decode_entities(input: &str) -> String {
    input
        .replace("&nbsp;", " ")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
}

/// Turns a page into readable text: scripts/styles/comments dropped, block
/// tags turned into line breaks, entities decoded, whitespace collapsed.
pub fn html_to_text(html: &str) -> String {
    let cleaned = strip_noise(html);
    let mut spaced = String::with_capacity(cleaned.len());
    let bytes = cleaned.as_bytes();
    let mut index = 0usize;
    while index < bytes.len() {
        if bytes[index] == b'<' {
            // A tag: replace block-level ones with a newline, others with a space.
            let Some(end) = cleaned[index..].find('>') else {
                break;
            };
            let tag = &cleaned[index + 1..index + end];
            let name = tag
                .trim_start_matches('/')
                .split(|c: char| c.is_whitespace() || c == '/' || c == '>')
                .next()
                .unwrap_or_default()
                .to_ascii_lowercase();
            let is_block = matches!(
                name.as_str(),
                "p" | "div"
                    | "br"
                    | "li"
                    | "tr"
                    | "h1"
                    | "h2"
                    | "h3"
                    | "h4"
                    | "h5"
                    | "h6"
                    | "section"
                    | "article"
                    | "header"
                    | "footer"
                    | "blockquote"
                    | "pre"
                    | "table"
                    | "ul"
                    | "ol"
            );
            spaced.push(if is_block { '\n' } else { ' ' });
            index += end + 1;
        } else {
            let ch = cleaned[index..].chars().next().unwrap_or(' ');
            spaced.push(ch);
            index += ch.len_utf8();
        }
    }

    let decoded = decode_entities(&spaced);
    let mut lines: Vec<String> = Vec::new();
    for line in decoded.lines() {
        let collapsed = collapse_whitespace(line);
        if !collapsed.is_empty() {
            lines.push(collapsed);
        }
    }
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_localhost_and_loopback() {
        assert!(is_blocked_host("localhost"));
        assert!(is_blocked_host("api.localhost"));
        assert!(is_blocked_host("127.0.0.1"));
        assert!(is_blocked_host("127.1.2.3"));
    }

    #[test]
    fn blocks_private_ranges() {
        assert!(is_blocked_host("192.168.1.1"));
        assert!(is_blocked_host("10.0.0.1"));
        assert!(is_blocked_host("172.16.0.1"));
        assert!(is_blocked_host("172.31.255.255"));
    }

    /// The cloud metadata endpoint is the single highest-value SSRF target.
    #[test]
    fn blocks_cloud_metadata() {
        assert!(is_blocked_host("169.254.169.254"));
    }

    #[test]
    fn blocks_ipv6_private() {
        assert!(is_blocked_host("::1"));
        assert!(is_blocked_host("fe80::1"));
        assert!(is_blocked_host("fd00::1"));
    }

    #[test]
    fn allows_public_hosts() {
        assert!(!is_blocked_host("example.com"));
        assert!(!is_blocked_host("8.8.8.8"));
        assert!(!is_blocked_host("api.tavily.com"));
    }

    #[test]
    fn vet_rejects_non_http_schemes() {
        assert!(vet_url("file:///etc/passwd").is_err());
        assert!(vet_url("javascript:alert(1)").is_err());
        assert!(vet_url("").is_err());
    }

    #[test]
    fn vet_rejects_private_targets() {
        assert!(vet_url("http://localhost:3000/admin").is_err());
        assert!(vet_url("http://169.254.169.254/latest/meta-data").is_err());
        assert!(vet_url("https://192.168.0.1/router").is_err());
    }

    /// Userinfo must not be able to disguise the real host.
    #[test]
    fn vet_looks_past_userinfo() {
        assert!(vet_url("https://example.com@127.0.0.1/").is_err());
        assert!(vet_url("https://user:pass@example.com/").is_ok());
    }

    #[test]
    fn vet_accepts_public_https() {
        assert!(vet_url("https://example.com/page?q=1").is_ok());
    }

    #[test]
    fn text_drops_script_and_style() {
        let html = "<html><head><style>body{color:red}</style></head>\
                    <body><script>alert('x')</script><p>Hello world</p></body></html>";
        let text = html_to_text(html);
        assert!(text.contains("Hello world"));
        assert!(!text.contains("alert"));
        assert!(!text.contains("color:red"));
    }

    /// An unterminated script tag must not swallow the visible page.
    #[test]
    fn text_handles_unbalanced_script() {
        let html = "<p>Before</p><script>var a = 1;";
        let text = html_to_text(html);
        assert!(text.contains("Before"));
        assert!(!text.contains("var a"));
    }

    #[test]
    fn text_breaks_on_block_tags() {
        let text = html_to_text("<p>One</p><p>Two</p>");
        assert_eq!(text, "One\nTwo");
    }

    /// A double-escaped entity must decode exactly one level, not two.
    #[test]
    fn text_decodes_entities_once() {
        let text = html_to_text("<p>a &amp;lt; b &amp; c</p>");
        assert_eq!(text, "a &lt; b & c");
    }

    #[test]
    fn text_decodes_common_entities() {
        assert_eq!(
            html_to_text("<p>&quot;hi&quot; &amp; bye</p>"),
            "\"hi\" & bye"
        );
        assert_eq!(html_to_text("<p>a&nbsp;b</p>"), "a b");
    }

    #[test]
    fn text_ignores_comments() {
        let text = html_to_text("<p>Keep</p><!-- <p>Drop</p> -->");
        assert!(text.contains("Keep"));
        assert!(!text.contains("Drop"));
    }

    #[test]
    fn truncate_counts_characters_not_bytes() {
        let text = "日本語テキスト";
        assert_eq!(truncate_chars(text, 3), "日本語");
        assert_eq!(truncate_chars("abc", 10), "abc");
    }
}
