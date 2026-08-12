import { supabase, SUPABASE_URL } from './supabaseClient.js'
import { initAuth } from './auth.js'

let rawIngredients = []
let currentScale = 1

// State variables for Cook Mode
let recipeData = null
let currentInstructions = []
let currentStepIndex = 0
let isCookModeActive = false

// User and Favorite state
let currentUser = null
let isFavorited = false

// Global Timers State Registry
let globalTimers = []

// Color palette for active ingredient highlights
const HIGHLIGHT_COLORS = [
  '#38bdf8',
  '#4ade80',
  '#f43f5e',
  '#fbbf24',
  '#c084fc',
  '#f97316',
  '#2dd4bf'
]

const urlParams = new URLSearchParams(window.location.search)
const recipeSlug = urlParams.get('slug')
const recipeId = urlParams.get('id')
const fromSection = urlParams.get('from')

function getImageUrl(recipeId) {
  return `${SUPABASE_URL}/storage/v1/object/public/hero-images/${recipeId}.jpg`
}

function getIngredientImageUrl(ingredientName) {
  const formattedName = ingredientName.toLowerCase().replace(/[^a-z0-9]/g, '-')
  return `${SUPABASE_URL}/storage/v1/object/public/ingredient-images/${formattedName}.png`
}

function setupBackButton() {
  const backBtn = document.getElementById('backBtn')
  if (!backBtn) return

  if (fromSection === 'my-recipes') {
    backBtn.textContent = '← Back to My Recipes'
    backBtn.href = './index.html?section=my-recipes'
  } else {
    backBtn.textContent = '← Back to All Recipes'
    backBtn.href = './index.html?section=all'
  }
}

async function checkFavoriteStatus(recipeId) {
  const { data: { session } } = await supabase.auth.getSession()
  currentUser = session?.user || null

  if (!currentUser) {
    isFavorited = false
    updateDetailFavButtonUI()
    return
  }

  try {
    const { data, error } = await supabase
      .from('user_favorite_recipes')
      .select('id')
      .eq('user_id', currentUser.id)
      .eq('recipe_id', recipeId)
      .maybeSingle()

    if (error) throw error
    isFavorited = !!data
    updateDetailFavButtonUI()
  } catch (err) {
    console.error('Error checking favorite status:', err)
  }
}

async function toggleDetailFavorite() {
  const { data: { session } } = await supabase.auth.getSession()
  currentUser = session?.user || null

  if (!currentUser) {
    const authModal = document.getElementById('authModal')
    if (authModal) authModal.classList.remove('hidden')
    return
  }

  if (!recipeData) return

  isFavorited = !isFavorited
  updateDetailFavButtonUI()

  try {
    if (!isFavorited) {
      const { error } = await supabase
        .from('user_favorite_recipes')
        .delete()
        .eq('user_id', currentUser.id)
        .eq('recipe_id', recipeData.id)

      if (error) throw error
    } else {
      const { error } = await supabase
        .from('user_favorite_recipes')
        .upsert(
          { user_id: currentUser.id, recipe_id: recipeData.id },
          { onConflict: 'user_id, recipe_id' }
        )

      if (error) throw error
    }
  } catch (err) {
    console.error('Error toggling detail favorite:', err)
    isFavorited = !isFavorited
    updateDetailFavButtonUI()
  }
}

function updateDetailFavButtonUI() {
  const favBtnDetail = document.getElementById('favBtnDetail')
  if (!favBtnDetail) return

  // Matching Pill styling across all buttons
  favBtnDetail.style.borderRadius = '9999px'

  if (isFavorited) {
    favBtnDetail.classList.add('is-favorited')
    favBtnDetail.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" stroke-width="2">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
      </svg>
      <span>Saved</span>
    `
  } else {
    favBtnDetail.classList.remove('is-favorited')
    favBtnDetail.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
      </svg>
      <span>Favorite</span>
    `
  }
}

