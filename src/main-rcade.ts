import { Howl } from 'howler'
import { PLAYER_1 } from '@rcade/plugin-input-classic'
import './style.css'

// Setup DOM
const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <div id="instructions">hold A + move joystick to boing!</div>
  <canvas id="canvas"></canvas>
  <div id="boingCount">you've boinged 0 times</div>
`

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const instructionsEl = document.getElementById('instructions')!
const boingCountEl = document.getElementById('boingCount')!
let hasBoingdOnce = false

// --- Physics Configuration ---
const basePos = { x: 17, y: 200 }
let restLength = 250

// Canvas sizing - fit to window, max 600 on desktop
const CANVAS_HEIGHT = 400
const MAX_CANVAS_WIDTH = 600

function resizeCanvas() {
  const maxWidth = Math.min(window.innerWidth * 0.9 - 24, MAX_CANVAS_WIDTH)
  canvas.width = maxWidth
  canvas.height = CANVAS_HEIGHT
  restLength = Math.min((canvas.width - basePos.x) * 0.65, 250)
}

resizeCanvas()
window.addEventListener('resize', () => {
  resizeCanvas()
  knobPos.x = basePos.x + restLength
  knobPos.y = basePos.y
  currentLength = restLength
  currentAngle = 0
  lengthVelocity = 0
  angularVelocity = 0
})

// Boing count (no localStorage in rcade)
let boingCount = 0

// Spring physics
const springStiffness = 0.95
const friction = 0.88

// Visual "Bendiness"
const bendStiffness = 150

// Resistance Configuration
const pullLimit = 300
const pushLimit = 400

// State
let knobPos = { x: basePos.x + restLength, y: basePos.y }
let isDragging = false
let joystickPos = { x: 0, y: 0 } // Normalized -1 to 1
let lastTime = 0
const targetFrameTime = 1000 / 60

// Polar physics state
let currentLength = restLength
let currentAngle = 0
let lengthVelocity = 0
let angularVelocity = 0
const angularFriction = 0.9

// Initialize knob position
knobPos.x = basePos.x + restLength

// Audio
const boingSound = new Howl({
  src: ['/boing2.wav'],
  preload: true,
  volume: 0.7,
  html5: false,
  onloaderror: (_id, err) => console.error('Failed to load boing sound:', err),
  onplayerror: (_id, err) => console.error('Failed to play boing sound:', err),
})

let activeSoundIds: number[] = []

function fadeOutActiveSounds() {
  activeSoundIds.forEach(id => {
    const currentVol = boingSound.volume(id) as number
    boingSound.fade(currentVol, 0, 100, id)
  })
  activeSoundIds = []
}


function triggerBoing(forceMagnitude: number) {
  const minRate = 0.9 * 1.1
  const maxRate = 1.5 * 1.1
  const normalizedForce = Math.min(forceMagnitude / 200, 1)
  const rate = minRate + normalizedForce * (maxRate - minRate)

  const minVolume = 0.3
  const maxVolume = 1.0
  const volume = minVolume + normalizedForce * (maxVolume - minVolume)

  const id = boingSound.play()
  boingSound.rate(rate, id)
  boingSound.volume(volume, id)
  activeSoundIds.push(id)

  boingSound.fade(volume, 0.1, 1900, id)

  boingSound.once('end', () => {
    activeSoundIds = activeSoundIds.filter(sid => sid !== id)
  }, id)

  boingCount++
  boingCountEl.textContent = `you've boinged ${boingCount} time${boingCount === 1 ? '' : 's'}`

  if (!hasBoingdOnce) {
    hasBoingdOnce = true
    instructionsEl.style.display = 'none'
  }
}

// Track previous A button state for edge detection
let wasAPressed = false

