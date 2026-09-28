import './style.css'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'


// --------------------------------
// SMOOTH SCROLL HELPERS
// --------------------------------

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

function easeInOutCubic(t) {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2
}

// Animates any scroll position from its current value to `to`.
// get/set read and write the scroll position (page or a row of cards).
function animateScroll({ get, set, to, duration, onDone }) {
  const from = get()
  const distance = to - from

  if (reduceMotion.matches || duration <= 0 || Math.abs(distance) < 1) {
    set(to)
    onDone?.()
    return () => {}
  }

  let cancelled = false
  const start = performance.now()

  function step(now) {
    if (cancelled) return

    const progress = Math.min(1, (now - start) / duration)

    set(from + distance * easeInOutCubic(progress))

    if (progress < 1) {
      requestAnimationFrame(step)
    } else {
      onDone?.()
    }
  }

  requestAnimationFrame(step)

  return () => {
    cancelled = true
    onDone?.()
  }
}


// --------------------------------
// CANVAS SIZE
// --------------------------------

// The canvas fills #app. On desktop that's the whole hero;
// on phones it's the space below the photos.
const app = document.querySelector('#app')

function heroSize() {
  return {
    width: Math.max(app.clientWidth, 1),
    height: Math.max(app.clientHeight, 1)
  }
}


// --------------------------------
// SCENE
// --------------------------------

const scene = new THREE.Scene()

scene.background = new THREE.Color(0xF3EDD4)


// --------------------------------
// CAMERA
// --------------------------------

const camera = new THREE.PerspectiveCamera(
  50,
  heroSize().width / heroSize().height,
  0.1,
  100
)

camera.position.set(0, 0, 5)

// Distance that looks right on a wide desktop screen.
// Gets set properly once the mascot loads.
let baseCameraZ = 5

// How much of the canvas the mascot fills on phones (1 = edge to edge).
// Raise these to make the logo bigger, lower them for more breathing room.
const FIT_WIDTH = 0.96
const FIT_HEIGHT = 0.98

// Points sampled from the mascot's actual surface, used for fitting
let mascotPoints = []

function collectMascotPoints() {
  const points = []
  const v = new THREE.Vector3()

  mascot.updateMatrixWorld(true)

  mascot.traverse((object) => {
    const position = object.isMesh && object.geometry?.attributes?.position

    if (!position) return

    const step = Math.max(1, Math.floor(position.count / 1500))

    for (let i = 0; i < position.count; i += step) {
      if (object.getVertexPosition) {
        object.getVertexPosition(i, v)
      } else {
        v.fromBufferAttribute(position, i)
      }

      points.push(v.clone().applyMatrix4(object.matrixWorld))
    }
  })

  return points
}

// How far the mascot reaches toward the canvas edges
// (1 = exactly at the fit line, more = too big, less = too small)
const projected = new THREE.Vector3()

function mascotReach() {
  camera.updateMatrixWorld()

  let reach = 0

  for (const point of mascotPoints) {
    projected.copy(point).project(camera)

    reach = Math.max(
      reach,
      Math.abs(projected.x) / FIT_WIDTH,
      Math.abs(projected.y) / FIT_HEIGHT
    )
  }

  return reach
}

function placeCamera(z) {
  camera.position.set(0, 3, z)
  camera.lookAt(0, 3, 0)
}

function frameCamera() {
  let z = baseCameraZ

  placeCamera(z)

  if (!mascotPoints.length) return

  // Portrait screens (phones, tablets): size the mascot to fill the width.
  // Landscape screens: keep the desktop framing, only back up if cut off.
  const portrait = camera.aspect < 1

  for (let i = 0; i < 8; i++) {
    const reach = mascotReach()

    if (Math.abs(reach - 1) < 0.01) break
    if (!portrait && reach <= 1) break

    z *= reach
    placeCamera(z)
  }
}


// --------------------------------
// RENDERER
// --------------------------------

const renderer = new THREE.WebGLRenderer({
  antialias: true
})

renderer.setPixelRatio(
  Math.min(window.devicePixelRatio, 2)
)

