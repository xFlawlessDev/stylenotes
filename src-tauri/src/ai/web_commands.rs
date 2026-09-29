//! Tauri commands backing the assistant's web tools.
//!
//! The frontend owns persistence, so it resolves the search settings — provider
//! and the decrypted key — and passes them in. Rust owns the network, for the
//! same reason the model provider lives here: one place that talks to the
//! outside world, with the SSRF guard in front of it.

use serde::Deserialize;

use crate::ai::web::{self, SearchConfig};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchRequest {
    pub query: String,
    #[serde(default)]
    pub limit: Option<usize>,
    pub config: SearchConfig,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchRequest {
    pub url: String,
    #[serde(default)]
    pub max_chars: Option<usize>,
}

/// Search providers the app supports, so `Settings → AI` can list them.
///
/// Exposed as a command rather than duplicated in TypeScript: the Rust match in
/// `ai/web.rs` is the authority on which names actually work.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchProviderInfo {
    pub id: &'static str,
    pub label: &'static str,
    /// Where the user gets a key.
    pub hint: &'static str,
}

#[tauri::command]
pub fn ai_search_providers() -> Vec<SearchProviderInfo> {
    web::SEARCH_PROVIDERS
        .iter()
        .map(|id| match *id {
            "tavily" => SearchProviderInfo {
                id,
                label: "Tavily",
                hint: "Keys at tavily.com. Built for LLM apps and returns clean snippets.",
            },
            "brave" => SearchProviderInfo {
                id,
                label: "Brave Search",
                hint: "Keys at api-dashboard.search.brave.com. Independent index.",
            },
            "exa" => SearchProviderInfo {
                id,
                label: "Exa",
                hint: "Keys at exa.ai. Semantic search, best for research questions.",
            },
            _ => SearchProviderInfo {
                id,
                label: "Serper",
                hint: "Keys at serper.dev. Google results.",
            },
        })
        .collect()
}

/// Runs a web search through the configured provider.
///
/// A missing key is an error rather than an empty result: the model needs to
/// know search is unavailable so it stops and says so instead of inventing
/// sources.
#[tauri::command]
pub async fn ai_web_search(request: SearchRequest) -> Result<serde_json::Value, String> {
    if !request.config.ready() {
        return Err(
            "Web search is not configured. Add a search provider and API key in Settings → AI."
                .to_string(),
        );
    }
    let client = web::http_client()?;
    let limit = request.limit.unwrap_or(5);
    let results = web::search(&client, &request.config, &request.query, limit).await?;
    Ok(serde_json::json!({
        "query": request.query.trim(),
        "results": results,
        "count": results.len(),
    }))
}

/// Fetches one page and returns readable text, behind the SSRF guard.
#[tauri::command]
pub async fn ai_web_fetch(request: FetchRequest) -> Result<serde_json::Value, String> {
    let client = web::http_client()?;
    web::fetch_page(&client, &request.url, request.max_chars).await
}
