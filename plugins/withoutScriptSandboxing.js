/**
 * Turns off Xcode's "User Script Sandboxing". With it on, React Native's
 * "Bundle React Native code and images" build phase can't write into the app
 * (Sandbox: bash deny file-write-create …/rydmap.app/ip.txt) and the build fails.
 */
const { withXcodeProject } = require('expo/config-plugins');

module.exports = function withoutScriptSandboxing(config) {
  return withXcodeProject(config, (c) => {
    const configs = c.modResults.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(configs)) {
      const s = configs[key]?.buildSettings;
      if (s) s.ENABLE_USER_SCRIPT_SANDBOXING = 'NO';
    }
    return c;
  });
};