async function loadRecipePage() {
  setupBackButton()

  const loading = document.getElementById('loading')
  const errorEl = document.getElementById('error')
  const container = document.getElementById('recipeContainer')

  if (!recipeSlug && !recipeId) {
    if (loading) loading.classList.add('hidden')
    if (errorEl) {
      errorEl.textContent = 'No recipe identifier provided in URL.'
      errorEl.classList.remove('hidden')
    }
    return
  }

  try {
    let query = supabase.from('recipes').select('*')
    if (recipeSlug) {
      query = query.eq('slug', recipeSlug)
    } else {
      query = query.eq('id', recipeId)
    }

    const { data: recipe, error: recipeErr } = await query.single()

    if (recipeErr || !recipe) throw new Error(recipeErr?.message || 'Recipe not found')

    recipeData = recipe

    const recipeIdPill = document.getElementById('recipeIdPill')
    if (recipeIdPill) {
      recipeIdPill.textContent = `ID: ${recipe.id}`
    }

    const [ingRes, instRes, nutRes] = await Promise.all([
      supabase.from('recipe_ingredients').select('*').eq('recipe_id', recipe.id),
      supabase.from('recipe_instructions').select('*').eq('recipe_id', recipe.id),
      supabase.from('recipe_nutrition').select('*').eq('recipe_id', recipe.id).maybeSingle()
    ])

    rawIngredients = ingRes.data || []
    currentInstructions = (instRes.data || []).sort((a, b) => (a.step_number || 0) - (b.step_number || 0))

    document.title = `${recipe.title} — Drizzl`
    const titleEl = document.getElementById('recipeTitle')
    const subTitleEl = document.getElementById('recipeSubtitle')
    const prepTimeEl = document.getElementById('prepTime')
    const diffEl = document.getElementById('difficulty')

    if (titleEl) titleEl.textContent = recipe.title
    if (subTitleEl) subTitleEl.textContent = recipe.subtitle || ''
    if (prepTimeEl) prepTimeEl.textContent = recipe.prep_time_minutes ? `${recipe.prep_time_minutes} mins` : 'N/A'
    if (diffEl) diffEl.textContent = recipe.difficulty || 'Standard'

    // --- Hero Card Setup ---
    const heroCard = document.querySelector('.recipe-hero-card') || document.getElementById('heroImage')?.closest('.glass-card')
    const macroBar = document.getElementById('macroBar')
    const heroImageUrl = getImageUrl(recipe.id)

    if (heroCard) {
      heroCard.style.position = 'relative'
      heroCard.style.overflow = 'hidden'
      heroCard.style.minHeight = '380px'
      heroCard.style.display = 'flex'
      heroCard.style.flexDirection = 'column'
      heroCard.style.justifyContent = 'flex-end'

      // Clean out existing backdrop elements if re-rendered
      const existingBg = heroCard.querySelector('.hero-bg-layer')
      if (existingBg) existingBg.remove()
      const existingGradient = heroCard.querySelector('.hero-gradient-layer')
      if (existingGradient) existingGradient.remove()

      // Layer 1: Bottom Image filling full container
      const bgImg = document.createElement('img')
      bgImg.className = 'hero-bg-layer'
      bgImg.src = heroImageUrl
      bgImg.alt = recipe.title
      bgImg.style.position = 'absolute'
      bgImg.style.top = '0'
      bgImg.style.left = '0'
      bgImg.style.width = '100%'
      bgImg.style.height = '100%'
      bgImg.style.objectFit = 'cover'
      bgImg.style.zIndex = '1'

      // Layer 2: Middle Gradient Overlay from bottom up to subtitle line
      const gradientOverlay = document.createElement('div')
      gradientOverlay.className = 'hero-gradient-layer'
      gradientOverlay.style.position = 'absolute'
      gradientOverlay.style.bottom = '0'
      gradientOverlay.style.left = '0'
      gradientOverlay.style.right = '0'
      gradientOverlay.style.height = '75%'
      gradientOverlay.style.background = 'linear-gradient(to top, rgba(15, 23, 42, 0.98) 0%, rgba(15, 23, 42, 0.75) 50%, rgba(15, 23, 42, 0) 100%)'
      gradientOverlay.style.zIndex = '2'
      gradientOverlay.style.pointerEvents = 'none'

      heroCard.insertBefore(bgImg, heroCard.firstChild)
      heroCard.insertBefore(gradientOverlay, bgImg.nextSibling)

      // Ensure content wrapper sits cleanly on Layer 3
      const contentWrapper = heroCard.querySelector('.hero-content') || heroCard.children[2]
      if (contentWrapper) {
        contentWrapper.style.position = 'relative'
        contentWrapper.style.zIndex = '3'
        contentWrapper.style.padding = '2rem 1.5rem 1.5rem 1.5rem'
      }
    }

    const heroImgEl = document.getElementById('heroImage')
    if (heroImgEl && heroImgEl.tagName === 'IMG' && heroImgEl.parentNode !== heroCard) {
      heroImgEl.style.display = 'none'
    }

    const badgeContainer = document.getElementById('heroBadges')
    if (badgeContainer) {
      badgeContainer.innerHTML = ''
      if (recipe.category) {
        badgeContainer.innerHTML += `<span class="badge">${recipe.category}</span>`
      }
      if (recipe.protein_type) {
        badgeContainer.innerHTML += `<span class="badge badge-amber">${recipe.protein_type}</span>`
      }
    }

    renderIngredients()
    renderInstructions(currentInstructions)
    initializeGlobalTimers(currentInstructions)
    setupCookModeData(recipe, rawIngredients)

    await checkFavoriteStatus(recipe.id)

    if (nutRes.data) {
      const n = nutRes.data
      const nfCal = document.getElementById('nfCalories')
      const nfProt = document.getElementById('nfProtein')
      const nfCarb = document.getElementById('nfCarbs')
      const nfFat = document.getElementById('nfFat')

      if (nfCal) nfCal.textContent = n.calories ?? 0
      if (nfProt) nfProt.textContent = `${n.protein_g ?? 0}g`
      if (nfCarb) nfCarb.textContent = `${n.carbohydrates_g ?? 0}g`
      if (nfFat) nfFat.textContent = `${n.fat_g ?? 0}g`

      if (macroBar) macroBar.classList.remove('hidden')
    } else if (macroBar) {
      macroBar.classList.add('hidden')
    }

    if (loading) loading.classList.add('hidden')
    if (container) container.classList.remove('hidden')

  } catch (err) {
    console.error(err)
    if (loading) loading.classList.add('hidden')
    if (errorEl) {
      errorEl.textContent = `Error loading recipe: ${err.message}`
      errorEl.classList.remove('hidden')
    }
  }
}

