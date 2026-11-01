// Fill these in with your Supabase project's values (Project Settings -> API).
// The anon key is safe to expose in client code; access is controlled by
// Row Level Security policies on the "books" table (see README.md).
export const SUPABASE_URL = "https://txwjurgpaaweimwovyar.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4d2p1cmdwYWF3ZWltd292eWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0ODY5MjEsImV4cCI6MjEwOTA2MjkyMX0.7rds65n0otr9HmOIKi05-A1BdVTNO0--USXjrJZ6lK8";

// A lightweight shared access code, checked client-side before the app
// loads. This only deters casual/accidental use of a shared link — it is
// NOT real security (the code ships inside the public JS bundle, same as
// the Supabase anon key above). Change this to whatever code you want to
// share with people you intend to give access to.
export const ACCESS_CODE = "CHANGE-ME";
