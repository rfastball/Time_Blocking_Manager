// Foundation placeholder for area B (설정). Writes go through store/schedule.ts.
import {BackupManager} from '../backups/BackupManager.tsx';

export function Settings(){
  return <div className="card" style={{maxWidth:860}}><h2>설정</h2><BackupManager/></div>;
}
