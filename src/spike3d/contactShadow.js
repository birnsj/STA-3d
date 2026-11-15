import * as THREE from 'three'

// Soft foot fill for the Three overlay. Mesh cast shadows land on Spike3dScene's ShadowMaterial
// floor; this blob only softens the contact under the feet.

let sharedTexture = null

function shadowTexture() {
  if (sharedTexture) return sharedTexture
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size * 0.48)
  g.addColorStop(0, 'rgba(0,0,0,0.55)')
  g.addColorStop(0.45, 'rgba(0,0,0,0.22)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  sharedTexture = new THREE.CanvasTexture(canvas)
  sharedTexture.colorSpace = THREE.SRGBColorSpace
  sharedTexture.needsUpdate = true
  return sharedTexture
}

/** Ellipse on the floor under the feet. Parent at actor root; stays world-flat. */
export function createContactShadow({ width = 0.95, depth = 0.55 } = {}) {
  const geo = new THREE.PlaneGeometry(width, depth)
  const mat = new THREE.MeshBasicMaterial({
    map: shadowTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.85,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.name = 'contact_shadow'
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = 0.02
  mesh.renderOrder = -1
  mesh.frustumCulled = false
  // Foot blob must not cast into the hybrid floor shadow map.
  mesh.castShadow = false
  mesh.receiveShadow = false
  return mesh
}

/** Base opacity when mesh cast shadows are on (keeps a soft foot fill without doubling the silhouette). */
export const CONTACT_SHADOW_FILL_OPACITY = 0.18
/** Horses are large — keep the foot blob faint so it does not stack with the cast umbra. */
export const HORSE_CONTACT_SHADOW_FILL_OPACITY = 0.06