function renderIngredients() {
  const grid = document.getElementById('ingredientGrid')
  if (!grid) return
  grid.innerHTML = ''

  rawIngredients.forEach(item => {
    const scaledAmount = item.amount ? (parseFloat(item.amount) * currentScale) : null
    const displayAmount = scaledAmount ? formatAmount(scaledAmount) : ''
    const unitStr = item.unit ? ` ${item.unit}` : ''

    const card = document.createElement('div')
    card.className = 'ingredient-tile glass-card'
    card.style.display = 'flex'
    card.style.alignItems = 'center'
    card.style.gap = '0.75rem'
    card.style.padding = '0.6rem 0.85rem'

    const imgUrl = getIngredientImageUrl(item.ingredient_name)

    card.innerHTML = `
      <img 
        src="${imgUrl}" 
        alt="${item.ingredient_name}" 
        class="ing-img" 
        style="width: 48px; height: 48px; object-fit: contain; flex-shrink: 0;"
        onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'32\\' height=\\'32\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'%2364748b\\' stroke-width=\\'1.5\\'><path d=\\'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6\\'/></svg>'" 
      />
      <div class="ing-details" style="display: flex; flex-direction: column; justify-content: center; min-width: 0;">
        <div class="ing-name" style="font-weight: 600; font-size: 0.95rem; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.ingredient_name}</div>
        <div class="ing-qty" style="font-size: 0.85rem; color: #4ade80; margin-top: 0.2rem;">${displayAmount}${unitStr}</div>
      </div>
    `
    grid.appendChild(card)
  })

  if (recipeData) {
    setupCookModeData(recipeData, rawIngredients)
  }
}

function formatAmount(num) {
  if (Number.isInteger(num)) return num.toString()
  const decimal = num % 1
  const integer = Math.floor(num)

  if (Math.abs(decimal - 0.5) < 0.05) return integer ? `${integer} ½` : '½'
  if (Math.abs(decimal - 0.25) < 0.05) return integer ? `${integer} ¼` : '¼'
  if (Math.abs(decimal - 0.75) < 0.05) return integer ? `${integer} ¾` : '¾'
  if (Math.abs(decimal - 0.33) < 0.05) return integer ? `${integer} ⅓` : '⅓'

  return num.toFixed(1)
}