renderer.setSize(
  heroSize().width,
  heroSize().height
)

app.appendChild(renderer.domElement)


// --------------------------------
// LIGHTING
// --------------------------------

const ambientLight = new THREE.AmbientLight(0xffffff, 2)

scene.add(ambientLight)

const directionalLight = new THREE.DirectionalLight(0xffffff, 3)

directionalLight.position.set(2, 4, 5)

scene.add(directionalLight)


// --------------------------------
// MASCOT
// --------------------------------

const loader = new GLTFLoader()

let mascot
let mixer

loader.load(
  '/models/squirkanim1.glb',

  (gltf) => {

    mascot = gltf.scene

    scene.add(mascot)

    // Center the mascot
    const box = new THREE.Box3().setFromObject(mascot)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())

    mascot.position.x -= center.x
    mascot.position.y -= center.y
    mascot.position.z -= center.z

    mascot.rotation.x = -Math.PI / 2
    mascot.rotation.z -= Math.PI / 2

    // Rotating shifts the model off-center, so re-center it left-to-right
    mascot.updateMatrixWorld(true)

    const rotatedBox = new THREE.Box3().setFromObject(mascot)
    const rotatedCenter = rotatedBox.getCenter(new THREE.Vector3())

    mascot.position.x -= rotatedCenter.x

    // Figure out how far the camera needs to be
    const maxDimension = Math.max(size.x, size.y, size.z)

    const distance =
      maxDimension /
      (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))

    baseCameraZ = distance * 0.2

    mascotPoints = collectMascotPoints()
    frameCamera()


    // --------------------------------
    // ANIMATIONS
    // --------------------------------

    if (gltf.animations.length > 0) {

      mixer = new THREE.AnimationMixer(mascot)

      const action = mixer.clipAction(gltf.animations[0])

      action.setLoop(THREE.LoopOnce)
      action.clampWhenFinished = true

      action.play()

      console.log(
        'Animations:',
        gltf.animations.map(animation => animation.name)
      )
    }

    console.log('Mascot loaded!')
  },

  undefined,

  (error) => {
    console.error('Could not load mascot:', error)
  }
)


// --------------------------------
// ANIMATION LOOP
// --------------------------------

const clock = new THREE.Clock()

function animate() {

  requestAnimationFrame(animate)

  const delta = clock.getDelta()

  if (mixer) {
    mixer.update(delta)
  }

  renderer.render(scene, camera)
}

animate()


// --------------------------------
// CANVAS RESIZING
// --------------------------------

// Watches the canvas box itself, so it also catches the jump
// between desktop and phone layouts
new ResizeObserver(() => {

  const { width, height } = heroSize()

  camera.aspect = width / height
  camera.updateProjectionMatrix()
  frameCamera()

  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

}).observe(app)


// --------------------------------
// NAVBAR
// --------------------------------

const navLinks = [...document.querySelectorAll('.nav-link')]
const navPill = document.querySelector('.nav-pill')

function movePill(link) {
  if (!link) return

  navPill.style.left = `${link.offsetLeft}px`
  navPill.style.width = `${link.offsetWidth}px`
}

function setActiveLink(link) {
  navLinks.forEach(item => {
    item.classList.toggle('active', item === link)
  })

  movePill(link)
}

// Smooth-scroll to a section when a link is clicked
let isNavScrolling = false
let cancelPageScroll = null

function stopPageScroll() {
  if (cancelPageScroll) {
    cancelPageScroll()
    cancelPageScroll = null
  }
}

// Let the visitor take over by scrolling themselves
window.addEventListener('wheel', stopPageScroll, { passive: true })
window.addEventListener('touchstart', stopPageScroll, { passive: true })

navLinks.forEach(link => {
  link.addEventListener('click', (e) => {

    const target = document.querySelector(link.getAttribute('href'))

    setActiveLink(link)

    if (!target) return

    e.preventDefault()
    stopPageScroll()

    const to = Math.min(
      target.getBoundingClientRect().top + window.scrollY,
      document.documentElement.scrollHeight - window.innerHeight
    )

    const distance = Math.abs(to - window.scrollY)

    isNavScrolling = true

    cancelPageScroll = animateScroll({
      get: () => window.scrollY,
      set: (y) => window.scrollTo(0, y),
      to,
      duration: Math.min(1200, Math.max(600, distance * 0.6)),
      onDone: () => {
        isNavScrolling = false
        cancelPageScroll = null
        history.replaceState(null, '', link.getAttribute('href'))
      }
    })
  })
})

