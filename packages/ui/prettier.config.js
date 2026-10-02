import baseConfig from '../../prettier.config.js'

/** @type {import("prettier").Config} */
const config = {
    ...baseConfig,
    tailwindStylesheet: './src/styles/globals.css',
}

export default config
