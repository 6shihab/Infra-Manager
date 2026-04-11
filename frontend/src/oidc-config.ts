import type { WebStorageStateStore } from 'oidc-client-ts';

const KEYCLOAK_URL = (window as any).__ENV__?.VITE_KEYCLOAK_URL
    || import.meta.env.VITE_KEYCLOAK_URL
    || 'http://localhost:9080';

const KEYCLOAK_REALM = (window as any).__ENV__?.VITE_KEYCLOAK_REALM
    || import.meta.env.VITE_KEYCLOAK_REALM
    || 'infra-manager';

const KEYCLOAK_CLIENT_ID = (window as any).__ENV__?.VITE_KEYCLOAK_CLIENT_ID
    || import.meta.env.VITE_KEYCLOAK_CLIENT_ID
    || 'infra-manager-frontend';

// HashRouter uses /#/ prefix — OIDC redirect URIs must match
const origin = window.location.origin;

export const oidcConfig = {
    authority: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`,
    client_id: KEYCLOAK_CLIENT_ID,
    redirect_uri: origin,
    post_logout_redirect_uri: origin,
    response_type: 'code',
    scope: 'openid profile email',
    automaticSilentRenew: true,
    // Use localStorage so tokens survive page reload
    userStore: undefined as unknown as WebStorageStateStore, // set at runtime in App.tsx
};
