import React, { useState, useEffect, useMemo } from 'react';
// import { authService } from '../services/authService.js';
import { PublicClientApplication, EventType } from '@azure/msal-browser';
import { msalConfig } from '../authConfig.js';
import { MsalProvider } from '@azure/msal-react';

export const AuthProvider = ({ children }) => {
    const msalInstance = useMemo(() => new PublicClientApplication(msalConfig), []);

    const handleResponse = (resp) => {
        if (resp !== null) {
            msalInstance.setActiveAccount(resp.account);
        } else {
            const currentAccounts = msalInstance.getAllAccounts();
            if (!currentAccounts || currentAccounts.length < 1) {
                return;
            } else if (currentAccounts.length > 1) {
                // Add choose account code here
            } else if (currentAccounts.length === 1) {
                const activeAccount = currentAccounts[0];
                msalInstance.setActiveAccount(activeAccount);
            }
        }
    };

    useEffect(() => {
        msalInstance.initialize().then(() => {
            msalInstance.handleRedirectPromise().then(handleResponse).catch(err => {
                console.error(err);
            });
        });
    }, [msalInstance]);

    return <MsalProvider instance={msalInstance}>{children}</MsalProvider>;
};

// export const AuthProvider = ({ children }) => {
//   const [initialized, setInitialized] = useState(false);
//   const msalInstance = useMemo(() => new PublicClientApplication(msalConfig), []);

//   useEffect(() => {
//     let isMounted = true;

//     const initMsal = async () => {
//       try {
//         await msalInstance.initialize();
//         console.log("config", msalInstance.getConfiguration());
//         const result = await msalInstance.handleRedirectPromise();

//         console.log('msal result:', result);

//         if (result?.account) {
//           msalInstance.setActiveAccount(result.account);
//         }

//         const accounts = msalInstance.getAllAccounts();
//         if (!msalInstance.getActiveAccount() && accounts.length > 0) {
//           msalInstance.setActiveAccount(accounts[0]);
//         }
//       } catch (error) {
//         console.error(error);
//       } finally {
//         if (isMounted) {
//           setInitialized(true);
//         }
//       }
//     };

//     initMsal();

//     return () => {
//       isMounted = false;
//     };
//   }, [msalInstance]);

//   // useEffect(() => {
//   //   const callbackId = msalInstance.addEventCallback((event) => {
//   //     const authenticationResult = event?.payload;
//   //     if (event.eventType === EventType.LOGIN_SUCCESS && authenticationResult?.account) {
//   //       msalInstance.setActiveAccount(authenticationResult.account);
//   //     }
//   //   });

//   //   return () => {
//   //     if (callbackId) {
//   //       msalInstance.removeEventCallback(callbackId);
//   //     }
//   //   };
//   // }, [msalInstance]);

//   if (!initialized) {
//     return null;
//   }

//   return <MsalProvider instance={msalInstance}>{children}</MsalProvider>;
// };
