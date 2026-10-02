import { AppError, catalog } from '@hyperion/errors'
import { scryptAsync } from '@noble/hashes/scrypt.js'
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js'
import { constantTimeEqual } from 'better-auth/crypto'
import { nanoid } from 'nanoid'

type TPasswordResetEmailMessage = {
    subject: string
    text: string
    to: string
}

type TPasswordResetEmailSender = (
    message: TPasswordResetEmailMessage,
) => Promise<void>

const scryptOptions = {
    N: 2 ** 15,
    r: 8,
    p: 1,
    dkLen: 64,
}

/** Derives the repository's 64-byte scrypt key from normalized input. */
const generatePasswordKey = async (password: string, salt: string) => {
    return scryptAsync(
        utf8ToBytes(password.normalize('NFKC')),
        utf8ToBytes(salt),
        {
            ...scryptOptions,
            maxmem:
                (scryptOptions.N + scryptOptions.p + 1) * scryptOptions.r * 128,
        },
    )
}

export const hashPassword = async (password: string) => {
    const salt = nanoid(32)
    const key = await generatePasswordKey(password, salt)
    return `${salt}:${bytesToHex(key)}`
}

export const verifyPassword = async ({
    hash,
    password,
}: {
    hash: string
    password: string
}) => {
    const [
        salt,
        key,
    ] = hash.split(':')
    if (!salt || !key) return false

    const targetKey = await generatePasswordKey(password, salt)
    return constantTimeEqual(hexToBytes(key), targetKey)
}

export const deliverPasswordResetEmail = async (
    send: TPasswordResetEmailSender,
    message: TPasswordResetEmailMessage,
) => {
    try {
        await send(message)
    } catch (error) {
        if (error instanceof AppError) throw error

        throw new AppError(catalog.authenticationUnavailable, {
            cause: new Error('Password reset email delivery failed.', {
                cause: error,
            }),
        })
    }
}
