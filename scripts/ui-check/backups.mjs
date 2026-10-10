import assert from 'node:assert/strict';

// Backups need the native store; the browser preview only says where they are managed.
export default [
  {name:'the preview shows where backups are managed and offers no actions',run:async page=>{
    await page.click('.rail-nav .nav-button','설정');await page.sleep(300);
    assert.equal(await page.js('document.querySelector("details.backups").open'),false);
    await page.click('details.backups > summary');await page.sleep(150);
    assert.match(await page.text('details.backups'),/데스크톱 앱에서 백업을 관리합니다\./);
    assert.equal(await page.js('document.querySelectorAll("details.backups button").length'),0);
    await page.shot('backups-preview');
  }},
];
