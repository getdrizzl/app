import { supabase, SUPABASE_URL } from './supabaseClient.js'
import { initAuth } from './auth.js'

// Helper function declared first so it can safely be used in top-level initializations
function id(str) { return document.getElementById(str) }

// DOM Elements
const searchWrapper = id('searchWrapper')
const searchTrigger = id('searchTrigger')
const searchInput = id('searchInput')
const searchClose = id('searchClose')
const navLinks = id('navLinks')

const recipeGrid = id('recipeGrid')
const loadingEl = id('loading')
const errorEl = id('error')
const placeholderView = id('placeholderView')
const placeholderTitle = id('placeholderTitle')

const pageTitle = id('pageTitle')
const pageSubtitle = id('pageSubtitle')

// Filter Controls DOM Elements
const categoryFilter = id('categoryFilter')
const difficultyFilter = id('difficultyFilter')
const proteinFilter = id('proteinFilter')
const sortBySelect = id('sortBySelect')
const resetFiltersBtn = id('resetFiltersBtn')

// Historical Nutrition Controls
const historyRangeSelect = id('historyRangeSelect')

let allRecipes = []
let favoritedRecipeIds = new Set()
let activeSection = 'all'
let currentSearchResults = []
let isVoiceSearchActive = false
let currentUser = null
let dailyNutritionLogs = []

function getImageUrl(recipeId) {
  return `${SUPABASE_URL}/storage/v1/object/public/hero-images/${recipeId}.jpg`
}

// --- Check Initial URL Params for Section State ---
function checkInitialSection() {
  const urlParams = new URLSearchParams(window.location.search)
  const targetSection = urlParams.get('section')

  if (targetSection) {
    const targetTab = document.querySelector(`.nav-item[data-section="${targetSection}"]`)
    if (targetTab) {
      navItems.forEach(n => n.classList.remove('active'))
      targetTab.classList.add('active')
      activeSection = targetSection
      switchSection(activeSection, targetTab.textContent.trim())
    }
  }
}

// --- Navigation Section Handling ---
const navItems = document.querySelectorAll('.nav-item')
navItems.forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault()
    navItems.forEach(n => n.classList.remove('active'))
    item.classList.add('active')

    activeSection = item.getAttribute('data-section')
    switchSection(activeSection, item.textContent.trim())
  })
})

function switchSection(sectionKey, titleText) {
  isVoiceSearchActive = false

  // View Containers
  const filterBar = id('filterBar')
  const nutritionView = id('nutritionView')
  const shoppingView = id('shoppingView')

  // Hide all containers first
  if (recipeGrid) recipeGrid.classList.add('hidden')
  if (placeholderView) placeholderView.classList.add('hidden')
  if (nutritionView) nutritionView.classList.add('hidden')
  if (shoppingView) shoppingView.classList.add('hidden')

  if (sectionKey === 'all') {
    if (filterBar) filterBar.classList.remove('hidden')
    if (recipeGrid) recipeGrid.classList.remove('hidden')
    if (pageTitle) pageTitle.textContent = 'All Recipes'
    if (pageSubtitle) pageSubtitle.textContent = 'Explore high-protein, curated meals for your goals.'
    applyFiltersAndRender()
  } else if (sectionKey === 'my-recipes') {
    if (filterBar) filterBar.classList.remove('hidden')
    if (recipeGrid) recipeGrid.classList.remove('hidden')
    if (pageTitle) pageTitle.textContent = 'My Recipes'
    if (pageSubtitle) pageSubtitle.textContent = 'Your saved favorites and meal creations.'
    applyFiltersAndRender()
  } else if (sectionKey === 'nutrition') {
    if (filterBar) filterBar.classList.add('hidden')
    if (nutritionView) nutritionView.classList.remove('hidden')
    if (pageTitle) pageTitle.textContent = 'Nutrition Dashboard'
    if (pageSubtitle) pageSubtitle.textContent = 'Track your daily intake, targets, and historical trends over time.'
    fetchAndRenderNutritionData()
  } else if (sectionKey === 'shopping') {
    if (filterBar) filterBar.classList.add('hidden')
    if (shoppingView) shoppingView.classList.remove('hidden')
    if (pageTitle) pageTitle.textContent = 'Shopping List'
    if (pageSubtitle) pageSubtitle.textContent = 'Aggregated ingredient checklist based on your selected grocer.'
  } else {
    if (filterBar) filterBar.classList.add('hidden')
    if (placeholderView) placeholderView.classList.remove('hidden')
    if (pageTitle) pageTitle.textContent = titleText
    if (pageSubtitle) pageSubtitle.textContent = `Custom view for ${titleText}.`
    if (placeholderTitle) placeholderTitle.textContent = `${titleText} Coming Soon`
  }
}

