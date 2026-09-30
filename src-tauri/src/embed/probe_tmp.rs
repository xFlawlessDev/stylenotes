#[cfg(feature = "local-embed")]
#[test]
#[ignore = "manual: probes the real app-data models dir"]
fn probe_status_against_real_dir() {
    let models_root = std::path::PathBuf::from(std::env::var("APPDATA_MODELS").expect("env"));
    let app_data = models_root.parent().expect("parent").to_path_buf();
    let downloaded = crate::embed::onnx::model_is_cached(&app_data);
    eprintln!("app_data = {}", app_data.display());
    eprintln!("model_is_cached = {downloaded}");
    assert!(downloaded, "expected model to be reported as cached");
}
