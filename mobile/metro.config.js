const { getSentryExpoConfig } = require('@sentry/react-native/metro')

const config = getSentryExpoConfig(__dirname)

config.resolver.blockList = [/[\\/]\.\.[\\/]node_modules[\\/].*/]

module.exports = config