// --- Fetch Historical Daily Nutrition Logs ---
async function fetchAndRenderNutritionData() {
  const { data: { session } } = await supabase.auth.getSession()
  currentUser = session?.user || null

  if (!currentUser) {
    dailyNutritionLogs = []
    updateNutritionDashboardUI()
    return
  }

  try {
    const { data, error } = await supabase
      .from('daily_nutrition_logs')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('log_date', { ascending: false })

    if (error) throw error
    dailyNutritionLogs = data || []
  } catch (err) {
    console.error('Error fetching daily nutrition logs:', err)
  }

  updateNutritionDashboardUI()
}

// --- Dynamic Nutrition Dashboard & Historical Logs UI Update ---
function updateNutritionDashboardUI() {
  const goalCalories = parseInt(id('goalCalories')?.value) || 2800
  const goalProtein = parseInt(id('goalProtein')?.value) || 200
  const goalCarbs = parseInt(id('goalCarbs')?.value) || 280
  const goalFat = parseInt(id('goalFat')?.value) || 75

  // 1. Update Target Goal Displays
  if (id('targetCaloriesVal')) id('targetCaloriesVal').textContent = goalCalories.toLocaleString()
  if (id('targetProteinVal')) id('targetProteinVal').textContent = goalProtein
  if (id('targetCarbsVal')) id('targetCarbsVal').textContent = goalCarbs
  if (id('targetFatVal')) id('targetFatVal').textContent = goalFat

  // 2. Derive Today's Intakes from Historical Log Array (if available)
  const todayStr = new Date().toISOString().split('T')[0]
  const todayLog = dailyNutritionLogs.find(log => log.log_date === todayStr)

  const consumedCal = todayLog ? (todayLog.calories_consumed || 0) : 1850
  const consumedProtein = todayLog ? (todayLog.protein_g || 0) : 0
  const consumedCarbs = todayLog ? (todayLog.carbs_g || 0) : 0
  const consumedFat = todayLog ? (todayLog.fats_g || 0) : 0

  const remaining = Math.max(0, goalCalories - consumedCal)

  if (id('consumedCalText')) id('consumedCalText').textContent = `${consumedCal.toLocaleString()} kcal`
  if (id('remainingCalText')) id('remainingCalText').textContent = `${remaining.toLocaleString()} kcal`

  // Update circular ring offset (314 is full circumference)
  const percent = Math.min(1, consumedCal / goalCalories)
  const offset = 314 - (314 * percent)
  const ringFill = id('calorieRingFill')
  if (ringFill) ringFill.style.strokeDashoffset = offset

  // 3. Process Historical Aggregations & Filter
  const selectedRangeDays = parseInt(historyRangeSelect?.value) || 7
  const filteredLogs = filterLogsByDays(dailyNutritionLogs, selectedRangeDays)

  renderHistoricalStats(filteredLogs, goalCalories, goalProtein)
  renderHistoricalTable(filteredLogs)
}

function filterLogsByDays(logs, days) {
  if (days === 0) return logs // All-time

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)

  return logs.filter(log => {
    const logDate = new Date(log.log_date)
    return logDate >= cutoffDate
  })
}

