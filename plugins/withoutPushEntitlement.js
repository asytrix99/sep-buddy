/**
 * Removes the Push Notifications entitlement that expo-notifications adds on iOS.
 * The app only uses *local* notifications (event reminders, "new events", focus timer),
 * which don't need it — and a free Apple ID (Personal Team) can't sign apps that have it.
 */
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = function withoutPushEntitlement(config) {
  if (config.ios?.entitlements) delete config.ios.entitlements['aps-environment'];
  // Mods run last-registered-first, so this plugin must be listed FIRST in app.json's plugins
  // for its mod to run after expo-notifications has added the entitlement.
  return withEntitlementsPlist(config, (c) => {
    delete c.modResults['aps-environment'];
    return c;
  });
};
