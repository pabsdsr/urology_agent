import { PublicClientApplication } from '@azure/msal-browser';
import { msalConfig } from './authConfig.js';

export const msalInstance = new PublicClientApplication(msalConfig);