function renderHistoricalStats(logs, goalCalories, goalProtein) {
  const avgCaloriesEl = id('avgCaloriesVal')
  const avgProteinEl = id('avgProteinVal')
  const totalDaysLoggedEl = id('totalDaysLoggedVal')
  const goalHitRateEl = id('goalHitRateVal')

  if (!logs.length) {
    if (avgCaloriesEl) avgCaloriesEl.textContent = '0 kcal'
    if (avgProteinEl) avgProteinEl.textContent = '0 g'
    if (totalDaysLoggedEl) totalDaysLoggedEl.textContent = '0 days'
    if (goalHitRateEl) goalHitRateEl.textContent = '0%'
    return
  }

  const totalCalories = logs.reduce((sum, item) => sum + (item.calories_consumed || 0), 0)
  const totalProtein = logs.reduce((sum, item) => sum + (item.protein_g || 0), 0)
  const avgCalories = Math.round(totalCalories / logs.length)
  const avgProtein = Math.round(totalProtein / logs.length)

  // Calorie target completion rate (within 10% of goal)
  const daysHitGoal = logs.filter(l => l.calories_consumed >= (goalCalories * 0.9)).length
  const hitRate = Math.round((daysHitGoal / logs.length) * 100)

  if (avgCaloriesEl) avgCaloriesEl.textContent = `${avgCalories.toLocaleString()} kcal`
  if (avgProteinEl) avgProteinEl.textContent = `${avgProtein} g`
  if (totalDaysLoggedEl) totalDaysLoggedEl.textContent = `${logs.length} days`
  if (goalHitRateEl) goalHitRateEl.textContent = `${hitRate}%`
}

