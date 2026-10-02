type TEnvironment = 'development' | 'production' | 'staging' | 'test'

export const getCsrfCookieName = (environment: TEnvironment) =>
    environment === 'production'
        ? '__Host-csrf_token'
        : `__Host-${environment}_csrf_token`

export const getSessionCookieName = (environment: TEnvironment) =>
    environment === 'production'
        ? '__Host-session_token'
        : `__Host-${environment}_session_token`