function handleJoystickInput() {
  const aPressed = PLAYER_1.A

  // Read joystick as normalized values (-1 to 1)
  let jx = 0
  let jy = 0
  if (PLAYER_1.DPAD.left) jx = -1
  if (PLAYER_1.DPAD.right) jx = 1
  if (PLAYER_1.DPAD.up) jy = -1
  if (PLAYER_1.DPAD.down) jy = 1

  // Handle A press (start drag)
  if (aPressed && !wasAPressed) {
    // Starting drag - fade out any playing sounds
    const speed = Math.abs(lengthVelocity) + Math.abs(angularVelocity) * currentLength
    if (speed > 1) {
      fadeOutActiveSounds()
    }
    isDragging = true
  }

  // Handle A release (end drag, trigger boing)
  if (!aPressed && wasAPressed) {
    if (isDragging) {
      isDragging = false
      const dx = knobPos.x - (basePos.x + restLength)
      const dy = knobPos.y - basePos.y
      const displacement = Math.hypot(dx, dy)

      if (displacement > 10) {
        triggerBoing(displacement)
      }
    }
  }

  wasAPressed = aPressed

  // Update joystick position for physics
  joystickPos.x = jx
  joystickPos.y = jy
}

// --- Physics Engine ---
function updatePhysics(deltaTime: number) {
  const maxStep = 16
  const steps = Math.ceil(deltaTime / maxStep)
  const stepTime = deltaTime / steps

  for (let i = 0; i < steps; i++) {
    updatePhysicsStep(stepTime)
  }
}

function updatePhysicsStep(deltaTime: number) {
  const timeScale = deltaTime / targetFrameTime

  if (isDragging) {
    // Joystick controls the target position - ball lerps toward it smoothly
    const targetX = basePos.x + restLength + joystickPos.x * 250
    const targetY = basePos.y + joystickPos.y * 250

    // Smooth lerp toward target (lerp factor based on timeScale)
    const lerpSpeed = 0.15 * timeScale
    let goalX = knobPos.x + (targetX - knobPos.x) * lerpSpeed
    let goalY = knobPos.y + (targetY - knobPos.y) * lerpSpeed

    let dx = goalX - basePos.x
    let dy = goalY - basePos.y

    // Wall constraint
    if (dx < 0) dx = 0

    const mouseDist = Math.hypot(dx, dy)
    const angle = Math.atan2(dy, dx)

    const offset = mouseDist - restLength
    let newDist = restLength

    if (offset > 0) {
      newDist = restLength + (offset / (1 + offset / pullLimit))
    } else {
      const absOffset = Math.abs(offset)
      newDist = restLength - (absOffset / (1 + absOffset / pushLimit))
      if (newDist < 20) newDist = 20
    }

    knobPos.x = basePos.x + Math.cos(angle) * newDist
    knobPos.y = basePos.y + Math.sin(angle) * newDist

    const minX = basePos.x + 16
    if (knobPos.x < minX) {
      knobPos.x = minX
    }

    currentLength = Math.hypot(knobPos.x - basePos.x, knobPos.y - basePos.y)
    currentAngle = Math.atan2(knobPos.y - basePos.y, knobPos.x - basePos.x)
    lengthVelocity = 0
    angularVelocity = 0
  } else {
    // Polar spring physics
    const lengthAccel = (restLength - currentLength) * springStiffness * timeScale
    lengthVelocity += lengthAccel
    lengthVelocity *= Math.pow(friction, timeScale)
    currentLength += lengthVelocity * timeScale

    const angleAccel = -currentAngle * 0.9 * timeScale
    angularVelocity += angleAccel
    angularVelocity *= Math.pow(angularFriction, timeScale)
    currentAngle += angularVelocity * timeScale

    if (currentLength < 16) {
      currentLength = 16
      lengthVelocity *= -0.5
    }

    knobPos.x = basePos.x + Math.cos(currentAngle) * currentLength
    knobPos.y = basePos.y + Math.sin(currentAngle) * currentLength

    const minX = basePos.x + 16
    if (knobPos.x < minX) {
      knobPos.x = minX
      if (Math.abs(currentAngle) > Math.PI / 2) {
        currentAngle = Math.sign(currentAngle) * Math.PI - currentAngle
        angularVelocity *= -0.5
      }
      currentLength = Math.hypot(knobPos.x - basePos.x, knobPos.y - basePos.y)
      lengthVelocity *= -0.5
    }
  }

  // Sanity check
  const isInvalid = !Number.isFinite(currentLength) ||
    !Number.isFinite(currentAngle) ||
    !Number.isFinite(lengthVelocity) ||
    !Number.isFinite(angularVelocity) ||
    Math.abs(lengthVelocity) > 10000 ||
    Math.abs(angularVelocity) > 1000

  if (isInvalid) {
    knobPos.x = basePos.x + restLength
    knobPos.y = basePos.y
    currentLength = restLength
    currentAngle = 0
    lengthVelocity = 0
    angularVelocity = 0
  }
}

