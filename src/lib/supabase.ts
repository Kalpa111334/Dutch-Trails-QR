import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://yaacbkoasdxrwavbwsbu.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlhYWNia29hc2R4cndhdmJ3c2J1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ3MTY4MzQsImV4cCI6MjA2MDI5MjgzNH0.yE1Xdci3eqP9vsVVPzYw9ihd5cYdLi985D8p1NSU-lk';

if (!supabaseUrl) throw new Error('VITE_SUPABASE_URL is required');
if (!supabaseKey) throw new Error('VITE_SUPABASE_ANON_KEY is required');

export const supabase = createClient(supabaseUrl, supabaseKey); 