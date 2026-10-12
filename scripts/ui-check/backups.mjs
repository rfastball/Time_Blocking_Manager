import assert from 'node:assert/strict';
import {toSettings} from './support/nav.mjs';

// Backups need the native store; the browser preview only says where they are managed.
export default [
  {name:'the preview shows where backups are managed and offers no actions',run:async page=>{
    await toSettings(page);
    assert.equal(await page.js('document.querySelector("details.backups").open'),false);
    await page.click('details.backups > summary');await page.sleep(150);
    assert.match(await page.text('details.backups'),/데스크톱 앱에서 백업을 관리합니다\./);
    assert.equal(await page.js('document.querySelectorAll("details.backups button").length'),0);
    await page.shot('backups-preview');
  }},
  {name:'backup inspection can be canceled while waiting or after an error',run:async page=>{
    await toSettings(page);
    try{
      await page.js(`(async()=>{
        const [{setState},{setOpen}]=await Promise.all([import('/src/app/store/state.ts'),import('/src/app/backups/backups.ts')]);
        window.backupCheckPreviousIPC=window.__TAURI_INTERNALS__;
        const info={created_at:'2026-10-12T01:00:00Z',tasks:2,scheduled:1,completed:0};
        const mock=window.backupCheckMock={info,mode:'waiting',pending:[]};
        window.__TAURI_INTERNALS__={invoke:async cmd=>{
          if(cmd==='list_backups')return [{id:'review-backup',kind:'manual',...info,error:null}];
          if(cmd==='inspect_backup'){
            if(mock.mode==='error')throw Error('백업 검사 실패');
            if(mock.mode==='success')return info;
            return new Promise(resolve=>mock.pending.push(resolve));
          }
          throw Error('Unexpected backup mock IPC '+cmd);
        }};
        setOpen(false,true);setState({native:true});
      })()`);
      await page.sleep(150);
      await page.js(`document.querySelector('details.backups').scrollIntoView({block:'center'})`);
      await page.click('.backups-list button');
      assert.equal(await page.js(`document.querySelector('.restore-review').getAttribute('aria-busy')`),'true');
      assert.equal(await page.js(`!!document.querySelector('[data-key=restore]')`),false,'uninspected backup cannot be restored');
      await page.shot('backups-inspecting-cancel');
      await page.js(`document.querySelector('[data-key=cancel]').focus()`);await page.key('Enter',{text:'\r'});
      await page.sleep(100);
      assert.equal(await page.js(`!!document.querySelector('.restore-review')`),false,'keyboard cancel closes the pending review');
      assert.equal(await page.js(`document.activeElement===document.querySelector('details.backups > summary')`),true,'cancel returns keyboard focus');
      await page.js(`window.backupCheckMock.pending.shift()(window.backupCheckMock.info)`);
      assert.deepEqual(await page.js(`(async()=>{const {getBackups}=await import('/src/app/backups/backups.ts');const b=getBackups();return {selected:b.selected,inspection:b.inspection,inspecting:b.inspecting};})()`),{selected:null,inspection:null,inspecting:false},'late inspection result cannot reopen or repopulate the canceled review');
      await page.js(`window.backupCheckMock.mode='error'`);
      await page.click('.backups-list button');
      assert.match(await page.text('.restore-review [role=alert]'),/백업 검사 실패/);
      assert.equal(await page.js(`!!document.querySelector('[data-key=restore]')`),false,'failed inspection cannot restore');
      await page.shot('backups-error-cancel');
      await page.click('[data-key=cancel]');
      assert.equal(await page.js(`!!document.querySelector('.restore-review')`),false,'failed review can also be canceled');
      await page.js(`window.backupCheckMock.mode='success'`);
      await page.click('.backups-list button');
      assert.equal(await page.js(`!!document.querySelector('[data-key=restore]')`),true,'successful inspection still offers restore');
      await page.click('[data-key=cancel]');
    }finally{
      await page.js(`(async()=>{const [{setState},{cancelReview,setOpen}]=await Promise.all([import('/src/app/store/state.ts'),import('/src/app/backups/backups.ts')]);cancelReview();setOpen(false,false);setState({native:false});if(window.backupCheckPreviousIPC)window.__TAURI_INTERNALS__=window.backupCheckPreviousIPC;else delete window.__TAURI_INTERNALS__;delete window.backupCheckMock;delete window.backupCheckPreviousIPC;})()`);
    }
  }},
];
