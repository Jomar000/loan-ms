import { drizzle } from 'drizzle-orm/d1'

export type TD1Binding = Parameters<typeof drizzle>[0]

export const dbClient = (binding: TD1Binding) => drizzle(binding)

export default dbClient