function renderHistoricalTable(logs) {
  const tableBody = id('nutritionHistoryTableBody')
  if (!tableBody) return

  if (!logs.length) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 1.5rem; color: rgba(255,255,255,0.5);">
          No daily nutrition records found for this timeframe.
        </td>
      </tr>`
    return
  }

  tableBody.innerHTML = logs.map(log => {
    const formattedDate = new Date(log.log_date + 'T00:00:00').toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })

    return `
      <tr>
        <td style="font-weight: 600;">${formattedDate}</td>
        <td>${log.calories_consumed ? log.calories_consumed.toLocaleString() : 0} kcal</td>
        <td>${log.protein_g || 0} g</td>
        <td>${log.carbs_g || 0} g</td>
        <td>${log.fats_g || 0} g</td>
        <td style="color: rgba(255,255,255,0.7); font-size: 0.875rem;">${log.notes || '—'}</td>
      </tr>
    `
  }).join('')
}

// History range dropdown listener
historyRangeSelect?.addEventListener('change', () => {
  updateNutritionDashboardUI()
})

// Quick edit button listener
id('editGoalsQuickBtn')?.addEventListener('click', () => {
  const profileBtn = id('profileBtn')
  if (profileBtn) profileBtn.click()
})

// --- Dynamic Filter Options Generator ---
function populateFilterDropdowns() {
  if (!allRecipes.length) return

  if (categoryFilter) {
    const categories = [...new Set(allRecipes.map(r => r.category).filter(Boolean))].sort()
    categoryFilter.innerHTML = '<option value="">All Categories</option>' +
      categories.map(c => `<option value="${c}">${c}</option>`).join('')
  }

  if (difficultyFilter) {
    const difficulties = [...new Set(allRecipes.map(r => r.difficulty).filter(Boolean))].sort()
    difficultyFilter.innerHTML = '<option value="">All Difficulties</option>' +
      difficulties.map(d => `<option value="${d}">${d}</option>`).join('')
  }

  if (proteinFilter) {
    const proteins = [...new Set(allRecipes.map(r => r.protein_type).filter(Boolean))].sort()
    proteinFilter.innerHTML = '<option value="">All Proteins</option>' +
      proteins.map(p => `<option value="${p}">${p}</option>`).join('')
  }
}

// --- Filtering and Sorting Engine ---
function applyFiltersAndRender() {
  let dataset = activeSection === 'my-recipes'
    ? allRecipes.filter(r => favoritedRecipeIds.has(r.id))
    : [...allRecipes]

  // Apply Search Keyword Filter (if typing)
  const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : ''
  if (searchQuery) {
    dataset = dataset.filter(r =>
      r.title.toLowerCase().includes(searchQuery) ||
      (r.subtitle && r.subtitle.toLowerCase().includes(searchQuery)) ||
      (r.category && r.category.toLowerCase().includes(searchQuery))
    )
  }

  // Apply Dropdown Filters
  const selectedCategory = categoryFilter?.value || ''
  const selectedDifficulty = difficultyFilter?.value || ''
  const selectedProtein = proteinFilter?.value || ''

  if (selectedCategory) {
    dataset = dataset.filter(r => r.category === selectedCategory)
  }
  if (selectedDifficulty) {
    dataset = dataset.filter(r => r.difficulty === selectedDifficulty)
  }
  if (selectedProtein) {
    dataset = dataset.filter(r => r.protein_type === selectedProtein)
  }

  // Apply Sorting
  const sortBy = sortBySelect?.value || 'newest'
  dataset.sort((a, b) => {
    switch (sortBy) {
      case 'title-asc':
        return a.title.localeCompare(b.title)
      case 'title-desc':
        return b.title.localeCompare(a.title)
      case 'prep-asc':
        return (a.prep_time_minutes || 0) - (b.prep_time_minutes || 0)
      case 'prep-desc':
        return (b.prep_time_minutes || 0) - (a.prep_time_minutes || 0)
      case 'difficulty-asc': {
        const order = { 'Easy': 1, 'Medium': 2, 'Hard': 3 }
        return (order[a.difficulty] || 99) - (order[b.difficulty] || 99)
      }
      case 'newest':
      default:
        return new Date(b.created_at || 0) - new Date(a.created_at || 0)
    }
  })

  currentSearchResults = dataset
  renderGrid(dataset, isVoiceSearchActive)
}

// Event listeners for filters and sorting controls
[categoryFilter, difficultyFilter, proteinFilter, sortBySelect].forEach(element => {
  element?.addEventListener('change', () => applyFiltersAndRender())
})

if (resetFiltersBtn) {
  resetFiltersBtn.addEventListener('click', () => {
    if (categoryFilter) categoryFilter.value = ''
    if (difficultyFilter) difficultyFilter.value = ''
    if (proteinFilter) proteinFilter.value = ''
    if (sortBySelect) sortBySelect.value = 'newest'
    if (searchInput) searchInput.value = ''
    applyFiltersAndRender()
  })
}

// --- Expanding Search Handler ---
if (searchTrigger) {
  searchTrigger.addEventListener('click', () => {
    if (!searchWrapper.classList.contains('expanded')) {
      searchWrapper.classList.add('expanded')
      navLinks.classList.add('fade-out')
      searchInput.focus()
    }
  })
}

if (searchClose) {
  searchClose.addEventListener('click', () => {
    closeSearch()
  })
}

function closeSearch() {
  if (searchWrapper) searchWrapper.classList.remove('expanded')
  if (navLinks) navLinks.classList.remove('fade-out')
  if (searchInput) searchInput.value = ''
  isVoiceSearchActive = false
  applyFiltersAndRender()
}

if (searchInput) {
  searchInput.addEventListener('input', () => {
    isVoiceSearchActive = false
    applyFiltersAndRender()
  })
}

// --- User Favorites Fetching & Toggling ---
async function fetchUserFavorites() {
  const { data: { session } } = await supabase.auth.getSession()
  currentUser = session?.user || null

  if (!currentUser) {
    favoritedRecipeIds.clear()
    return
  }

  try {
    const { data, error } = await supabase
      .from('user_favorite_recipes')
      .select('recipe_id')
      .eq('user_id', currentUser.id)

    if (error) throw error
    favoritedRecipeIds = new Set((data || []).map(item => item.recipe_id))
  } catch (err) {
    console.error('Error loading favorites:', err)
  }
}

async function toggleFavorite(recipeId, buttonEl) {
  const { data: { session } } = await supabase.auth.getSession()
  currentUser = session?.user || null

  if (!currentUser) {
    const authModal = id('authModal')
    if (authModal) authModal.classList.remove('hidden')
    return
  }

  const isFav = favoritedRecipeIds.has(recipeId)

  if (isFav) {
    favoritedRecipeIds.delete(recipeId)
  } else {
    favoritedRecipeIds.add(recipeId)
  }
  updateHeartButtonUI(buttonEl, !isFav)

  try {
    if (isFav) {
      const { error } = await supabase
        .from('user_favorite_recipes')
        .delete()
        .eq('user_id', currentUser.id)
        .eq('recipe_id', recipeId)

      if (error) throw error
    } else {
      const { error } = await supabase
        .from('user_favorite_recipes')
        .upsert(
          { user_id: currentUser.id, recipe_id: recipeId },
          { onConflict: 'user_id, recipe_id' }
        )

      if (error) throw error
    }

    if (activeSection === 'my-recipes') {
      applyFiltersAndRender()
    }
  } catch (err) {
    console.error('Error toggling favorite:', err)
    if (isFav) {
      favoritedRecipeIds.add(recipeId)
    } else {
      favoritedRecipeIds.delete(recipeId)
    }
    updateHeartButtonUI(buttonEl, isFav)
  }
}

function updateHeartButtonUI(buttonEl, isFav) {
  if (!buttonEl) return
  if (isFav) {
    buttonEl.classList.add('is-favorited')
    buttonEl.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" stroke-width="2">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
      </svg>`
  } else {
    buttonEl.classList.remove('is-favorited')
    buttonEl.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="rgba(15, 23, 42, 0.4)" stroke="#ffffff" stroke-width="2">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
      </svg>`
  }
}

// --- Supabase Recipe Fetching ---
async function fetchRecipes() {
  try {
    if (loadingEl) loadingEl.classList.remove('hidden')
    if (errorEl) errorEl.classList.add('hidden')
    if (recipeGrid) recipeGrid.innerHTML = ''

    await fetchUserFavorites()

    const { data, error } = await supabase
      .from('recipes')
      .select('*')

    if (error) throw error

    allRecipes = data || []

    populateFilterDropdowns()
    checkInitialSection()
    applyFiltersAndRender()
  } catch (err) {
    console.error('Fetch Error:', err)
    if (errorEl) {
      errorEl.textContent = `Failed to load recipes: ${err.message}`
      errorEl.classList.remove('hidden')
    }
  } finally {
    if (loadingEl) loadingEl.classList.add('hidden')
  }
}

// Render grid cards
function renderGrid(recipes, isNumberedVoiceView = false) {
  if (!recipeGrid) return
  recipeGrid.innerHTML = ''

  if (recipes.length === 0) {
    const emptyMessage = activeSection === 'my-recipes'
      ? 'You haven\'t favorited any recipes matching these filters yet.'
      : 'No recipes found matching your search or filters.'
    recipeGrid.innerHTML = `<div class="glass-card status-box" style="grid-column: 1/-1; padding: 2.5rem; text-align: center; color: rgba(255,255,255,0.7);">${emptyMessage}</div>`
    return
  }

  recipes.forEach((recipe, idx) => {
    const card = document.createElement('div')
    card.className = 'recipe-card'
    card.setAttribute('data-id', recipe.id)
    card.style.position = 'relative'

    const imgUrl = getImageUrl(recipe.id)
    const prepTime = recipe.prep_time_minutes ? `${recipe.prep_time_minutes} mins` : 'N/A'
    const difficulty = recipe.difficulty || 'Standard'
    const categoryBadge = recipe.category ? `<span class="badge">${recipe.category}</span>` : ''
    const subtitleText = recipe.subtitle ? `<p class="card-subtitle">${recipe.subtitle}</p>` : ''

    const badgeNum = idx + 1
    const numberBadgeHtml = isNumberedVoiceView
      ? `<div style="position: absolute; top: 12px; left: 12px; background: #0284c7; color: #fff; font-weight: 800; font-size: 1.25rem; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; z-index: 10; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.2);">${badgeNum}</div>`
      : ''

    const isFav = favoritedRecipeIds.has(recipe.id)
    const heartSvg = isFav
      ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`
      : `<svg width="20" height="20" viewBox="0 0 24 24" fill="rgba(15, 23, 42, 0.4)" stroke="#ffffff" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`

    const favButtonHtml = `
      <button 
        class="fav-btn ${isFav ? 'is-favorited' : ''}" 
        aria-label="Favorite Recipe"
        style="position: absolute; top: 12px; right: 12px; background: rgba(15, 23, 42, 0.5); backdrop-filter: blur(8px); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 10; transition: transform 0.2s ease, background 0.2s ease;"
      >
        ${heartSvg}
      </button>
    `

    card.innerHTML = `
      ${numberBadgeHtml}
      <div class="card-image-container" style="position: relative;">
        ${favButtonHtml}
        <img 
          src="${imgUrl}" 
          alt="${recipe.title}" 
          class="card-image" 
          loading="lazy" 
          onerror="this.onerror=null; this.parentElement.style.display='none';" 
        />
      </div>
      <div class="card-content">
        <h2 class="card-title">${recipe.title}</h2>
        ${subtitleText}
      </div>
      <div class="card-footer">
        ${categoryBadge}
        <span class="prep-time">${prepTime}</span>
        <span class="badge difficulty-pill difficulty-${difficulty.toLowerCase()}">${difficulty}</span>
      </div>
    `

    // Favorite Button Click Handler
    const favBtn = card.querySelector('.fav-btn')
    favBtn?.addEventListener('click', (e) => {
      e.stopPropagation()
      toggleFavorite(recipe.id, favBtn)
    })

    // Card Click Handler with Origin Tracking
    card.addEventListener('click', () => {
      const fromParam = `from=${encodeURIComponent(activeSection)}`
      if (recipe.slug) {
        window.location.href = `./recipe.html?slug=${encodeURIComponent(recipe.slug)}&${fromParam}`
      } else {
        window.location.href = `./recipe.html?id=${recipe.id}&${fromParam}`
      }
    })

    recipeGrid.appendChild(card)
  })
}

