#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_clipboard_manager::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .invoke_handler(tauri::generate_handler![consolidate_windows])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[tauri::command]
fn consolidate_windows(app: tauri::AppHandle) -> Result<(), String> {
  #[cfg(target_os = "macos")]
  {
    consolidate_windows_macos(app)
  }

  #[cfg(not(target_os = "macos"))]
  {
    let _ = app;
    Ok(())
  }
}

#[cfg(target_os = "macos")]
fn consolidate_windows_macos(app: tauri::AppHandle) -> Result<(), String> {
  use objc2_app_kit::NSWindowOrderingMode;
  use tauri::Manager;

  let labels: Vec<String> = app.webview_windows().keys().cloned().collect();
  if labels.len() < 2 {
    log::info!("Consolidate Windows: only {} window(s), nothing to merge", labels.len());
    return Ok(());
  }

  let window_count = labels.len();
  let app_clone = app.clone();
  app.clone().run_on_main_thread(move || {
    let target_win = match app_clone.get_webview_window(&labels[0]) {
      Some(w) => w,
      None => return,
    };
    target_win
      .with_webview(move |target_webview| {
        let target_ptr: usize = unsafe {
          &*target_webview.ns_window().cast() as *const objc2_app_kit::NSWindow as usize
        };
        for other_label in &labels[1..] {
          if let Some(other_win) = app_clone.get_webview_window(other_label) {
            let _ = other_win.with_webview(move |other_webview| {
              let other_ns: &objc2_app_kit::NSWindow =
                unsafe { &*other_webview.ns_window().cast() };
              let target_ns: &objc2_app_kit::NSWindow =
                unsafe { &*(target_ptr as *const objc2_app_kit::NSWindow) };
              target_ns.addTabbedWindow_ordered(other_ns, NSWindowOrderingMode::Above);
            });
          }
        }
      })
      .ok();
    log::info!("Consolidate Windows: merged {} windows into tab group", window_count);
  })
  .map_err(|e| e.to_string())?;

  Ok(())
}
