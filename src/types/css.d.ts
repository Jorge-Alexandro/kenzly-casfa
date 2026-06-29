// Ambient declaration so TypeScript accepts side-effect CSS imports
// (e.g. `import 'mapbox-gl/dist/mapbox-gl.css'`). Next.js bundles these at
// build time; tsc just needs to know the module shape.
declare module '*.css'
