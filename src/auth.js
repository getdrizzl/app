import { supabase } from './supabaseClient.js'

let isSignUpMode = false
let activeStoreSelection = 'aldi'

export function initAuth() {
  const profileBtn = document.getElementById('profileBtn')
  const authModal = document.getElementById('authModal')
  const closeAuthModal = document.getElementById('closeAuthModal')
  const authForm = document.getElementById('authForm')
  const toggleAuthMode = document.getElementById('toggleAuthMode')
  const signOutBtn = document.getElementById('signOutBtn')
  const saveAccountSettingsBtn = document.getElementById('saveAccountSettingsBtn')

  // Open Auth / Profile Modal
  profileBtn?.addEventListener('click', () => {
    authModal?.classList.remove('hidden')
  })

  // Close Modal
  closeAuthModal?.addEventListener('click', () => {
    authModal?.classList.add('hidden')
  })

  // Toggle between Sign In and Sign Up modes
  toggleAuthMode?.addEventListener('click', (e) => {
    e.preventDefault()
    isSignUpMode = !isSignUpMode
    updateAuthModalMode()
  })

  // Submit Sign In / Sign Up Form
  authForm?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const email = document.getElementById('authEmail').value
    const password = document.getElementById('authPassword').value
    const authError = document.getElementById('authError')

    authError.classList.add('hidden')
    authError.textContent = ''

    try {
      if (isSignUpMode) {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error

        // If user returned immediately (e.g. email confirm disabled), initialize profile row
        if (data?.user) {
          await supabase.from('profiles').upsert({
            id: data.user.id,
            email: data.user.email,
            favorite_store: 'aldi',
            updated_at: new Date().toISOString()
          })
        }

        alert('Check your email for the confirmation link!')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
      authModal?.classList.add('hidden')
      authForm.reset()
    } catch (err) {
      authError.textContent = err.message
      authError.classList.remove('hidden')
    }
  })

  // Store Selection Tile Click Handler
  const storeCards = document.querySelectorAll('.store-card')
  storeCards.forEach((card) => {
    card.addEventListener('click', () => {
      storeCards.forEach((c) => c.classList.remove('active'))
      card.classList.add('active')
      activeStoreSelection = card.getAttribute('data-store') || 'aldi'
    })
  })

  // Save Settings Click Handler
  saveAccountSettingsBtn?.addEventListener('click', saveUserSettings)

  // Handle Sign Out
  signOutBtn?.addEventListener('click', async () => {
    await supabase.auth.signOut()
    authModal?.classList.add('hidden')
  })

  // Listen to Auth State Changes
  supabase.auth.onAuthStateChange((event, session) => {
    handleAuthStateChange(session?.user || null)
  })
}

async function handleAuthStateChange(user) {
  const navLinks = document.getElementById('navLinks')
  const authForms = document.getElementById('authForms')
  const userProfileView = document.getElementById('userProfileView')
  const userEmailDisplay = document.getElementById('userEmailDisplay')

  if (user) {
    // Show Nav Links when logged in
    navLinks?.classList.remove('hidden')
    authForms?.classList.add('hidden')
    userProfileView?.classList.remove('hidden')
    if (userEmailDisplay) userEmailDisplay.textContent = user.email

    // Load account settings from Supabase
    await loadUserSettings(user.id)
  } else {
    // Hide Nav Links when logged out
    navLinks?.classList.add('hidden')
    authForms?.classList.remove('hidden')
    userProfileView?.classList.add('hidden')
  }
}

/**
 * Fetch existing goals and favorite store from Supabase
 */
