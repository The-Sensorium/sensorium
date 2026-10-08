// Dynamic Expo config. app.json stays the base; this only resolves values
// that differ per environment. GOOGLE_SERVICES_JSON arrives on EAS as a
// secret file variable (a path on the runner) and falls back to the local
// gitignored copy on dev machines.
export default ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },
})
