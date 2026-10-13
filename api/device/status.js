import config from '../../aleph.config.json' with {type:'json'};
import{createDeviceHandler}from'../../src/device-status.mjs';
export default createDeviceHandler({config});
