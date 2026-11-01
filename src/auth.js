import { supabase } from "./supabaseClient.js";

// Supabase Auth's built-in identities are email-shaped, but the app only
// ever shows/asks for a username. We fake an email behind the scenes
// (deterministic from the normalized username) so Supabase's real
// password handling can be used without the user ever seeing "email".
const EMAIL_DOMAIN = "bookscanner.local";

export function normalizeUsername(raw) {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function usernameToEmail(displayUsername) {
  return `${normalizeUsername(displayUsername)}@${EMAIL_DOMAIN}`;
}

export async function signUp(displayUsername, password) {
  const normalized = normalizeUsername(displayUsername);
  if (!normalized) {
    throw new Error("Username must contain at least one letter or number.");
  }

  const { data: existing, error: checkError } = await supabase
    .from("profiles")
    .select("id")
    .eq("username_normalized", normalized)
    .limit(1);
  if (checkError) throw checkError;
  if (existing.length > 0) {
    throw new Error("That username is already taken.");
  }

  const { data, error } = await supabase.auth.signUp({
    email: usernameToEmail(displayUsername),
    password,
  });
  if (error) throw error;

  const { error: profileError } = await supabase.from("profiles").insert({
    id: data.user.id,
    username: displayUsername.trim(),
    username_normalized: normalized,
  });
  if (profileError) throw profileError;

  return data;
}

export async function signIn(displayUsername, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(displayUsername),
    password,
  });
  if (error) throw new Error("Invalid username or password.");
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data;
}
