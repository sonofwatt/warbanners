declare const __BUILD__: string;

export const APP_VERSION = '0.2.0';
export const BUILD: string = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';
