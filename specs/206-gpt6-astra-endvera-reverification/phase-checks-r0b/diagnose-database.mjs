import './network-guard.cjs';
import {withDatabase} from './database.mjs';
import {safeOutput} from './output-safe.mjs';
try {
 await withDatabase(async()=>console.log('DIAGNOSTIC_OWNED_DATABASE_SERVER_STARTED'));
 console.log('DIAGNOSTIC_OWNED_DATABASE_SERVER_CLOSED');
} catch(error) {
 console.error(safeOutput(error.stack?.split('\n').slice(0,14).join('\n')??error.message));
 process.exitCode=1;
}