// Move the pill to whichever section you've scrolled to
const spySections = navLinks
  .map(link => ({
    link,
    section: document.querySelector(link.getAttribute('href'))
  }))
  .filter(item => item.section)

function updateNavFromScroll() {
  if (isNavScrolling) return

  const line = window.innerHeight * 0.4
  let current = spySections[0]

  spySections.forEach(item => {
    if (item.section.getBoundingClientRect().top <= line) {
      current = item
    }
  })

  if (current && !current.link.classList.contains('active')) {
    setActiveLink(current.link)
  }
}

let navTicking = false

window.addEventListener('scroll', () => {
  if (navTicking) return

  navTicking = true

  requestAnimationFrame(() => {
    updateNavFromScroll()
    navTicking = false
  })
}, { passive: true })

// Put the pill under the right link on load
setActiveLink(document.querySelector('.nav-link.active'))
updateNavFromScroll()

// Re-measure once fonts load and when the screen changes size,
// since link widths change
document.fonts.ready.then(() => {
  movePill(document.querySelector('.nav-link.active'))
})

window.addEventListener('resize', () => {
  movePill(document.querySelector('.nav-link.active'))
})


// --------------------------------
// OUR WORK GALLERY
// --------------------------------

const galleryTrack = document.querySelector('.gallery-track')
const gallerySlides = document.querySelectorAll('.collage')
const galleryPrev = document.querySelector('.gallery-prev')
const galleryNext = document.querySelector('.gallery-next')
const galleryDots = document.querySelector('.gallery-dots')
const galleryViewport = document.querySelector('.gallery-viewport')

let galleryIndex = 0

// Make one dot per slide
const dots = [...gallerySlides].map((slide, i) => {
  const dot = document.createElement('button')

  dot.type = 'button'
  dot.className = 'gallery-dot'
  dot.setAttribute('aria-label', `Show photo set ${i + 1}`)
  dot.addEventListener('click', () => goToSlide(i))

  galleryDots.appendChild(dot)
  return dot
})

function goToSlide(i) {
  const total = gallerySlides.length

  // Wraps around: past the last slide goes back to the first
  galleryIndex = (i + total) % total

  galleryTrack.style.transform = `translateX(-${galleryIndex * 100}%)`

  gallerySlides.forEach((slide, n) => {
    slide.setAttribute('aria-hidden', n !== galleryIndex)
  })

  dots.forEach((dot, n) => {
    dot.classList.toggle('is-active', n === galleryIndex)
    dot.setAttribute('aria-current', n === galleryIndex)
  })
}

galleryPrev.addEventListener('click', () => goToSlide(galleryIndex - 1))
galleryNext.addEventListener('click', () => goToSlide(galleryIndex + 1))

// Left/right arrow keys while the gallery has focus
document.querySelector('.gallery-carousel').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') goToSlide(galleryIndex - 1)
  if (e.key === 'ArrowRight') goToSlide(galleryIndex + 1)
})

// Swipe on phones and tablets
let swipeStartX = null

galleryViewport.addEventListener('pointerdown', (e) => {
  swipeStartX = e.clientX
})

galleryViewport.addEventListener('pointerup', (e) => {
  if (swipeStartX === null) return

  const distance = e.clientX - swipeStartX

  if (distance > 50) goToSlide(galleryIndex - 1)
  if (distance < -50) goToSlide(galleryIndex + 1)

  swipeStartX = null
})

galleryViewport.addEventListener('pointercancel', () => {
  swipeStartX = null
})

goToSlide(0)


// --------------------------------
// SERVICES CARDS
// --------------------------------

const servicesTrack = document.querySelector('.services-track')
const serviceCards = [...document.querySelectorAll('.service-card')]
const servicesDots = document.querySelector('.services-dots')

