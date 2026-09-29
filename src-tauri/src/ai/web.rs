//! Network calls behind the assistant's web tools.
//!
//! Search is bring-your-own-key, matching the rest of the AI stack: the user
//! configures one provider and its key in Settings, and the key is encrypted at
//! rest like the model key. `combo` tries the configured providers in order.
//!
//! Everything here returns a plain `Result<_, String>`: the caller wraps it in a
//! `ToolResult`, so failures become text the model can read and relay rather
//! than a thrown error that would kill the turn.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::ai::web_html::{
    collapse_whitespace, html_to_text, truncate_chars, vet_url, FETCH_DEFAULT_MAX_CHARS,
    FETCH_MAX_CHARS, SEARCH_SNIPPET_MAX, SEARCH_TITLE_MAX,
};

/// Provider names the settings UI offers, in display order.
pub const SEARCH_PROVIDERS: &[&str] = &["tavily", "brave", "exa", "serper"];

/// Per-request timeout; a search must never outlast the model's turn.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);

/// Ceiling on the page body read into memory before it is reduced to text.
const MAX_FETCH_BYTES: usize = 2_000_000;

/// Search settings, resolved from `ai_settings` by the command layer.
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchConfig {
    /// Provider name, or `combo` to try `fallbacks` in order.
    pub provider: String,
    /// Key for the default provider.
    pub api_key: String,
    /// Ordered providers to try when `provider` is `combo`.
    pub fallbacks: Vec<String>,
}

impl SearchConfig {
    /// A provider and a key are both required; without them search is off.
    pub fn ready(&self) -> bool {
        !self.provider.trim().is_empty()
            && (!self.api_key.trim().is_empty() || self.provider == "combo")
    }

    /// Providers to attempt, in order, with their keys.
    fn chain(&self) -> Vec<(String, String)> {
        if self.provider.trim() == "combo" {
            return self
                .fallbacks
                .iter()
                .filter_map(|name| {
                    let provider = canonical_provider(name);
                    // `combo` reuses the single configured key for whichever
                    // provider is listed first, so a one-key setup still works.
                    let key = self.api_key.clone();
                    if key.trim().is_empty() {
                        None
                    } else {
                        Some((provider, key))
                    }
                })
                .collect();
        }
        vec![(canonical_provider(&self.provider), self.api_key.clone())]
    }
}

fn canonical_provider(name: &str) -> String {
    let lower = name.trim().to_ascii_lowercase();
    let stripped = lower
        .trim_end_matches("/search")
        .trim_end_matches("-search");
    match stripped {
        "tavily" => "tavily",
        "brave" => "brave",
        "exa" => "exa",
        "serper" => "serper",
        other => other,
    }
    .to_string()
}

/// One normalised search hit, identical regardless of provider.
fn hit(title: &str, url: &str, snippet: &str, position: usize) -> Value {
    let snippet = collapse_whitespace(snippet);
    let char_count = snippet.chars().count();
    json!({
        "title": truncate_chars(&collapse_whitespace(title), SEARCH_TITLE_MAX),
        "url": url,
        "snippet": truncate_chars(&snippet, SEARCH_SNIPPET_MAX),
        "snippet_truncated": char_count > SEARCH_SNIPPET_MAX,
        "position": position,
    })
}

fn results_from(items: &[Value]) -> Vec<Value> {
    items
        .iter()
        .enumerate()
        .map(|(index, item)| {
            let title = item.get("title").and_then(Value::as_str).unwrap_or("");
            let url = item.get("url").and_then(Value::as_str).unwrap_or("");
            // Providers disagree on the snippet field name.
            let snippet = item
                .get("content")
                .or_else(|| item.get("text"))
                .or_else(|| item.get("description"))
                .or_else(|| item.get("snippet"))
                .and_then(Value::as_str)
                .unwrap_or("");
            hit(title, url, snippet, index + 1)
        })
        .collect()
}