function renderInstructions(steps) {
  const list = document.getElementById('instructionList')
  if (!list) return
  list.innerHTML = ''

  steps.forEach((step, idx) => {
    const li = document.createElement('li')
    li.className = 'step-item'
    li.innerHTML = `
      <div class="step-num">${idx + 1}</div>
      <div class="step-text">${step.instruction_text}</div>
    `
    list.appendChild(li)
  })
}

document.querySelectorAll('.scale-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.scale-btn').forEach(b => b.classList.remove('active'))
    e.target.classList.add('active')
    currentScale = parseFloat(e.target.getAttribute('data-scale'))
    renderIngredients()
  })
})

function initializeGlobalTimers(steps) {
  globalTimers = []
  let globalTimerCounter = 1

  steps.forEach((step, stepIdx) => {
    const rawText = step.instruction_text || ''
    const timeRegex = /\b((\d+)(?:\s*-\s*\d+)?)\s*(minute|min|hour|hr)s?\b/gi
    let match

    while ((match = timeRegex.exec(rawText)) !== null) {
      const minVal = parseInt(match[2], 10)
      const unit = match[3].toLowerCase()

      let seconds = minVal * 60
      if (unit.startsWith('hr') || unit.startsWith('hour')) {
        seconds = minVal * 3600
      }

      globalTimers.push({
        id: globalTimerCounter++,
        stepIndex: stepIdx,
        initialSeconds: seconds,
        remainingSeconds: seconds,
        state: 'idle',
        intervalId: null
      })
    }
  })

  syncTimersToHomeAssistant()
}