let activeCard = 0
let cardScrolling = false
let cancelCardScroll = null

const serviceDots = serviceCards.map((card, i) => {
  const dot = document.createElement('button')
  const name = card.querySelector('.card-name').textContent

  dot.type = 'button'
  dot.className = 'gallery-dot'
  dot.setAttribute('aria-label', `Show ${name}`)
  dot.addEventListener('click', () => scrollToCard(i))

  servicesDots.appendChild(dot)
  return dot
})

// Scroll position that puts a card exactly in the middle
function centeredLeft(card) {
  return card.offsetLeft - (servicesTrack.clientWidth - card.offsetWidth) / 2
}

function setActiveCard(index) {
  activeCard = index

  serviceCards.forEach((card, i) => {
    card.classList.toggle('is-active', i === index)
  })

  serviceDots.forEach((dot, i) => {
    dot.classList.toggle('is-active', i === index)
    dot.setAttribute('aria-current', i === index)
  })
}

function scrollToCard(i, { instant = false } = {}) {
  const index = Math.max(0, Math.min(i, serviceCards.length - 1))

  setActiveCard(index)

  if (cancelCardScroll) cancelCardScroll()

  const to = centeredLeft(serviceCards[index])

  // Snapping is paused while we glide, so it doesn't fight the animation
  servicesTrack.style.scrollSnapType = 'none'
  cardScrolling = true

  cancelCardScroll = animateScroll({
    get: () => servicesTrack.scrollLeft,
    set: (x) => { servicesTrack.scrollLeft = x },
    to,
    duration: instant ? 0 : 550,
    onDone: () => {
      servicesTrack.style.scrollSnapType = ''
      cardScrolling = false
      cancelCardScroll = null
    }
  })
}

// While swiping, the card nearest the middle becomes the active one
function updateActiveFromScroll() {
  if (cardScrolling) return

  const center = servicesTrack.scrollLeft + servicesTrack.clientWidth / 2

  let closest = 0
  let closestDistance = Infinity

  serviceCards.forEach((card, i) => {
    const distance = Math.abs(card.offsetLeft + card.offsetWidth / 2 - center)

    if (distance < closestDistance) {
      closestDistance = distance
      closest = i
    }
  })

  if (closest !== activeCard) setActiveCard(closest)
}

let servicesTicking = false

servicesTrack.addEventListener('scroll', () => {
  if (servicesTicking) return

  servicesTicking = true

  requestAnimationFrame(() => {
    updateActiveFromScroll()
    servicesTicking = false
  })
}, { passive: true })

// If the visitor starts swiping mid-glide, hand control back to them
function stopCardScroll() {
  if (cancelCardScroll) cancelCardScroll()
}

servicesTrack.addEventListener('pointerdown', stopCardScroll)
servicesTrack.addEventListener('wheel', stopCardScroll, { passive: true })

// On computers the cards sit in a plain row (see style.css),
// so there's nothing to slide
const ROW_MODE = window.matchMedia(
  '(min-width: 1000px) and (hover: hover) and (pointer: fine)'
)

// Clicking a faded card slides it to the center
serviceCards.forEach((card, i) => {
  card.addEventListener('click', (e) => {
    if (ROW_MODE.matches) return
    if (i === activeCard) return

    e.preventDefault()
    scrollToCard(i)
  })
})

document.querySelector('.services-prev')
  .addEventListener('click', () => scrollToCard(activeCard - 1))

document.querySelector('.services-next')
  .addEventListener('click', () => scrollToCard(activeCard + 1))

// Left/right arrow keys when the row has focus
servicesTrack.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    scrollToCard(activeCard - 1)
  }

  if (e.key === 'ArrowRight') {
    e.preventDefault()
    scrollToCard(activeCard + 1)
  }
})

// Keep the current card centered when the screen changes size
new ResizeObserver(() => {
  scrollToCard(activeCard, { instant: true })
}).observe(servicesTrack)

setActiveCard(0)


// --------------------------------
// FAQS
// --------------------------------

