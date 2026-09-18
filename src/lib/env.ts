const publicEnvironmentKeys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
] as const;

type PublicEnvironmentKey = (typeof publicEnvironmentKeys)[number];

export type PublicEnvironment = Record<PublicEnvironmentKey, string>;

export function getPublicEnvironment(): PublicEnvironment {
  const values: Partial<PublicEnvironment> = {
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.SUPABASE_PUBLISHABLE_KEY,
  };

  const missingKeys = publicEnvironmentKeys.filter((key) => !values[key]);

  if (missingKeys.length > 0) {
    throw new Error(`Missing required environment variables: ${missingKeys.join(", ")}`);
  }

  return values as PublicEnvironment;
}
