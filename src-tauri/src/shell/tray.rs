//! The tray icon and its open/quit menu.
use super::{quit, windows::{show, MAIN}};
use tauri::{image::Image, menu::{Menu, MenuItem}, tray::TrayIconBuilder};

pub fn build(app: &tauri::App) -> tauri::Result<()> {
    let menu=Menu::with_items(app,&[
        &MenuItem::with_id(app,"open","BLOKKY 열기",true,None::<&str>)?,
        &MenuItem::with_id(app,"quit","종료",true,None::<&str>)?,
    ])?;
    TrayIconBuilder::new().icon(icon()).tooltip("BLOKKY")
        .menu(&menu).on_menu_event(|app,event| match event.id.as_ref(){"open"=>show(app,MAIN),"quit"=>quit::request(app),_=>{}}).build(app)?;
    Ok(())
}
/// A 32×32 white block mark on the brand blue, drawn in code so the tray needs no bundled image.
fn icon() -> Image<'static> {
    let pixels:Vec<u8>=(0..32*32).flat_map(|i| {
        let x=i%32;let y=i/32;
        if ((7..13).contains(&x)&&(7..25).contains(&y))||((16..25).contains(&x)&&(7..14).contains(&y))||((16..22).contains(&x)&&(17..25).contains(&y)) {[255,255,255,255]}else{[43,85,214,255]}
    }).collect();
    Image::new_owned(pixels,32,32)
}