const faqTabs = [...document.querySelectorAll('.faq-tab')]
const faqPanels = [...document.querySelectorAll('.faq-panel')]

function closeAllQuestions(panel) {
  panel.querySelectorAll('.faq-q button').forEach(button => {
    button.setAttribute('aria-expanded', 'false')
    document.getElementById(button.getAttribute('aria-controls'))
      .classList.remove('is-open')
  })
}

function selectFaqTab(tab, { focus = false } = {}) {
  faqTabs.forEach(item => {
    const active = item === tab

    item.classList.toggle('is-active', active)
    item.setAttribute('aria-selected', active)
    item.tabIndex = active ? 0 : -1
  })

  faqPanels.forEach(panel => {
    const active = panel.id === tab.getAttribute('aria-controls')

    panel.hidden = !active
    panel.classList.toggle('is-active', active)

    if (!active) closeAllQuestions(panel)
  })

  if (focus) tab.focus()
}

faqTabs.forEach((tab, i) => {
  tab.addEventListener('click', () => selectFaqTab(tab))

  // Arrow keys move between categories
  tab.addEventListener('keydown', (e) => {
    const keys = {
      ArrowRight: 1, ArrowDown: 1,
      ArrowLeft: -1, ArrowUp: -1
    }

    if (!(e.key in keys)) return

    e.preventDefault()

    const next = faqTabs[(i + keys[e.key] + faqTabs.length) % faqTabs.length]
    selectFaqTab(next, { focus: true })
  })
})

// One question open at a time within a category
document.querySelectorAll('.faq-q button').forEach(button => {
  button.addEventListener('click', () => {
    const answer = document.getElementById(button.getAttribute('aria-controls'))
    const opening = button.getAttribute('aria-expanded') !== 'true'

    closeAllQuestions(button.closest('.faq-panel'))

    button.setAttribute('aria-expanded', opening)
    answer.classList.toggle('is-open', opening)
  })
})


// --------------------------------
// CURSOR: CIRCLE THAT SPLATS ON CLICK
// --------------------------------

const hasMouse = window.matchMedia('(hover: hover) and (pointer: fine)')

// Colors a splat can be (picked at random each click)
const SPLAT_COLORS = ['#AE2D80', '#592D8A', '#2A9A94', '#8CC152', '#ECD45E']

const SPLAT_SHAPE = `
  <svg viewBox="0 0 32 32" width="56" height="56" aria-hidden="true">
    <g fill="currentColor">
      <path d="M26.6 15.5Q26.8 16.0 26.6 16.5Q26.4 17.0 26.1 17.4Q25.8 17.8 25.6 18.2Q25.4 18.6 25.3 19.1Q25.2 19.5 25.1 20.0Q25.0 20.4 24.8 20.8Q24.5 21.2 24.0 21.4Q23.6 21.7 23.1 21.8Q22.6 22.0 22.2 22.2Q21.8 22.3 21.5 22.5Q21.1 22.7 20.7 22.7Q20.3 22.8 19.7 22.6Q19.2 22.5 18.7 22.0Q18.1 21.6 17.7 21.2Q17.2 20.8 17.0 20.7Q16.7 20.6 16.6 21.0Q16.4 21.4 16.3 22.2Q16.1 23.0 15.8 23.8Q15.5 24.7 15.1 25.2Q14.6 25.7 14.2 25.8Q13.8 25.9 13.4 25.7Q13.0 25.5 12.6 25.2Q12.3 24.9 11.9 24.7Q11.5 24.5 11.2 24.3Q10.8 24.1 10.5 23.8Q10.2 23.5 10.0 23.1Q9.9 22.7 9.7 22.3Q9.6 21.9 9.4 21.6Q9.2 21.3 8.8 21.1Q8.4 21.0 8.0 20.8Q7.5 20.6 7.2 20.3Q7.0 20.0 7.0 19.5Q7.1 19.1 7.4 18.6Q7.8 18.1 8.2 17.6Q8.6 17.2 8.7 16.9Q8.8 16.6 8.5 16.3Q8.1 16.0 7.5 15.6Q6.9 15.2 6.4 14.8Q5.8 14.3 5.6 13.8Q5.4 13.3 5.6 12.9Q5.7 12.4 6.1 12.1Q6.5 11.8 6.8 11.5Q7.2 11.2 7.6 11.0Q7.9 10.7 8.4 10.5Q8.8 10.3 9.3 10.3Q9.8 10.3 10.3 10.3Q10.8 10.4 11.2 10.4Q11.6 10.4 11.7 10.1Q11.9 9.8 12.0 9.3Q12.1 8.7 12.2 8.0Q12.3 7.3 12.6 6.9Q12.9 6.4 13.4 6.4Q13.8 6.4 14.3 6.7Q14.7 7.1 15.1 7.5Q15.5 7.9 15.8 8.0Q16.2 8.2 16.6 8.1Q16.9 7.9 17.4 7.7Q17.8 7.4 18.2 7.3Q18.7 7.2 19.1 7.3Q19.5 7.5 19.7 7.8Q20.0 8.2 20.2 8.6Q20.4 9.0 20.6 9.3Q20.8 9.7 21.0 10.0Q21.1 10.4 21.1 10.8Q21.1 11.3 21.0 11.8Q20.8 12.3 20.6 12.7Q20.4 13.2 20.5 13.4Q20.5 13.7 21.0 13.8Q21.4 13.8 22.3 13.9Q23.1 14.0 24.1 14.1Q25.1 14.3 25.7 14.7Q26.4 15.0 26.6 15.5Z"/>
      <circle cx="27.2" cy="7" r="2.4"/>
      <circle cx="4.6" cy="25.8" r="2"/>
      <circle cx="27.6" cy="25.6" r="1.4"/>
      <circle cx="6" cy="5.6" r="1.2"/>
      <circle cx="3.4" cy="15" r="1"/>
    </g>
  </svg>
`

