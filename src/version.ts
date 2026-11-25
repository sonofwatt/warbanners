declare const __BUILD__: string;
declare const __BUILD_DATE__: string;

export const APP_VERSION = '0.6.3';
export const BUILD: string = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';
/** The day the build was made as YYYY-MM-DD, injected at build time; 'dev' when not built. */
export const BUILD_DATE: string = typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : 'dev';
