import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://ihtcmemyrwejeetybepg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlodGNtZW15cndlamVldHliZXBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTQ0NjAsImV4cCI6MjA5NDY5MDQ2MH0.xyGnBYE2ex1vn5jbwrbfTbvcUtNC9SmzBIUiRQoIPEo'
);

// ─── ANNONCES (REQUESTS) ──────────────────────────────────────

// Poster une nouvelle annonce
export async function postRequest({
  subject,
  instrLang,
  curriculum,
  level,
  cycle,
  durationMin,
  budgetMin,
  budgetMax,
  message,
  countryCode,
}) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('requests')
    .insert({
      poster_id: user.id,
      subject,
      instr_lang: instrLang,
      curriculum,
      level,
      cycle: cycle?.join(', '),
      duration_min: durationMin || 60,
      budget_min_aed: budgetMin || 50,
      budget_max_aed: budgetMax || 150,
      message,
      country_code: countryCode || 'UAE',
      status: 'open',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Récupérer toutes les annonces ouvertes
export async function getOpenRequests(countryCode) {
  let query = supabase
    .from('requests')
    .select(
      `
      *,
      poster:profiles!poster_id(full_name, country_code),
      bids(count)
    `
    )
    .eq('status', 'open')
    .order('created_at', { ascending: false });

  if (countryCode) query = query.eq('country_code', countryCode);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// Récupérer les annonces d'un élève
export async function getMyRequests() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('requests')
    .select('*, bids(count)')
    .eq('poster_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

// ─── OFFRES (BIDS) ────────────────────────────────────────────

// Soumettre une offre (enseignant)
export async function submitBid({ requestId, netPriceAed, message }) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('bids')
    .insert({
      request_id: requestId,
      teacher_id: user.id,
      net_price_aed: netPriceAed,
      message,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Récupérer les offres d'une annonce
export async function getBidsForRequest(requestId) {
  const { data, error } = await supabase
    .from('bids')
    .select(
      `
      *,
      teacher:profiles!teacher_id(full_name, country_code),
      teacher_profile:teacher_profiles!teacher_id(
        avg_rating, total_reviews, net_rate_aed, bio, subjects, instr_langs
      )
    `
    )
    .eq('request_id', requestId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

// Accepter une offre → crée une réservation
export async function acceptBid(bidId, requestId) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // 1. Récupérer l'offre
  const { data: bid } = await supabase
    .from('bids')
    .select('*')
    .eq('id', bidId)
    .single();
  if (!bid) throw new Error('Bid not found');

  // 2. Calculer les prix (prix élève = net / 0.85)
  const netPrice = bid.net_price_aed;
  const grossPrice = Math.ceil(netPrice / 0.85);

  // 3. Créer la réservation
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      request_id: requestId,
      bid_id: bidId,
      poster_id: user.id,
      teacher_id: bid.teacher_id,
      net_price_aed: netPrice,
      gross_price_aed: grossPrice,
      commission_aed: grossPrice - netPrice,
      status: 'pending_payment',
      country_code: 'UAE',
    })
    .select()
    .single();

  if (bookingError) throw bookingError;

  // 4. Marquer l'offre comme acceptée
  await supabase.from('bids').update({ status: 'accepted' }).eq('id', bidId);

  // 5. Fermer l'annonce
  await supabase
    .from('requests')
    .update({ status: 'closed' })
    .eq('id', requestId);

  return booking;
}

// ─── PROFIL ───────────────────────────────────────────────────

// Récupérer le profil de l'utilisateur connecté
export async function getMyProfile() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*, teacher_profiles(*)')
    .eq('id', user.id)
    .single();

  if (error) return null;
  return data;
}

// ─── TEMPS RÉEL ───────────────────────────────────────────────

// Écouter les nouvelles offres sur une annonce en temps réel
export function subscribeToNewBids(requestId, callback) {
  return supabase
    .channel(`bids:${requestId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'bids',
        filter: `request_id=eq.${requestId}`,
      },
      callback
    )
    .subscribe();
}

// Écouter les nouvelles annonces (pour les enseignants)
export function subscribeToNewRequests(callback) {
  return supabase
    .channel('new_requests')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'requests',
        filter: `status=eq.open`,
      },
      callback
    )
    .subscribe();
}