const CLICKABLE = 'a, button, [role="tab"], .face-disk, label, .package-option'
const TYPING = 'input:not([type="radio"]):not([type="checkbox"]), textarea, select'

if (hasMouse.matches) {

  const dot = document.createElement('div')
  dot.className = 'cursor-dot is-hidden'
  dot.innerHTML = '<div class="cursor-ball"></div>'
  document.body.appendChild(dot)

  document.documentElement.classList.add('has-custom-cursor')

  let x = -100
  let y = -100
  let moved = false

  window.addEventListener('mousemove', (e) => {
    x = e.clientX
    y = e.clientY

    if (!moved) {
      moved = true
      requestAnimationFrame(() => {
        dot.style.transform = `translate3d(${x}px, ${y}px, 0)`
        moved = false
      })
    }

    // Over text boxes, show the normal typing cursor instead
    const typing = e.target.closest?.(TYPING)

    dot.classList.toggle('is-hidden', !!typing)
    dot.classList.toggle('is-hovering', !typing && !!e.target.closest?.(CLICKABLE))
  }, { passive: true })

  // Hide it when the mouse leaves the window
  document.addEventListener('mouseleave', () => dot.classList.add('is-hidden'))
  document.addEventListener('mouseenter', () => dot.classList.remove('is-hidden'))

  window.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return

    dot.classList.add('is-pressed')

    if (reduceMotion.matches) return

    const splat = document.createElement('div')

    splat.className = 'cursor-splat'
    splat.innerHTML = SPLAT_SHAPE
    splat.style.left = `${e.clientX}px`
    splat.style.top = `${e.clientY}px`
    splat.style.color =
      SPLAT_COLORS[Math.floor(Math.random() * SPLAT_COLORS.length)]
    splat.style.setProperty('--spin', `${Math.floor(Math.random() * 360)}deg`)

    splat.addEventListener('animationend', () => splat.remove())

    document.body.appendChild(splat)
  })

  window.addEventListener('mouseup', () => dot.classList.remove('is-pressed'))
}


// --------------------------------
// BOOK NOW FORM
// --------------------------------