async function loadUserSettings(userId) {
  if (!userId) return

  try {
    // Fetch Profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('favorite_store')
      .eq('id', userId)
      .maybeSingle()

    if (profile?.favorite_store) {
      activeStoreSelection = profile.favorite_store
      updateStoreGridUI(activeStoreSelection)
    }

    // Fetch Nutrition Goals
    const { data: goals } = await supabase
      .from('user_nutrition_goals')
      .select('target_calories, target_protein_g, target_carbs_g, target_fats_g')
      .eq('user_id', userId)
      .maybeSingle()

    if (goals) {
      const goalCalories = document.getElementById('goalCalories')
      const goalProtein = document.getElementById('goalProtein')
      const goalCarbs = document.getElementById('goalCarbs')
      const goalFat = document.getElementById('goalFat')

      if (goalCalories) goalCalories.value = goals.target_calories ?? ''
      if (goalProtein) goalProtein.value = goals.target_protein_g ?? ''
      if (goalCarbs) goalCarbs.value = goals.target_carbs_g ?? ''
      if (goalFat) goalFat.value = goals.target_fats_g ?? ''
    }
  } catch (err) {
    console.error('Error loading account settings:', err)
  }
}

/**
 * Persist Nutrition Goals & Preferred Store to Supabase
 */
async function saveUserSettings() {
  const saveBtn = document.getElementById('saveAccountSettingsBtn')
  if (!saveBtn) return

  const originalText = saveBtn.textContent

  try {
    saveBtn.disabled = true
    saveBtn.textContent = 'Saving...'

    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) throw new Error('No authenticated user found.')

    const calories = parseInt(document.getElementById('goalCalories')?.value, 10)
    const protein = parseInt(document.getElementById('goalProtein')?.value, 10)
    const carbs = parseInt(document.getElementById('goalCarbs')?.value, 10)
    const fats = parseInt(document.getElementById('goalFat')?.value, 10)

    const now = new Date().toISOString()

    const [goalsResult, profileResult] = await Promise.all([
      // Upsert into user_nutrition_goals
      supabase.from('user_nutrition_goals').upsert({
        user_id: user.id,
        target_calories: isNaN(calories) ? null : calories,
        target_protein_g: isNaN(protein) ? null : protein,
        target_carbs_g: isNaN(carbs) ? null : carbs,
        target_fats_g: isNaN(fats) ? null : fats,
        updated_at: now
      }, { onConflict: 'user_id' }),

      // Upsert into profiles (handles existing row or initializes missing row)
      supabase.from('profiles').upsert({
        id: user.id,
        email: user.email,
        favorite_store: activeStoreSelection,
        updated_at: now
      }, { onConflict: 'id' })
    ])

    if (goalsResult.error) throw goalsResult.error
    if (profileResult.error) throw profileResult.error

    saveBtn.textContent = 'Saved!'
    setTimeout(() => {
      saveBtn.disabled = false
      saveBtn.textContent = originalText
    }, 2000)

  } catch (err) {
    console.error('Failed to save user settings:', err)
    saveBtn.textContent = 'Error Saving'
    setTimeout(() => {
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
    }, 2000)
  }
}

function updateStoreGridUI(selectedStore) {
  const storeCards = document.querySelectorAll('.store-card')
  storeCards.forEach((card) => {
    if (card.getAttribute('data-store') === selectedStore) {
      card.classList.add('active')
    } else {
      card.classList.remove('active')
    }
  })
}

function updateAuthModalMode() {
  const title = document.getElementById('authTitle')
  const subtitle = document.getElementById('authSubtitle')
  const submitBtn = document.getElementById('authSubmitBtn')
  const toggleText = document.getElementById('authToggleText')
  const toggleBtn = document.getElementById('toggleAuthMode')

  if (isSignUpMode) {
    title.textContent = 'Create Account'
    subtitle.textContent = 'Sign up to start saving recipes and meal plans.'
    submitBtn.textContent = 'Sign Up'
    toggleText.textContent = 'Already have an account?'
    toggleBtn.textContent = 'Sign In'
  } else {
    title.textContent = 'Sign In'
    subtitle.textContent = 'Sign in to access your saved recipes and meal plans.'
    submitBtn.textContent = 'Sign In'
    toggleText.textContent = "Don't have an account?"
    toggleBtn.textContent = 'Sign Up'
  }
}