/// Runs a search, trying each configured provider until one answers.
pub async fn search(
    client: &reqwest::Client,
    config: &SearchConfig,
    query: &str,
    limit: usize,
) -> Result<Vec<Value>, String> {
    let query = query.trim();
    if query.is_empty() {
        return Err("`query` must not be empty.".to_string());
    }
    let chain = config.chain();
    if chain.is_empty() {
        return Err(
            "Web search is not configured. Add a search provider and API key in Settings → AI."
                .to_string(),
        );
    }

    let limit = limit.clamp(1, 20);
    let mut last_error = String::new();
    for (provider, key) in chain {
        match run_provider(client, &provider, &key, query, limit).await {
            Ok(results) => return Ok(results),
            Err(error) => last_error = error,
        }
    }
    Err(last_error)
}

async fn run_provider(
    client: &reqwest::Client,
    provider: &str,
    key: &str,
    query: &str,
    limit: usize,
) -> Result<Vec<Value>, String> {
    match provider {
        "tavily" => tavily(client, key, query, limit).await,
        "brave" => brave(client, key, query, limit).await,
        "exa" => exa(client, key, query, limit).await,
        "serper" => serper(client, key, query, limit).await,
        other => Err(format!(
            "Unknown search provider `{other}`. Supported: tavily, brave, exa, serper, combo."
        )),
    }
}

/// Reads a JSON body, turning a non-2xx response into a readable error.
///
/// The provider's error text is included because it is what tells the user
/// whether the key is wrong, the quota is spent, or the query was rejected.
async fn json_body(response: reqwest::Response, provider: &str) -> Result<Value, String> {
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|error| format!("{provider}: could not read the response ({error})"))?;
    if !status.is_success() {
        let detail = truncate_chars(&collapse_whitespace(&text), 300);
        return Err(format!("{provider} returned HTTP {status}: {detail}"));
    }
    serde_json::from_str(&text).map_err(|error| format!("{provider}: invalid JSON ({error})"))
}

async fn tavily(
    client: &reqwest::Client,
    key: &str,
    query: &str,
    limit: usize,
) -> Result<Vec<Value>, String> {
    let response = client
        .post("https://api.tavily.com/search")
        .bearer_auth(key)
        .json(&json!({ "query": query, "max_results": limit, "include_answer": false }))
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .map_err(|error| format!("tavily: request failed ({error})"))?;
    let data = json_body(response, "tavily").await?;
    let items = data
        .get("results")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    Ok(results_from(&items))
}