// Where requests go. Two options:
//  1. Make a free form at https://formspree.io and paste its URL here,
//     e.g. 'https://formspree.io/f/abcdwxyz'. Requests land in your inbox.
//  2. Leave it empty and the form opens the visitor's email app
//     with everything filled in, addressed to BOOKING_EMAIL.
const BOOKING_FORM_ENDPOINT = ''
const BOOKING_EMAIL = 'YOUR_EMAIL@gmail.com'

const bookForm = document.querySelector('.book-form')
const bookSuccess = document.querySelector('.book-success')
const bookSubmit = document.querySelector('.book-submit')

// No booking dates in the past
const dateInput = document.querySelector('#book-date')
const today = new Date()
today.setMinutes(today.getMinutes() - today.getTimezoneOffset())
dateInput.min = today.toISOString().split('T')[0]

function showBookSuccess() {
  bookForm.hidden = true
  bookSuccess.hidden = false
  bookSuccess.focus()
}

function bookingEmailBody(data) {
  const lines = [
    ['Name', data.get('name')],
    ['Email', data.get('email')],
    ['Phone', data.get('phone')],
    ['Event type', data.get('event_type')],
    ['Date', data.get('date')],
    ['Start time', data.get('start_time')],
    ['City or venue', data.get('location')],
    ['Guests', data.get('guests')],
    ['Package', data.get('package')],
    ['Glitter tattoos add-on', data.get('addon') ? 'Yes' : 'No'],
    ['Notes', data.get('message')]
  ]

  return lines
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n')
}

bookForm.addEventListener('submit', async (e) => {
  e.preventDefault()

  bookForm.classList.add('was-submitted')

  if (!bookForm.checkValidity()) {
    bookForm.reportValidity()
    return
  }

  const data = new FormData(bookForm)

  // No form service set up yet: open their email app instead
  if (!BOOKING_FORM_ENDPOINT) {
    const subject = `Booking request: ${data.get('event_type')} on ${data.get('date')}`

    window.location.href =
      `mailto:${BOOKING_EMAIL}` +
      `?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(bookingEmailBody(data))}`

    showBookSuccess()
    return
  }

  bookSubmit.disabled = true
  bookSubmit.textContent = 'Sending…'

  try {
    const response = await fetch(BOOKING_FORM_ENDPOINT, {
      method: 'POST',
      body: data,
      headers: { Accept: 'application/json' }
    })

    if (!response.ok) throw new Error('Request failed')

    showBookSuccess()
  } catch {
    bookSubmit.disabled = false
    bookSubmit.textContent = 'Send booking request'

    alert(
      'Sorry, that didn’t go through. Please try again, or email us at ' +
      BOOKING_EMAIL
    )
  }
})


// --------------------------------
// SMOOTH SCROLL FOR OTHER IN-PAGE LINKS
// (Book buttons on cards, "Send us a message", etc.)
// --------------------------------

// Which package each service card's button picks in the form
const CARD_TO_PACKAGE = {
  'card-basic': 'Basic Package',
  'card-deluxe': 'Deluxe Package',
  'card-glitter': 'Glitter Package'
}

function prefillFromCard(card) {
  if (!card) return

  if (card.classList.contains('card-addon')) {
    document.querySelector('.addon-option input').checked = true
    return
  }

  const key = Object.keys(CARD_TO_PACKAGE).find(k => card.classList.contains(k))
  const radio = key &&
    bookForm.querySelector(`input[name="package"][value="${CARD_TO_PACKAGE[key]}"]`)

  if (radio) radio.checked = true
}

document.querySelectorAll('a[href^="#"]:not(.nav-link)').forEach(link => {
  link.addEventListener('click', (e) => {
    const target = document.querySelector(link.getAttribute('href'))

    if (!target) return

    e.preventDefault()

    prefillFromCard(link.closest('.service-card'))

    stopPageScroll()

    const to = Math.min(
      target.getBoundingClientRect().top + window.scrollY,
      document.documentElement.scrollHeight - window.innerHeight
    )

    cancelPageScroll = animateScroll({
      get: () => window.scrollY,
      set: (y) => window.scrollTo(0, y),
      to,
      duration: Math.min(1200, Math.max(600, Math.abs(to - window.scrollY) * 0.6)),
      onDone: () => { cancelPageScroll = null }
    })
  })
})