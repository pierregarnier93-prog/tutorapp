import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://ihtcmemyrwejeetybepg.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlodGNtZW15cndlamVldHliZXBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTQ0NjAsImV4cCI6MjA5NDY5MDQ2MH0.xyGnBYE2ex1vn5jbwrbfTbvcUtNC9SmzBIUiRQoIPEo"
);

const css = `
  .auth-overlay { position:fixed; inset:0; background:rgba(26,26,46,0.7); backdrop-filter:blur(8px); z-index:1000; display:flex; align-items:center; justify-content:center; padding:1rem; }
  .auth-box { background:#fff; border-radius:24px; padding:2.5rem; width:100%; max-wid