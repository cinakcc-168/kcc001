/**
 * Fly-to-Cart visual animation engine
 * Handles flying the product image/card smoothly toward the cart/bill container
 * with realistic parabolic curve physics, rotation, scale reduction, and landing pulse.
 */

export function triggerFlyToCart({
  event = null,
  sourceElement = null,
  product = null,
  targetSelector = null,
  customImage = null
} = {}) {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  // 1. Identify source element and bounding box
  const triggerEl = sourceElement || event?.currentTarget || (event?.target?.closest ? event.target.closest("button, article, .sale-product-card, .public-product-card") : null);
  if (!triggerEl) return;

  const sourceImg = triggerEl.querySelector("img, .sale-product-image, .public-product-image, .sale-product-media") || triggerEl;
  const startRect = sourceImg.getBoundingClientRect();
  if (startRect.width <= 0 || startRect.height <= 0) return;

  // 2. Identify destination cart element
  const candidateSelectors = [
    targetSelector,
    ".sale-cart-lines-count",
    ".sale-cart-heading",
    ".sale-cart-lines-panel",
    ".sale-cart .sale-cart-lines",
    ".sale-cart",
    ".sale-checkout-panel",
    ".public-cart-bar",
    ".public-floating-cart-button",
    ".public-storefront-cart-button",
    ".cart-empty",
    ".sale-cart-actions .pay-button"
  ].filter(Boolean);

  let targetEl = null;
  for (const selector of candidateSelectors) {
    const el = document.querySelector(selector);
    if (el && el.offsetParent !== null) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        targetEl = el;
        break;
      }
    }
  }

  // Fallback destination coordinates (top-right side of screen or viewport edge)
  let targetX = window.innerWidth - 90;
  let targetY = 120;

  if (targetEl) {
    const targetRect = targetEl.getBoundingClientRect();
    targetX = targetRect.left + Math.min(targetRect.width * 0.45, 120);
    targetY = targetRect.top + Math.min(targetRect.height * 0.4, 90);
  }

  // 3. Resolve product image or fallback
  const rawImage = customImage
    || (typeof product?.image === "string" ? product.image : product?.image?.secure_url)
    || product?.image_url
    || (sourceImg instanceof HTMLImageElement ? sourceImg.src : sourceImg.querySelector?.("img")?.src);

  // 4. Create floating particle container
  const particle = document.createElement("div");
  particle.className = "flying-product-particle";
  
  // Set initial fixed geometry matching source image exactly
  particle.style.position = "fixed";
  particle.style.left = `${startRect.left}px`;
  particle.style.top = `${startRect.top}px`;
  particle.style.width = `${startRect.width}px`;
  particle.style.height = `${startRect.height}px`;
  particle.style.pointerEvents = "none";
  particle.style.zIndex = "99999";
  particle.style.overflow = "hidden";
  particle.style.borderRadius = "14px";
  particle.style.boxShadow = "0 14px 34px rgba(0, 0, 0, 0.28), 0 0 0 1px rgba(255, 255, 255, 0.25)";
  particle.style.willChange = "transform, opacity, border-radius";
  particle.style.transformOrigin = "center center";

  if (rawImage) {
    const img = document.createElement("img");
    img.src = rawImage;
    img.alt = product?.name || "Product";
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "cover";
    img.style.display = "block";
    particle.appendChild(img);
  } else {
    // Elegant fallback icon container
    particle.style.display = "flex";
    particle.style.alignItems = "center";
    particle.style.justifyContent = "center";
    particle.style.background = "linear-gradient(135deg, var(--accent, #3b82f6) 0%, #1d4ed8 100%)";
    particle.style.color = "#ffffff";
    particle.style.fontWeight = "bold";
    particle.style.fontSize = "14px";
    particle.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="8" cy="21" r="1"></circle>
        <circle cx="19" cy="21" r="1"></circle>
        <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"></path>
      </svg>
    `;
  }

  document.body.appendChild(particle);

  // 5. Parabolic arc flight calculations
  const startX = startRect.left + startRect.width / 2;
  const startY = startRect.top + startRect.height / 2;
  const deltaX = targetX - startX;
  const deltaY = targetY - startY;

  // Arc lift height: lift upward slightly relative to travel distance
  const arcLift = Math.min(70, Math.max(30, Math.abs(deltaX) * 0.1));

  const keyframes = [
    {
      transform: "translate3d(0px, 0px, 0) scale(1) rotate(0deg)",
      opacity: 1,
      borderRadius: "14px",
      offset: 0
    },
    {
      transform: `translate3d(${deltaX * 0.28}px, ${deltaY * 0.1 - arcLift}px, 0) scale(0.92) rotate(-2deg)`,
      opacity: 0.98,
      borderRadius: "16px",
      offset: 0.25
    },
    {
      transform: `translate3d(${deltaX * 0.65}px, ${deltaY * 0.48 - (arcLift * 0.35)}px, 0) scale(0.68) rotate(-5deg)`,
      opacity: 0.92,
      borderRadius: "22px",
      offset: 0.6
    },
    {
      transform: `translate3d(${deltaX * 0.88}px, ${deltaY * 0.82}px, 0) scale(0.42) rotate(-9deg)`,
      opacity: 0.75,
      borderRadius: "32px",
      offset: 0.85
    },
    {
      transform: `translate3d(${deltaX}px, ${deltaY}px, 0) scale(0.12) rotate(-12deg)`,
      opacity: 0,
      borderRadius: "50%",
      offset: 1
    }
  ];

  const duration = 780;

  try {
    const animation = particle.animate(keyframes, {
      duration,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "forwards"
    });

    const cleanup = () => {
      if (particle.parentNode) {
        particle.parentNode.removeChild(particle);
      }
    };

    animation.onfinish = cleanup;
    animation.oncancel = cleanup;

    // Safety timeout fallback
    setTimeout(cleanup, duration + 100);
  } catch (_err) {
    if (particle.parentNode) {
      particle.parentNode.removeChild(particle);
    }
  }
}
