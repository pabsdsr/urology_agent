import { LogLevel } from '@azure/msal-browser';

 /**
 * Configuration object to be passed to MSAL instance on creation. 
 * For a full list of MSAL.js configuration parameters, visit:
 * https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-browser/docs/configuration.md 
 */

 export const msalConfig = {
     auth: {
         clientId: '233d8702-eed9-4800-950c-536560761c35', // This is the ONLY mandatory field that you need to supply.
         authority: 'https://login.microsoftonline.com/25585d49-c213-4ff6-b7d5-e9cc3e83a10c',
         redirectUri: 'http://localhost:5173/', // Points to window.location.origin. You must register this URI on Microsoft Entra admin center/App Registration.
         postLogoutRedirectUri: 'http://localhost:5173/login', // Indicates the page to navigate after logout.
         navigateToLoginRequestUrl: false, // If "true", will navigate back to the original request location before processing the auth code response.
     },
     cache: {
         cacheLocation: 'sessionStorage', // Configures cache location. "sessionStorage" is more secure, but "localStorage" gives you SSO between tabs.
         storeAuthStateInCookie: false, // Set this to "true" if you are having issues on IE11 or Edge
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

 /**
 * Scopes you add here will be prompted for user consent during sign-in.
 * By default, MSAL.js will add OIDC scopes (openid, profile, email) to any login request.
 * For more information about OIDC scopes, visit: 
 * https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-permissions-and-consent#openid-connect-scopes
 */
export const loginRequest = {
  scopes: ['openid', 'profile', 'email'],
};

/**
 * App role value from Microsoft Entra (App roles) that may sign in on the ID token
 * as the `roles` claim. Must match the "Value" field of the role assigned to users/groups.
 * Override with VITE_ADMIN_APP_ROLE in .env for different naming.
 */
export const adminAppRole = "admin";

 /**
 * An optional silentRequest object can be used to achieve silent SSO
 * between applications by providing a "login_hint" property.
 */
 // export const silentRequest = {
 //     scopes: ["openid", "profile"],
 //     loginHint: "example@domain.net"
 // };