// --- Drawing ---
function drawSpring() {
  const p0 = basePos
  const p2 = knobPos

  const currentLen = Math.hypot(p2.x - p0.x, p2.y - p0.y)
  const dynamicStiffness = Math.min(bendStiffness, currentLen * 0.5)
  const p1 = { x: basePos.x + dynamicStiffness, y: basePos.y }

  ctx.beginPath()
  ctx.moveTo(basePos.x, basePos.y)

  const coils = 25
  const steps = 100

  for (let i = 0; i <= steps; i++) {
    const t = i / steps

    const oneMinusT = 1 - t
    const bx = oneMinusT * oneMinusT * p0.x + 2 * oneMinusT * t * p1.x + t * t * p2.x
    const by = oneMinusT * oneMinusT * p0.y + 2 * oneMinusT * t * p1.y + t * t * p2.y

    const tx = 2 * oneMinusT * (p1.x - p0.x) + 2 * t * (p2.x - p1.x)
    const ty = 2 * oneMinusT * (p1.y - p0.y) + 2 * t * (p2.y - p1.y)

    const len = Math.hypot(tx, ty)
    const nx = -ty / len
    const ny = tx / len

    let width = 25 * (1.2 - t)
    if (currentLen < restLength) {
      const bulge = 1 + ((restLength - currentLen) / restLength)
      width *= bulge
    }

    const sine = Math.sin(t * coils * Math.PI * 2)
    const finalX = bx + nx * sine * width
    const finalY = by + ny * sine * width

    ctx.lineTo(finalX, finalY)
  }

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 3
  ctx.strokeStyle = '#444'

  ctx.shadowColor = 'rgba(0,0,0,0.3)'
  ctx.shadowBlur = 4
  ctx.shadowOffsetY = 4

  ctx.stroke()

  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
}

function drawKnob() {
  ctx.beginPath()
  ctx.arc(knobPos.x, knobPos.y, 16, 0, Math.PI * 2)

  const grad = ctx.createRadialGradient(
    knobPos.x - 4, knobPos.y - 4, 2,
    knobPos.x, knobPos.y, 16
  )
  grad.addColorStop(0, '#ff6b6b')
  grad.addColorStop(1, '#c23616')

  ctx.fillStyle = grad
  ctx.fill()
  ctx.strokeStyle = '#2d3436'
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.beginPath()
  ctx.ellipse(knobPos.x - 6, knobPos.y - 6, 4, 2, Math.PI / 4, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.fill()
}

function draw(currentTime: number) {
  if (lastTime === 0) lastTime = currentTime
  const deltaTime = Math.min(currentTime - lastTime, 50)
  lastTime = currentTime

  // Handle joystick input
  handleJoystickInput()

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // Wall
  ctx.fillStyle = '#ccc'
  ctx.fillRect(0, 0, basePos.x, canvas.height)
  ctx.strokeStyle = '#aaa'
  ctx.beginPath()
  ctx.moveTo(basePos.x, 0)
  ctx.lineTo(basePos.x, canvas.height)
  ctx.stroke()

  // Target indicator while dragging
  if (isDragging) {
    const targetX = basePos.x + restLength + joystickPos.x * 250
    const targetY = basePos.y + joystickPos.y * 250

    ctx.beginPath()
    ctx.moveTo(knobPos.x, knobPos.y)
    ctx.lineTo(targetX, targetY)
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.setLineDash([])

    ctx.beginPath()
    ctx.arc(targetX, targetY, 4, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fill()
  }

  drawSpring()
  drawKnob()

  updatePhysics(deltaTime)
  requestAnimationFrame(draw)
}

requestAnimationFrame(draw)