async function syncTimersToHomeAssistant() {
  const payloadTimers = globalTimers.slice(0, 10).map(timer => ({
    id: timer.id,
    step: timer.stepIndex + 1,
    duration_seconds: timer.initialSeconds
  }))

  try {
    const response = await fetch(`${HA_URL}/api/webhook/drizzl_sync_timers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        recipe: recipeData ? recipeData.title : 'Unknown Recipe',
        timers: payloadTimers
      })
    })

    if (!response.ok) {
      console.warn('Failed to sync timers to Home Assistant:', response.statusText)
    } else {
      console.log('Successfully dispatched timers to Home Assistant:', payloadTimers)
    }
  } catch (err) {
    console.error('Error dispatching recipe timers to Home Assistant webhook:', err)
  }
}

function toggleTimerState(timerId) {
  const timer = globalTimers.find(t => t.id === timerId)
  if (!timer || timer.state === 'disabled') return

  if (timer.state === 'idle' || timer.state === 'paused') {
    timer.state = 'running'
    timer.intervalId = setInterval(() => {
      timer.remainingSeconds--
      if (timer.remainingSeconds <= 0) {
        clearInterval(timer.intervalId)
        timer.intervalId = null
        timer.remainingSeconds = 0
        timer.state = 'completed'
      }
      updateTimerPillDOM(timer)
    }, 1000)
  } else if (timer.state === 'running') {
    clearInterval(timer.intervalId)
    timer.intervalId = null
    timer.state = 'paused'
  } else if (timer.state === 'completed') {
    timer.state = 'disabled'
  }

  updateTimerPillDOM(timer)
}

function updateTimerPillDOM(timer) {
  const pill = document.getElementById(`timer-pill-${timer.id}`)
  if (!pill) return

  const fill = pill.querySelector('.timer-progress-fill')
  const text = pill.querySelector('.timer-digits-text')

  pill.className = `timer-pill ${timer.state}`

  const percentage = Math.max(0, (timer.remainingSeconds / timer.initialSeconds) * 100)
  if (fill) fill.style.width = `${percentage}%`

  if (text) {
    if (timer.state === 'completed') {
      text.textContent = 'DONE'
    } else {
      text.textContent = formatSeconds(timer.remainingSeconds)
    }
  }
}

function renderPersistentTimersColumns() {
  const container = document.getElementById('cookTimersContainer')
  if (!container) return

  container.innerHTML = currentInstructions.map((_, stepIdx) => {
    const isCurrentStep = stepIdx === currentStepIndex
    const stepTimers = globalTimers.filter(t => t.stepIndex === stepIdx)

    let contentHtml = ''
    if (stepTimers.length > 0) {
      contentHtml = stepTimers.map(t => {
        const percentage = Math.max(0, (t.remainingSeconds / t.initialSeconds) * 100)
        const displayVal = t.state === 'completed' ? 'DONE' : formatSeconds(t.remainingSeconds)

        return `
          <div id="timer-pill-${t.id}" class="timer-pill ${t.state}" onclick="window.handleTimerClick(${t.id})">
            <div class="timer-progress-fill" style="width: ${percentage}%;"></div>
            <div class="timer-pill-content">
              <span class="timer-num-badge">#${t.id}</span>
              <span class="timer-digits-text">${displayVal}</span>
            </div>
          </div>
        `
      }).join('')
    } else {
      contentHtml = `<div class="cook-col-empty">No timers</div>`
    }

    return `
      <div class="cook-timer-column ${isCurrentStep ? 'active-step-col' : ''}">
        <div class="cook-col-header">Step ${stepIdx + 1}</div>
        ${contentHtml}
      </div>
    `
  }).join('')
}

window.handleTimerClick = function(timerId) {
  toggleTimerState(timerId)
}

const cookOverlay = document.getElementById('cookModeOverlay')
const startCookBtn = document.getElementById('startCookModeBtn')
const closeCookBtn = document.getElementById('closeCookModeBtn')

if (startCookBtn) startCookBtn.addEventListener('click', openCookMode)
if (closeCookBtn) closeCookBtn.addEventListener('click', closeCookMode)

document.addEventListener('keydown', (e) => {
  if (!isCookModeActive) return

  if (e.key === 'ArrowRight') {
    e.preventDefault()
    nextStep()
    return
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    prevStep()
    return
  } else if (e.key === 'Escape') {
    closeCookMode()
    return
  }

  if (/^[0-9]$/.test(e.key)) {
    e.preventDefault()
    let timerNum = parseInt(e.key, 10)
    if (timerNum === 0) timerNum = 10

    toggleTimerState(timerNum)
  }
})

function setupCookModeData(recipe, ingredients) {
  const cookTitle = document.getElementById('cookRecipeTitle')
  const cookSubtitle = document.getElementById('cookRecipeSubtitle')

  if (cookTitle) cookTitle.textContent = recipe.title
  if (cookSubtitle) cookSubtitle.textContent = recipe.subtitle || ''
}

function openCookMode() {
  if (!currentInstructions || currentInstructions.length === 0) {
    alert('No preparation steps available for this recipe.')
    return
  }
  isCookModeActive = true
  currentStepIndex = 0
  renderCookStep(currentStepIndex)
  if (cookOverlay) cookOverlay.classList.remove('hidden')
  document.body.style.overflow = 'hidden'
}

function closeCookMode() {
  isCookModeActive = false
  if (cookOverlay) cookOverlay.classList.add('hidden')
  document.body.style.overflow = ''
}

function renderCookStep(index) {
  if (index < 0 || index >= currentInstructions.length) return

  const step = currentInstructions[index]

  const instructionTextEl = document.getElementById('cookInstructionText')
  const stepPhoto = document.getElementById('cookStepPhoto')
  const photoPlaceholder = document.getElementById('cookPhotoPlaceholder')

  renderPersistentTimersColumns()

  let rawText = step.instruction_text || ''

  const activeIngredientMatches = []
  let activeColorCounter = 0

  const ingredientsWithStepColor = rawIngredients.map((item) => {
    const name = item.ingredient_name || ''
    const searchTerms = name.toLowerCase().split(' ').filter(w => w.length > 2)
    const isUsedInStep = searchTerms.some(term => rawText.toLowerCase().includes(term))

    let assignedColor = null

    if (isUsedInStep) {
      assignedColor = HIGHLIGHT_COLORS[activeColorCounter % HIGHLIGHT_COLORS.length]
      activeColorCounter++

      activeIngredientMatches.push({
        name,
        searchTerms,
        color: assignedColor
      })
    }

    return {
      ...item,
      isUsedInStep,
      color: assignedColor
    }
  })

  const cookIngList = document.getElementById('cookIngredientList')
  if (cookIngList) {
    cookIngList.innerHTML = ingredientsWithStepColor.map((item) => {
      const scaledAmount = item.amount ? (parseFloat(item.amount) * currentScale) : null
      const displayAmount = scaledAmount ? formatAmount(scaledAmount) : ''
      const unitStr = item.unit ? ` ${item.unit}` : ''

      if (item.isUsedInStep) {
        return `
          <li style="background: rgba(255,255,255,0.06); border-left: 4px solid ${item.color}; box-shadow: inset 0 0 12px ${item.color}22; padding: 0.5rem 0.75rem; margin-bottom: 0.35rem; border-radius: 6px; transition: all 0.2s ease;">
            <strong style="color: ${item.color};">${displayAmount}${unitStr}</strong> ${item.ingredient_name}
          </li>`
      } else {
        return `
          <li style="opacity: 0.35; padding: 0.4rem 0.75rem; margin-bottom: 0.2rem; filter: grayscale(80%); transition: all 0.2s ease;">
            <strong>${displayAmount}${unitStr}</strong> ${item.ingredient_name}
          </li>`
      }
    }).join('')
  }

  let highlightedText = rawText

  const sortedMatches = [...activeIngredientMatches].sort((a, b) => {
    const maxA = Math.max(...a.searchTerms.map(t => t.length))
    const maxB = Math.max(...b.searchTerms.map(t => t.length))
    return maxB - maxA
  })

  sortedMatches.forEach(({ searchTerms, color }) => {
    searchTerms.forEach(term => {
      const regex = new RegExp(`\\b(${term}[a-z]*)\\b`, 'gi')
      highlightedText = highlightedText.replace(regex, `<span style="color: ${color}; font-weight: 700; text-shadow: 0 0 10px ${color}44;">$1</span>`)
    })
  })

  if (instructionTextEl) {
    instructionTextEl.innerHTML = highlightedText
    requestAnimationFrame(() => adjustFontSize(instructionTextEl))
  }

  const stepImgUrl = step.image_url || (recipeData ? getImageUrl(recipeData.id) : '')
  if (stepPhoto && photoPlaceholder) {
    if (stepImgUrl) {
      stepPhoto.src = stepImgUrl
      stepPhoto.classList.remove('hidden')
      photoPlaceholder.classList.add('hidden')
    } else {
      stepPhoto.classList.add('hidden')
      photoPlaceholder.classList.remove('hidden')
    }
  }
}

function formatSeconds(sec) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function adjustFontSize(element) {
  const container = element.parentElement
  if (!container) return

  let minSize = 16
  let fontSize = 48

  element.style.fontSize = `${fontSize}px`
  element.style.lineHeight = '1.3'

  const maxAllowedHeight = container.clientHeight - 32

  while ((element.scrollHeight > maxAllowedHeight || element.getBoundingClientRect().bottom > container.getBoundingClientRect().bottom - 16) && fontSize > minSize) {
    fontSize -= 1
    element.style.fontSize = `${fontSize}px`
  }
}

function prevStep() {
  if (currentStepIndex > 0) {
    currentStepIndex--
    renderCookStep(currentStepIndex)
  }
}

function nextStep() {
  if (currentStepIndex < currentInstructions.length - 1) {
    currentStepIndex++
    renderCookStep(currentStepIndex)
  }
}

document.getElementById('favBtnDetail')?.addEventListener('click', toggleDetailFavorite)

document.getElementById('recipeIdPill')?.addEventListener('click', (e) => {
  if (!recipeData || !recipeData.id) return

  navigator.clipboard.writeText(recipeData.id.toString())

  const pill = e.currentTarget
  const originalText = pill.textContent
  pill.textContent = 'COPIED!'

  setTimeout(() => {
    pill.textContent = originalText
  }, 1200)
})

supabase.auth.onAuthStateChange(async (event, session) => {
  currentUser = session?.user || null
  if (recipeData) {
    await checkFavoriteStatus(recipeData.id)
  }
})

initAuth()
loadRecipePage()

const HA_URL = 'http://10.0.0.213:8123'
const HA_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiI4NjQxY2I0ZTI2MDA0ZjNhOWJmYjA3MDA3ZTEzMzI2NiIsImlhdCI6MTc4NjA0NTUyMSwiZXhwIjoyMTAxNDA1NTIxfQ.kMwGhLJw_oPIJZw7RMQNDjhPi9JZq9MpTFybyc9FNiQ'

let currentSearchResults = []

async function checkVoiceCommand() {
  try {
    const res = await fetch(`${HA_URL}/api/states/input_text.drizzl_command`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${HA_TOKEN}`,
        'Content-Type': 'application/json'
      }
    })

    if (!res.ok) return

    const data = await res.json()
    const command = data.state

    if (command && command !== 'idle' && command !== 'unknown' && command !== 'unavailable') {
      console.log('Received HA Command:', command)

      if (command.includes(':')) {
        const [action, payload] = command.split(':')

        if (action === 'search') {
          await handleVoiceSearch(payload)
        } else if (action === 'select') {
          const index = parseInt(payload, 10)
          handleVoiceSelect(index)
        } else if (action === 'timer') {
          const timerId = parseInt(payload, 10)
          if (!isNaN(timerId)) toggleTimerState(timerId)
        }
      } else if (command === 'next' || command === 'prev') {
        if (!isCookModeActive) openCookMode()
        if (command === 'next') nextStep()
        if (command === 'prev') prevStep()
      }

      await fetch(`${HA_URL}/api/services/input_text/set_value`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HA_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          entity_id: 'input_text.drizzl_command',
          value: 'idle'
        })
      })
    }
  } catch (err) {
    console.error('CORS or Network Error connecting to Home Assistant:', err)
  }
}

