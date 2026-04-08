import { LogLevel } from '@azure/msal-browser';

const appOrigin =
  import.meta.env.VITE_APP_ORIGIN ||
  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173');

 /**
 * Configuration object to be passed to MSAL instance on creation.
 * For a full list of MSAL.js configuration parameters, visit:
 * https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-browser/docs/configuration.md
 */

 export const msalConfig = {
     auth: {
         clientId: '233d8702-eed9-4800-950c-536560761c35',
         authority: 'https://login.microsoftonline.com/25585d49-c213-4ff6-b7d5-e9cc3e83a10c',
         redirectUri: import.meta.env.VITE_MSAL_REDIRECT_URI || `${appOrigin}/`,
         postLogoutRedirectUri:
           import.meta.env.VITE_MSAL_POST_LOGOUT_URI || `${appOrigin}/login`,
         navigateToLoginRequestUrl: false,
     },
     cache: {
         cacheLocation: 'sessionStorage',
         storeAuthStateInCookie: false,
     },
     system: {
         loggerOptions: {
             loggerCallback: (level, message, containsPii) => {
                 if (containsPii) {
                     return;
                 }
                 switch (level) {
                     case LogLevel.Error:
                         console.error(message);
                         return;
                     case LogLevel.Info:
                         console.info(message);
                         return;
                     case LogLevel.Verbose:
                         console.debug(message);
                         return;
                     case LogLevel.Warning:
                         console.warn(message);
                         return;
                     default:
                         return;
                 }
             },
         },
     },
 };

 export const loginRequest = {
  scopes: ['openid', 'profile', 'email'],
};

/**
 * App role value from Microsoft Entra (App roles) on the ID token `roles` claim.
 * Override with VITE_ADMIN_APP_ROLE to match ENTRA_ADMIN_APP_ROLE on the API.
 */
export const adminAppRole = import.meta.env.VITE_ADMIN_APP_ROLE || 'admin';
