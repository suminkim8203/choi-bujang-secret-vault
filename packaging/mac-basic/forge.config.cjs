const path = require('node:path');

module.exports = {
  packagerConfig: {
    asar: true,
    name: '켈비',
    executableName: 'Kelbi',
    appBundleId: 'local.kelbi.basic',
    appCategoryType: 'public.app-category.utilities',
    extraResource: [path.join(__dirname, 'staging', 'kelbi-app')],
    // Include only the wrapper entry points. Prior builds and local evidence
    // must never be recursively included in a later build.
    ignore: file => file !== '' && !/^\/(?:src(?:\/|$)|package\.json$)/.test(file),
    // Local ad-hoc sealing uses no developer account, certificate or keychain.
    // This is not Developer ID signing, notarization or publishing.
    osxSign: {
      identity: '-', identityValidation: false,
      preAutoEntitlements: false, preEmbedProvisioningProfile: false,
      optionsForFile: () => ({hardenedRuntime: false, timestamp: 'none'})
    }
  },
  makers: [{ name: '@electron-forge/maker-zip', platforms: ['darwin'] }],
  publishers: []
};
