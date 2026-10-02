import { auth as authValidator } from '@loanms/validator/public'
import { createContext } from 'svelte'

export type TSessionPhase =
    | 'checking'
    | 'authenticated'
    | 'unauthenticated'
    | 'unavailable'
    | 'transitioning'

export type TSessionDestination = '/app' | '/sign-in'

export type SessionActions = {
    signOut: () => Promise<void>
    transitionSessionBoundary: (
        destination?: TSessionDestination,
    ) => Promise<void>
}

function createInitialSessionData(): TSessionData {
    return {
        avatar: '',
        email: '{{email}}',
        expiresAt: 0,
        name: '{{name}}',
        organizationName: '',
        organizationSlug: '',
        refreshAt: 0,
        userRoles: [],
        permissions: authValidator.sessionPermissionsSchema.parse({}),
    }
}

export class SessionState {
    ////////////
    // Fields //
    ////////////

    #session = $state<TSessionData>(createInitialSessionData())
    #phase = $state<TSessionPhase>('checking')
    #refreshGeneration = 0

    /////////////
    // Getters //
    /////////////

    get data() {
        return this.#session
    }

    get phase() {
        return this.#phase
    }

    /////////////
    // Methods //
    /////////////

    #parseData: (data: unknown) => TSessionData = (data) =>
        authValidator.sessionOutputSchema.def.options[0].shape.data.parse(data)

    getRoles = (): readonly string[] =>
        this.#phase === 'authenticated' && this.isValid()
            ? this.#session.userRoles
            : []

    hasRole = (role: string): boolean => this.getRoles().includes(role)

    hasAnyRole = (roles: readonly string[]): boolean => {
        const userRoles = this.getRoles()
        return roles.some((role) => userRoles.includes(role))
    }

    clear = () => {
        Object.assign(this.#session, createInitialSessionData())
    }

    setPhase = (phase: TSessionPhase) => {
        this.#phase = phase
    }

    beginTransition = () => {
        this.#refreshGeneration += 1
        this.#phase = 'transitioning'
        this.#session.userRoles = []
        this.#session.permissions = createInitialSessionData().permissions
    }

    getRefreshGeneration = () => this.#refreshGeneration

    isRefreshGenerationCurrent = (generation: number) =>
        generation === this.#refreshGeneration

    isValid = (): boolean => {
        return this.#session.expiresAt > this.#getCurrentEpochSeconds()
    }

    apply = (newState: unknown) => {
        try {
            const parsedState = this.#parseData(newState)
            if (!this.#isSessionDataValid(parsedState)) {
                return false
            }

            Object.assign(this.#session, parsedState)
            this.#phase = 'authenticated'

            return true
        } catch {
            return false
        }
    }

    getMillisecondsUntilExpiry = () =>
        Math.max(
            (this.#session.expiresAt - this.#getCurrentEpochSeconds()) * 1000,
            0,
        )

    #getCurrentEpochSeconds = () => Math.floor(Date.now() / 1000)

    #isSessionDataValid = (session: TSessionData) =>
        session.expiresAt > this.#getCurrentEpochSeconds()
}

export const [
    useSessionContext,
    setSessionContext,
] = createContext<SessionState>()

export const [
    useSessionActionsContext,
    setSessionActionsContext,
] = createContext<SessionActions>()
