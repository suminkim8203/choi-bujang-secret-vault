import config from '../aleph.config.json' with {type:'json'};
import {createRecoveryHandler} from '../src/recovery-api.mjs';
export default createRecoveryHandler({config});
