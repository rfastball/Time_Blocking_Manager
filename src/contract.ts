// The app's types against the Rust store's, checked by tsc. src/generated/ is written by `cargo test` from
// src-tauri/src/model.rs (ts-rs); rerun it after changing the model and commit what changes.
import type {Command as StoreCommand} from './generated/Command.ts';
import type {Snapshot as StoreSnapshot} from './generated/Snapshot.ts';
import type {AppError as StoreError} from './generated/AppError.ts';
import type {AppError,Command,Snapshot} from './types.ts';

// Every command the app sends is one the store accepts; every snapshot and error the store returns is one the app reads.
export const sent=(c:Command):StoreCommand=>c;
export const read=(s:StoreSnapshot):Snapshot=>s;
export const failed=(e:StoreError):AppError=>e;
