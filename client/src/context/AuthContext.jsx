import  { useState, useEffect, useMemo } from 'react';
import { PublicClientApplication } from '@azure/msal-browser';
import { msalConfig } from '../authConfig.js';
import { MsalProvider } from '@azure/msal-react';


export const AuthProvider = ({ children }) => {
    const [initialized, setInitialized] = useState(false);
    const msalInstance = useMemo(() => new PublicClientApplication(msalConfig), []);

    useEffect(() => {
        msalInstance.initialize().then(() => {
            return msalInstance.handleRedirectPromise();
        })
        .then((response) => {
            if (response?.account) {
                msalInstance.setActiveAccount(response.account);
            } else {
                const accounts = msalInstance.getAllAccounts();
                if (accounts.length === 1) {
                    msalInstance.setActiveAccount(accounts[0]);
                }
            }
        })
        .catch((err) => {
            console.error(err);
        })
        .finally(() => {
            setInitialized(true);
        });
    }, [msalInstance]);

    if (!initialized) {
        return null; 
    }

    return <MsalProvider instance={msalInstance}>{children}</MsalProvider>;
};