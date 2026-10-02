import baseConfig from '../../prettier.config.js'

/** @type {import("prettier").Config} */
const config = {
    ...baseConfig,
    tailwindStylesheet: './src/app.css',
}

export default config