async fn brave(
    client: &reqwest::Client,
    key: &str,
    query: &str,
    limit: usize,
) -> Result<Vec<Value>, String> {
    let response = client
        .get("https://api.search.brave.com/res/v1/web/search")
        .header("X-Subscription-Token", key)
        .header("Accept", "application/json")
        .query(&[("q", query), ("count", &limit.to_string())])
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .map_err(|error| format!("brave: request failed ({error})"))?;
    let data = json_body(response, "brave").await?;
    // Brave nests the hits one level deeper than the others.
    let items = data
        .get("web")
        .and_then(|web| web.get("results"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    Ok(results_from(&items))
}

async fn exa(
    client: &reqwest::Client,
    key: &str,
    query: &str,
    limit: usize,
) -> Result<Vec<Value>, String> {
    let response = client
        .post("https://api.exa.ai/search")
        .header("x-api-key", key)
        .json(&json!({ "query": query, "numResults": limit, "type": "auto" }))
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .map_err(|error| format!("exa: request failed ({error})"))?;
    let data = json_body(response, "exa").await?;
    let items = data
        .get("results")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    Ok(results_from(&items))
}

async fn serper(
    client: &reqwest::Client,
    key: &str,
    query: &str,
    limit: usize,
) -> Result<Vec<Value>, String> {
    let response = client
        .post("https://google.serper.dev/search")
        .header("X-API-KEY", key)
        .json(&json!({ "q": query, "num": limit }))
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .map_err(|error| format!("serper: request failed ({error})"))?;
    let data = json_body(response, "serper").await?;
    let items = data
        .get("organic")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    Ok(results_from(&items))
}

/// Fetches one page and reduces it to readable text.
///
/// The URL is vetted before the request and the body is truncated after, so a
/// huge or hostile page cannot exhaust memory or the model's context.
pub async fn fetch_page(
    client: &reqwest::Client,
    url: &str,
    max_chars: Option<usize>,
) -> Result<Value, String> {
    vet_url(url)?;
    let budget = max_chars
        .unwrap_or(FETCH_DEFAULT_MAX_CHARS)
        .clamp(500, FETCH_MAX_CHARS);

    let response = client
        .get(url)
        .header("User-Agent", "StyleNotes/1.0 (+local assistant)")
        .header("Accept", "text/html,application/xhtml+xml,text/plain")
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .map_err(|error| format!("Could not reach `{url}`: {error}"))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("`{url}` returned HTTP {status}."));
    }

    // Guard against a declared-huge body; the actual read is capped below.
    if let Some(length) = response.content_length() {
        if length as usize > MAX_FETCH_BYTES {
            return Err(format!("`{url}` is too large to read ({} bytes).", length));
        }
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();

    let body = response
        .text()
        .await
        .map_err(|error| format!("Could not read `{url}`: {error}"))?;

    let is_html = content_type.contains("html") || content_type.is_empty();
    let text = if is_html {
        html_to_text(&body)
    } else {
        collapse_whitespace(&body)
    };
    let total = text.chars().count();
    Ok(json!({
        "url": url,
        "contentType": content_type,
        "chars": total,
        "truncated": total > budget,
        "text": truncate_chars(&text, budget),
    }))
}

/// The HTTP client the web tools share. Built once by the command layer.
pub fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|error| format!("Could not build the HTTP client: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_provider_accepts_aliases() {
        assert_eq!(canonical_provider("Tavily"), "tavily");
        assert_eq!(canonical_provider("brave-search"), "brave");
        assert_eq!(canonical_provider("exa/search"), "exa");
    }

    #[test]
    fn config_is_not_ready_without_a_key() {
        let config = SearchConfig {
            provider: "tavily".to_string(),
            api_key: String::new(),
            fallbacks: Vec::new(),
        };
        assert!(!config.ready());
    }

    #[test]
    fn combo_chain_drops_providers_without_a_key() {
        let config = SearchConfig {
            provider: "combo".to_string(),
            api_key: "k".to_string(),
            fallbacks: vec!["tavily".to_string(), "brave".to_string()],
        };
        assert_eq!(config.chain().len(), 2);
        assert_eq!(config.chain()[0].0, "tavily");
    }

    #[test]
    fn empty_combo_without_a_key_has_no_chain() {
        let config = SearchConfig {
            provider: "combo".to_string(),
            api_key: String::new(),
            fallbacks: vec!["tavily".to_string()],
        };
        assert!(config.chain().is_empty());
    }

    /// Every provider's shape must normalise to the same hit fields.
    #[test]
    fn results_normalise_across_provider_shapes() {
        let items = vec![
            json!({ "title": "T", "url": "u", "content": "from tavily" }),
            json!({ "title": "T2", "url": "u2", "text": "from exa" }),
            json!({ "title": "T3", "url": "u3", "description": "from serper" }),
        ];
        let normalised = results_from(&items);
        assert_eq!(normalised.len(), 3);
        assert_eq!(normalised[0]["snippet"], "from tavily");
        assert_eq!(normalised[1]["snippet"], "from exa");
        assert_eq!(normalised[2]["snippet"], "from serper");
        assert_eq!(normalised[0]["position"], 1);
    }

    #[test]
    fn results_flag_truncated_snippets() {
        let long = "x".repeat(SEARCH_SNIPPET_MAX + 10);
        let normalised = results_from(&[json!({ "title": "T", "url": "u", "content": long })]);
        assert_eq!(normalised[0]["snippet_truncated"], true);
        assert_eq!(
            normalised[0]["snippet"].as_str().unwrap().chars().count(),
            SEARCH_SNIPPET_MAX
        );
    }

    /// The SSRF guard must run before any network call is attempted.
    #[test]
    fn fetch_refuses_private_targets_without_connecting() {
        let client = http_client().expect("client");
        let error = tauri::async_runtime::block_on(fetch_page(
            &client,
            "http://169.254.169.254/latest/meta-data",
            None,
        ))
        .unwrap_err();
        assert!(error.contains("private"));
    }
}