// --- Listen to Auth State Changes ---
supabase.auth.onAuthStateChange(async (event, session) => {
  currentUser = session?.user || null
  await fetchUserFavorites()
  if (activeSection === 'nutrition') {
    await fetchAndRenderNutritionData()
  } else {
    applyFiltersAndRender()
  }
})

// --- REALTIME BROADCAST LISTENER FOR HOME ASSISTANT VOICE COMMANDS ---

// NEW CODE:
const voiceChannel = supabase.channel('drizzl-voice-commands', {
  config: {
    broadcast: { self: true }
  }
})

voiceChannel
  .on('broadcast', { event: 'voice_command' }, (payload) => {
    console.log('Broadcast received in browser:', payload)
    handleIncomingVoiceCommand(payload.payload)
  })
  .subscribe((status) => {
    console.log('Realtime Voice Channel Status:', status)
  })

function handleIncomingVoiceCommand(data) {
  if (!data || !data.action) return
  const { action, payload } = data

  console.log('Received Realtime HA Event on Main Page:', action, payload)

  if (action === 'search') {
    handleVoiceSearch(payload)
  } else if (action === 'select') {
    const index = parseInt(payload, 10)
    handleVoiceSelect(index)
  }
}

function handleVoiceSearch(queryText) {
  console.log(`Voice Search Executed for: "${queryText}"`)

  switchSection('all', 'All Recipes')
  isVoiceSearchActive = true

  if (searchInput) searchInput.value = queryText.trim()
  applyFiltersAndRender()

  if (pageTitle) pageTitle.textContent = `Search: "${queryText}"`
  if (pageSubtitle) pageSubtitle.textContent = `Found ${currentSearchResults.length} recipe(s). Say "Select [number]" to open.`
}

function handleVoiceSelect(index) {
  if (!currentSearchResults || currentSearchResults.length === 0) {
    console.warn('No active search results to select from.')
    return
  }

  const targetIndex = index - 1
  if (targetIndex >= 0 && targetIndex < currentSearchResults.length) {
    const selected = currentSearchResults[targetIndex]
    const fromParam = `from=${encodeURIComponent(activeSection)}`
    if (selected.slug) {
      window.location.href = `./recipe.html?slug=${encodeURIComponent(selected.slug)}&${fromParam}`
    } else {
      window.location.href = `./recipe.html?id=${selected.id}&${fromParam}`
    }
  }
}

// Init
initAuth()
fetchRecipes()