async function handleVoiceSearch(queryText) {
  if (isCookModeActive) closeCookMode()

  try {
    const { data: recipes, error } = await supabase
      .from('recipes')
      .select('*')
      .ilike('title', `%${queryText}%`)
      .limit(10)

    if (error) throw error

    currentSearchResults = recipes || []
    renderVoiceSearchResults(currentSearchResults, queryText)
  } catch (err) {
    console.error('Error executing voice search:', err)
  }
}

function renderVoiceSearchResults(recipes, queryText) {
  const container = document.getElementById('recipeContainer')
  if (!container) return

  if (recipes.length === 0) {
    container.innerHTML = `
      <div class="glass-card" style="padding: 2rem; text-align: center;">
        <h2>No recipes found for "${queryText}"</h2>
        <p>Try searching for a different item.</p>
      </div>`
    return
  }

  const fromParam = fromSection ? `&from=${encodeURIComponent(fromSection)}` : ''

  let html = `
    <div class="search-results-header" style="margin-bottom: 1.5rem;">
      <h2 style="font-size: 1.75rem; font-weight: 700;">Search Results for "${queryText}"</h2>
      <p style="color: #64748b;">Say "Select [number]" or tap an option below:</p>
    </div>
    <div class="search-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.5rem;">`

  recipes.forEach((item, idx) => {
    const badgeNum = idx + 1
    const imgUrl = getImageUrl(item.id)

    html += `
      <div class="glass-card recipe-voice-card" data-index="${badgeNum}" onclick="window.location.href='?id=${item.id}${fromParam}'" style="position: relative; cursor: pointer; overflow: hidden; border-radius: 12px; padding: 1rem;">
        <div style="position: absolute; top: 12px; left: 12px; background: #0284c7; color: #fff; font-weight: 800; font-size: 1.25rem; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; z-index: 10; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.2);">
          ${badgeNum}
        </div>
        <img src="${imgUrl}" alt="${item.title}" style="width: 100%; height: 160px; object-fit: cover; border-radius: 8px; margin-bottom: 0.75rem;" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'100\\' height=\\'100\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'%2364748b\\'><rect width=\\'18\\' height=\\'18\\' x=\\'3\\' y=\\'3\\' rx=\\'2\\'/></svg>'" />
        <h3 style="font-size: 1.15rem; font-weight: 600; margin: 0 0 0.25rem 0;">${item.title}</h3>
        <p style="font-size: 0.875rem; color: #64748b; margin: 0;">${item.subtitle || ''}</p>
      </div>`
  })

  html += `</div>`
  container.innerHTML = html
}

function handleVoiceSelect(index) {
  if (!currentSearchResults || currentSearchResults.length === 0) return

  const targetIndex = index - 1
  if (targetIndex >= 0 && targetIndex < currentSearchResults.length) {
    const selectedRecipe = currentSearchResults[targetIndex]
    const fromParam = fromSection ? `&from=${encodeURIComponent(fromSection)}` : ''
    window.location.href = `?id=${selectedRecipe.id}${fromParam}`
  }
}

setInterval(checkVoiceCommand, 500)